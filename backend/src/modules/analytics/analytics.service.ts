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
    if (!asset)
      throw new NotFoundDomainException(ErrorCode.ASSET_NOT_FOUND, `Asset ${assetId} not found.`);
    if (asset.ownerId !== user.id && !user.isAdmin) {
      throw new ForbiddenDomainException(ErrorCode.AUTH_FORBIDDEN, 'You do not own this asset.');
    }
    const since = new Date(Date.now() - 90 * 86_400_000);

    const daily = await this.prisma.downloadDaily.findMany({
      where: { assetId, date: { gte: since } },
      orderBy: { date: 'asc' },
    });
    const byCountry: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    for (const row of daily) {
      for (const [country, count] of Object.entries(
        (row.byCountry as Record<string, number>) ?? {},
      )) {
        byCountry[country] = (byCountry[country] ?? 0) + count;
      }
      for (const [source, count] of Object.entries(
        (row.bySource as Record<string, number>) ?? {},
      )) {
        bySource[source] = (bySource[source] ?? 0) + count;
      }
    }

    const byVersionRaw = await this.prisma.$queryRaw<
      Array<{ versionId: string; semver: string; downloads: bigint }>
    >(Prisma.sql`
      SELECT av.id AS "versionId", av.semver, COUNT(d.id)::bigint AS downloads
      FROM asset_versions av
      LEFT JOIN downloads d ON d."versionId" = av.id
      WHERE av."assetId" = ${assetId}
      GROUP BY av.id, av.semver
      ORDER BY downloads DESC
    `);
    const byFileRaw = await this.prisma.$queryRaw<
      Array<{ fileId: string; relativePath: string; downloads: bigint }>
    >(Prisma.sql`
      SELECT af.id AS "fileId", af."relativePath", COUNT(d.id)::bigint AS downloads
      FROM asset_files af
      JOIN asset_versions av ON av.id = af."versionId"
      LEFT JOIN downloads d ON d."fileId" = af.id
      WHERE av."assetId" = ${assetId}
      GROUP BY af.id, af."relativePath"
      ORDER BY downloads DESC
      LIMIT 50
    `);

    return {
      asset: { id: asset.id, title: asset.title },
      daily: daily.map((d) => ({ date: d.date.toISOString().slice(0, 10), count: d.count })),
      byCountry,
      bySource,
      byVersion: byVersionRaw.map((r) => ({
        versionId: r.versionId,
        semver: r.semver,
        downloads: Number(r.downloads),
      })),
      byFile: byFileRaw.map((r) => ({
        fileId: r.fileId,
        relativePath: r.relativePath,
        downloads: Number(r.downloads),
      })),
    };
  }

  async platform(from: Date, to: Date): Promise<PlatformAnalytics> {
    const dailyRows = await this.prisma.$queryRaw<Array<{ date: Date; count: bigint }>>(Prisma.sql`
      SELECT date_trunc('day', "createdAt") AS date, COUNT(*)::bigint AS count
      FROM downloads
      WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
      GROUP BY date ORDER BY date ASC
    `);
    const totalsRow = await this.prisma.$queryRaw<
      Array<{ downloads: bigint; publishes: bigint; newUsers: bigint }>
    >(Prisma.sql`
      SELECT
        (SELECT COUNT(*) FROM downloads WHERE "createdAt" >= ${from} AND "createdAt" < ${to})::bigint AS downloads,
        (SELECT COUNT(*) FROM assets WHERE "publishedAt" IS NOT NULL AND "publishedAt" >= ${from} AND "publishedAt" < ${to})::bigint AS publishes,
        (SELECT COUNT(*) FROM users WHERE "createdAt" >= ${from} AND "createdAt" < ${to})::bigint AS "newUsers"
    `);
    const sourceRows = await this.prisma.$queryRaw<
      Array<{ source: string; count: bigint }>
    >(Prisma.sql`
      SELECT source, COUNT(*)::bigint AS count
      FROM downloads
      WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
      GROUP BY source
    `);
    const totals = totalsRow[0] ?? { downloads: 0n, publishes: 0n, newUsers: 0n };
    return {
      daily: dailyRows.map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        count: Number(r.count),
      })),
      totals: {
        downloads: Number(totals.downloads),
        publishes: Number(totals.publishes),
        newUsers: Number(totals.newUsers),
      },
      bySource: Object.fromEntries(sourceRows.map((r) => [r.source, Number(r.count)])),
    };
  }
}
