import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code';
import { ForbiddenDomainException, NotFoundDomainException } from '../../common/errors/problem.dto';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface DailyPoint {
  date: string;
  count: number;
}

export interface MyAnalyticsSummary {
  totals: {
    downloads: number;
    saves: number;
    downloads7d: number;
    downloads30d: number;
  };
  topAssets: Array<{ id: string; title: string; downloads: number; saves: number }>;
  daily90d: DailyPoint[];
}

export interface AssetAnalyticsDetail {
  asset: { id: string; title: string };
  daily: DailyPoint[];
  byCountry: Record<string, number>;
  bySource: Record<string, number>;
  byVersion: Array<{ versionId: string; semver: string; downloads: number }>;
  byFile: Array<{ fileId: string; relativePath: string; downloads: number }>;
}

export interface PlatformAnalytics {
  daily: DailyPoint[];
  totals: { downloads: number; publishes: number; newUsers: number };
  bySource: Record<string, number>;
}

@Injectable()
export class AnalyticsService {
  /** Public so the controller's ad-hoc leaderboard endpoints can reach in. */
  constructor(readonly prisma: PrismaService) {}

  async mySummary(user: User): Promise<MyAnalyticsSummary> {
    const ownedAssets = await this.prisma.asset.findMany({
      where: { ownerId: user.id, status: { in: ['PUBLISHED', 'ARCHIVED'] } },
      select: { id: true, title: true },
    });
    if (ownedAssets.length === 0) {
      return {
        totals: { downloads: 0, saves: 0, downloads7d: 0, downloads30d: 0 },
        topAssets: [],
        daily90d: [],
      };
    }
    const assetIds = ownedAssets.map((a) => a.id);
    const stats = await this.prisma.assetStats.findMany({ where: { assetId: { in: assetIds } } });
    const totalDownloads = stats.reduce((s, r) => s + r.totalDownloads, 0);
    const totalSaves = stats.reduce((s, r) => s + r.totalSaves, 0);
    const last7 = stats.reduce((s, r) => s + r.last7dDownloads, 0);
    const last30 = stats.reduce((s, r) => s + r.last30dDownloads, 0);

    const topAssetIds = stats
      .slice()
      .sort((a, b) => b.totalDownloads - a.totalDownloads)
      .slice(0, 5)
      .map((s) => s.assetId);
    const titleById = new Map(ownedAssets.map((a) => [a.id, a.title]));
    const topAssets = topAssetIds.map((id) => {
      const s = stats.find((x) => x.assetId === id)!;
      return {
        id,
        title: titleById.get(id) ?? '(deleted)',
        downloads: s.totalDownloads,
        saves: s.totalSaves,
      };
    });

    const since = new Date(Date.now() - 90 * 86_400_000);
    const daily = await this.prisma.$queryRaw<Array<{ date: Date; count: bigint }>>(Prisma.sql`
      SELECT date, SUM(count)::bigint AS count
      FROM download_daily
      WHERE "assetId" = ANY(${assetIds}::text[]) AND date >= ${since}
      GROUP BY date ORDER BY date ASC
    `);
    return {
      totals: {
        downloads: totalDownloads,
        saves: totalSaves,
        downloads7d: last7,
        downloads30d: last30,
      },
      topAssets,
      daily90d: daily.map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        count: Number(r.count),
      })),
    };
  }

  async assetDetail(user: User, assetId: string): Promise<AssetAnalyticsDetail> {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
