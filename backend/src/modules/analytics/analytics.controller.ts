import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AdminGuard } from '../../common/guards/admin.guard';
import {
  AuthenticatedRequestUser,
  KeycloakAuthGuard,
} from '../../infra/keycloak/keycloak-auth.guard';
import { AnalyticsService } from './analytics.service';

@ApiTags('Analytics')
@ApiBearerAuth('keycloak')
@Controller()
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  // ─── Contributor (own assets) ───────────────────────────────────────────

  @Get('me/analytics/summary')
  @UseGuards(KeycloakAuthGuard)
  @ApiOperation({ summary: 'My analytics: totals + top 5 + 90 days of daily downloads.' })
  @ApiOkResponse()
  mySummary(@AuthUser() principal: AuthenticatedRequestUser) {
    return this.analytics.mySummary(principal.user);
  }

  @Get('me/analytics/assets/:assetId')
  @UseGuards(KeycloakAuthGuard)
  @ApiOperation({ summary: 'Per-asset breakdown (owner / admin only).' })
  @ApiOkResponse()
  assetDetail(@AuthUser() principal: AuthenticatedRequestUser, @Param('assetId') assetId: string) {
    return this.analytics.assetDetail(principal.user, assetId);
  }

  // ─── Admin (platform-wide) ──────────────────────────────────────────────

  @Get('admin/analytics/platform')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Platform-wide downloads/publishes/new-users series for a date range.' })
  @ApiQuery({ name: 'from', required: false, example: '2026-04-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-05-01' })
  @ApiOkResponse()
  platform(@Query('from') from?: string, @Query('to') to?: string) {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86_400_000);
    const toDate = to ? new Date(to) : new Date();
    return this.analytics.platform(fromDate, toDate);
  }

  @Get('admin/analytics/assets')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Leaderboard of assets by downloads/saves.' })
  @ApiQuery({ name: 'sort', required: false, enum: ['downloads', 'saves', 'last7d', 'last30d'] })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOkResponse()
  async assetLeaderboard(@Query('sort') sort?: string, @Query('limit') limit?: string) {
    const take = Math.min(Math.max(Number(limit ?? '25'), 1), 200);
    const sortBy =
      sort === 'saves'
        ? 'totalSaves'
        : sort === 'last7d'
          ? 'last7dDownloads'
          : sort === 'last30d'
            ? 'last30dDownloads'
            : 'totalDownloads';
    const rows = await this.analytics['prisma'].assetStats.findMany({
      orderBy: { [sortBy]: 'desc' as const },
      take,
      include: { asset: { include: { owner: true } } },
    });
    return rows.map((r) => ({
      assetId: r.assetId,
      title: r.asset.title,
      ownerDisplayName: r.asset.owner.displayName,
      totalDownloads: r.totalDownloads,
      totalSaves: r.totalSaves,
      last7dDownloads: r.last7dDownloads,
      last30dDownloads: r.last30dDownloads,
    }));
  }

  @Get('admin/analytics/users')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Leaderboard of contributors by uploaded count + downloads.' })
  @ApiOkResponse()
  async userLeaderboard(@Query('limit') limit?: string) {
    const take = Math.min(Math.max(Number(limit ?? '25'), 1), 200);
    const rows = await this.analytics['prisma'].$queryRaw<
      Array<{ ownerId: string; published: bigint; downloads: bigint }>
    >`
      SELECT a."ownerId" AS "ownerId",
             COUNT(*)::bigint AS published,
             COALESCE(SUM(s."totalDownloads"), 0)::bigint AS downloads
      FROM assets a
      LEFT JOIN asset_stats s ON s."assetId" = a.id
      WHERE a.status = 'PUBLISHED'
      GROUP BY a."ownerId"
      ORDER BY downloads DESC
      LIMIT ${take}
    `;
    if (rows.length === 0) return [];
    const users = await this.analytics['prisma'].user.findMany({
      where: { id: { in: rows.map((r) => r.ownerId) } },
      select: { id: true, displayName: true, email: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => ({
      ownerId: r.ownerId,
      displayName: byId.get(r.ownerId)?.displayName,
      email: byId.get(r.ownerId)?.email,
      publishedAssets: Number(r.published),
      totalDownloads: Number(r.downloads),
    }));
  }
}
