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
