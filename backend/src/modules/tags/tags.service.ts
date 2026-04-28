import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CachedService } from '../../infra/redis/cached.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { TagDto } from './dto/tag.dto';

// Popular-tags listing is locale-independent (displayName lives on the Tag
// row, not a translation table), so a single cache key suffices per limit.
const POPULAR_CACHE_KEY = (limit: number) => `cache:tags:popular:v1:limit:${limit}`;
// 10 min: usage counts shift on a slow timescale (batched by the
// search-index worker). Admin merges/renames invalidate explicitly.
const POPULAR_CACHE_TTL_SECONDS = 600;
const POPULAR_DEFAULT_LIMIT = 24;
const POPULAR_MAX_LIMIT = 50;

@Injectable()
export class TagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cached: CachedService,
  ) {}

  /** Normalise a free-form display name into a slug. */
  toSlug(displayName: string): string {
    return displayName
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 50);
  }

  /**
   * Autocomplete during publish: prefix match on slug or displayName, ranked
   * by current usage count. Limit hard-capped at 20 to keep responses small.
   * Not cached — `q` is high-cardinality, hit rate would be poor and the
   * key explosion isn't worth it (will be Meilisearch-backed in P1).
   */
  async autocomplete(q: string, limit: number): Promise<TagDto[]> {
    const needle = q.trim();
    if (!needle) return [];
    const cappedLimit = Math.min(Math.max(limit, 1), 20);
    const where: Prisma.TagWhereInput = {
      OR: [
        { slug: { startsWith: needle.toLowerCase() } },
        { displayName: { contains: needle, mode: 'insensitive' } },
      ],
    };
    const tags = await this.prisma.tag.findMany({
      where,
      take: cappedLimit,
      include: { _count: { select: { assets: true } } },
      orderBy: [{ assets: { _count: 'desc' } }, { displayName: 'asc' }],
    });
    return tags.map((t) => ({
      id: t.id,
      slug: t.slug,
      displayName: t.displayName,
      usageCount: t._count.assets,
    }));
  }

  /**
   * Most-used tags overall, ranked by `TagUsage.usageCount` (denormalised by
   * the search-index batch worker). Returned ordered desc by usage, then by
   * displayName as a tiebreaker. Cached in Redis for 10 minutes — usage
   * shifts on a slow timescale and admin merge/rename calls
   * `invalidatePopularCache()` directly.
   */
  async popular(limit?: number): Promise<TagDto[]> {
    const cappedLimit = Math.min(Math.max(limit ?? POPULAR_DEFAULT_LIMIT, 1), POPULAR_MAX_LIMIT);
    return this.cached.getOrFetch<TagDto[]>(
      POPULAR_CACHE_KEY(cappedLimit),
      POPULAR_CACHE_TTL_SECONDS,
      () => this.computePopular(cappedLimit),
    );
  }

  private async computePopular(limit: number): Promise<TagDto[]> {
    const rows = await this.prisma.tag.findMany({
      where: { usage: { is: { usageCount: { gt: 0 } } } },
      include: { usage: true },
      orderBy: [{ usage: { usageCount: 'desc' } }, { displayName: 'asc' }],
      take: limit,
    });
    return rows.map((t) => ({
      id: t.id,
      slug: t.slug,
      displayName: t.displayName,
      usageCount: t.usage?.usageCount ?? 0,
    }));
  }

  /**
   * Drops the cached popular-tag listings. Iterates the (small, bounded)
   * range of supported limit values rather than relying on a Redis SCAN.
   */
  async invalidatePopularCache(): Promise<void> {
    const keys: string[] = [];
    for (let n = 1; n <= POPULAR_MAX_LIMIT; n++) keys.push(POPULAR_CACHE_KEY(n));
    await this.cached.invalidate(...keys);
  }

  /** Upserts a set of display names into Tag rows, returning the persisted rows. */
  async upsertMany(displayNames: string[], tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const unique = Array.from(new Set(displayNames.map((d) => d.trim()).filter(Boolean)));
    return Promise.all(
      unique.map((displayName) => {
        const slug = this.toSlug(displayName);
        return client.tag.upsert({
          where: { slug },
          create: { slug, displayName },
          update: { displayName },
        });
      }),
    );
  }
}
