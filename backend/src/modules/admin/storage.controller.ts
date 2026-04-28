import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../../common/guards/admin.guard';
import { PrismaService } from '../../infra/prisma/prisma.service';

@ApiTags('Admin')
@ApiBearerAuth('keycloak')
@Controller('admin/storage')
@UseGuards(AdminGuard)
export class AdminStorageController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('users')
  @ApiOperation({ summary: 'Per-user storage usage (latest snapshot, sorted by bytes desc).' })
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'ISO date; defaults to the most recent snapshot.',
  })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOkResponse()
  async users(@Query('date') date?: string, @Query('limit') limit?: string) {
    const targetDate = await this.resolveDate(date, 'user');
    const take = Math.min(Math.max(Number(limit ?? '50'), 1), 200);
    if (!targetDate) return { date: null, items: [] };
    const rows = await this.prisma.storageUserDaily.findMany({
      where: { date: targetDate },
      orderBy: { bytes: 'desc' },
      take,
    });
    const userIds = rows.map((r) => r.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, displayName: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return {
      date: targetDate.toISOString().slice(0, 10),
      items: rows.map((r) => ({
        userId: r.userId,
        email: byId.get(r.userId)?.email,
        displayName: byId.get(r.userId)?.displayName,
        bytes: r.bytes.toString(),
        assetCount: r.assetCount,
      })),
    };
  }

  @Get('assets')
  @ApiOperation({ summary: 'Per-asset storage usage, sorted by bytes desc.' })
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOkResponse()
  async assets(@Query('date') date?: string, @Query('limit') limit?: string) {
    const targetDate = await this.resolveDate(date, 'asset');
    const take = Math.min(Math.max(Number(limit ?? '50'), 1), 200);
    if (!targetDate) return { date: null, items: [] };
    const rows = await this.prisma.storageAssetDaily.findMany({
      where: { date: targetDate },
      orderBy: { bytes: 'desc' },
      take,
    });
    const ids = rows.map((r) => r.assetId);
    const assets = await this.prisma.asset.findMany({
      where: { id: { in: ids } },
      select: { id: true, slug: true, title: true, ownerId: true, status: true },
    });
    const byId = new Map(assets.map((a) => [a.id, a]));
    return {
      date: targetDate.toISOString().slice(0, 10),
      items: rows.map((r) => ({
        assetId: r.assetId,
        slug: byId.get(r.assetId)?.slug,
        title: byId.get(r.assetId)?.title,
        ownerId: byId.get(r.assetId)?.ownerId,
        status: byId.get(r.assetId)?.status,
        bytes: r.bytes.toString(),
      })),
    };
  }

  private async resolveDate(raw: string | undefined, kind: 'user' | 'asset'): Promise<Date | null> {
    if (raw) {
      const parsed = new Date(raw);
      if (!Number.isFinite(parsed.getTime())) return null;
      return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
    }
    const latest =
      kind === 'user'
        ? await this.prisma.storageUserDaily.findFirst({
            orderBy: { date: 'desc' },
            select: { date: true },
          })
        : await this.prisma.storageAssetDaily.findFirst({
            orderBy: { date: 'desc' },
            select: { date: true },
          });
    return latest?.date ?? null;
  }
}
