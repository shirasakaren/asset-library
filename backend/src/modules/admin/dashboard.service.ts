import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';

const CACHE_KEY = 'admin:dashboard';
const CACHE_TTL_SECONDS = 30;

interface SeriesPoint {
  date: string;
  count: number;
}

interface StorageBlock {
  totalBytes: string;
  sourceBytes: string;
  derivedBytes: string;
  thumbsBytes: string;
  featuredBannersBytes: string;
  editorMediaBytes: string;
}

interface DashboardCounts {
  users: number;
  assetsPublished: number;
  assetsDraft: number;
  assetsArchived: number;
  downloadsLast30d: number;
  pendingReports: number;
  pendingRequests: number;
  infectedVersions: number;
}

interface TopAssetRow {
  id: string;
  title: string;
  downloads: number;
  ownerDisplayName: string;
}

interface AuditRow {
  id: string;
  action: string;
  subjectType: string;
  subjectId: string;
  actorId: string | null;
  actorDisplayName: string | null;
  createdAt: string;
}

export interface DashboardResponseDto {
  counts: DashboardCounts;
  storage: StorageBlock;
  charts: {
    downloads30d: SeriesPoint[];
    publishes30d: SeriesPoint[];
    newUsers30d: SeriesPoint[];
  };
  topAssets7d: TopAssetRow[];
  recentAudit: AuditRow[];
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async get(): Promise<DashboardResponseDto> {
    const cached = await this.redis.client.get(CACHE_KEY);
    if (cached) return JSON.parse(cached) as DashboardResponseDto;

    const [counts, storage, charts, topAssets7d, recentAudit] = await Promise.all([
      this.loadCounts(),
      this.loadStorage(),
      this.loadCharts(),
      this.loadTopAssets(),
      this.loadRecentAudit(),
    ]);
    const payload: DashboardResponseDto = { counts, storage, charts, topAssets7d, recentAudit };
    await this.redis.client.set(CACHE_KEY, JSON.stringify(payload), 'EX', CACHE_TTL_SECONDS);
    return payload;
  }

  private async loadCounts(): Promise<DashboardCounts> {
    const [users, published, draft, archived, downloadsLast30d, pendingReports, pendingRequests] =
      await Promise.all([
        this.prisma.user.count({ where: { deletedAt: null } }),
        this.prisma.asset.count({ where: { status: 'PUBLISHED' } }),
        this.prisma.asset.count({ where: { status: 'DRAFT' } }),
        this.prisma.asset.count({ where: { status: 'ARCHIVED' } }),
        this.prisma.download.count({
          where: { createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
        }),
        this.prisma.report.count({ where: { status: { in: ['OPEN', 'REVIEWING'] } } }),
        this.prisma.assetRequest.count({
          where: { status: { in: ['SENT', 'IN_REVIEW', 'PENDING'] } },
        }),
      ]);
    return {
      users,
      assetsPublished: published,
      assetsDraft: draft,
      assetsArchived: archived,
      downloadsLast30d,
      pendingReports,
      pendingRequests,
      infectedVersions: 0,
    };
  }

  /**
   * Latest StorageDaily snapshot bucketed by our normalized prefix labels.
   * Falls back to zeros when the rollup hasn't run yet (fresh installs).
   */
  private async loadStorage(): Promise<StorageBlock> {
    const latest = await this.prisma.storageDaily.findFirst({
      orderBy: { date: 'desc' },
      select: { date: true },
    });
    if (!latest) {
      return {
        totalBytes: '0',
        sourceBytes: '0',
        derivedBytes: '0',
        thumbsBytes: '0',
        featuredBannersBytes: '0',
        editorMediaBytes: '0',
      };
    }
    const rows = await this.prisma.storageDaily.findMany({ where: { date: latest.date } });
    const byPrefix = (p: string): bigint => rows.find((r) => r.prefix === p)?.bytes ?? 0n;
    const source = byPrefix('source');
    const derived = byPrefix('derived');
    const thumbs = byPrefix('thumbs');
    const featured = byPrefix('featured');
    const editor = byPrefix('editor');
    const total = source + derived + thumbs + featured + editor;
    return {
      totalBytes: total.toString(),
      sourceBytes: source.toString(),
      derivedBytes: derived.toString(),
      thumbsBytes: thumbs.toString(),
      featuredBannersBytes: featured.toString(),
      editorMediaBytes: editor.toString(),
    };
  }

  private async loadCharts(): Promise<DashboardResponseDto['charts']> {
    const start = new Date(Date.now() - 30 * 86_400_000);

    const downloads = await this.prisma.$queryRaw<Array<{ date: Date; count: bigint }>>(Prisma.sql`
      SELECT date_trunc('day', "createdAt") AS date, COUNT(*)::bigint AS count
      FROM downloads
      WHERE "createdAt" >= ${start}
      GROUP BY date ORDER BY date ASC
    `);
    const publishes = await this.prisma.$queryRaw<Array<{ date: Date; count: bigint }>>(Prisma.sql`
      SELECT date_trunc('day', "publishedAt") AS date, COUNT(*)::bigint AS count
      FROM assets
      WHERE "publishedAt" >= ${start} AND status = 'PUBLISHED'
      GROUP BY date ORDER BY date ASC
    `);
    const newUsers = await this.prisma.$queryRaw<Array<{ date: Date; count: bigint }>>(Prisma.sql`
      SELECT date_trunc('day', "createdAt") AS date, COUNT(*)::bigint AS count
      FROM users
      WHERE "createdAt" >= ${start}
      GROUP BY date ORDER BY date ASC
    `);

    const toSeries = (rows: Array<{ date: Date; count: bigint }>): SeriesPoint[] =>
      rows.map((r) => ({ date: r.date.toISOString().slice(0, 10), count: Number(r.count) }));

    return {
      downloads30d: toSeries(downloads),
      publishes30d: toSeries(publishes),
      newUsers30d: toSeries(newUsers),
    };
  }

  private async loadTopAssets(): Promise<TopAssetRow[]> {
    const since = new Date(Date.now() - 7 * 86_400_000);
    const rows = await this.prisma.$queryRaw<
      Array<{ assetId: string; downloads: bigint }>
    >(Prisma.sql`
      SELECT "assetId", COUNT(*)::bigint AS downloads
      FROM downloads
      WHERE "createdAt" >= ${since}
      GROUP BY "assetId"
      ORDER BY downloads DESC
      LIMIT 10
    `);
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.assetId);
    const assets = await this.prisma.asset.findMany({
      where: { id: { in: ids } },
      include: { owner: true },
    });
    const byId = new Map(assets.map((a) => [a.id, a]));
    return rows
      .map((r) => {
        const a = byId.get(r.assetId);
        if (!a) return null;
        return {
          id: a.id,
          title: a.title,
          downloads: Number(r.downloads),
          ownerDisplayName: a.owner.displayName,
        };
      })
      .filter((r): r is TopAssetRow => !!r);
  }

  private async loadRecentAudit(): Promise<AuditRow[]> {
    const rows = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 15,
      include: { actor: true },
    });
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      subjectType: r.subjectType,
      subjectId: r.subjectId,
      actorId: r.actorId,
      actorDisplayName: r.actor?.displayName ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // Hook called by mutating admin actions to bust the cache mid-cycle when a
  // change is meaningful enough to want immediate reflection.
  async invalidate(): Promise<void> {
    await this.redis.client.del(CACHE_KEY);
  }
}
