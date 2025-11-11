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
