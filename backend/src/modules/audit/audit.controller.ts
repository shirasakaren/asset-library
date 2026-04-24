import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code';
import { NotFoundDomainException } from '../../common/errors/problem.dto';
import { AdminGuard } from '../../common/guards/admin.guard';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor';
import { resolvePageSize } from '../../common/pagination/list-query.dto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditEntryDto, ListAuditQueryDto } from './dto/audit.dto';

@ApiTags('Admin')
@ApiBearerAuth('keycloak')
@Controller('admin/audit')
@UseGuards(AdminGuard)
export class AdminAuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Filterable audit log read view.' })
  @ApiOkResponse()
  async list(@Query() query: ListAuditQueryDto): Promise<{
    items: AuditEntryDto[];
    pageInfo: { nextCursor: string | null; hasMore: boolean };
  }> {
    const limit = resolvePageSize(query.limit);
    const cursor = decodeCursor(query.cursor ?? null);
    const where: Prisma.AuditLogWhereInput = {};
    if (query.actorId) where.actorId = query.actorId;
    if (query.action) where.action = query.action;
    if (query.subjectType) where.subjectType = query.subjectType;
    if (query.subjectId) where.subjectId = query.subjectId;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { actor: true },
      ...(cursor ? { skip: 1, cursor: { id: cursor.id } } : {}),
    });
    const hasMore = rows.length > limit;
    const slice = rows.slice(0, limit);
    return {
      items: slice.map((r) => this.toDto(r)),
      pageInfo: {
        nextCursor:
          hasMore && slice.length
            ? encodeCursor({
                id: slice[slice.length - 1].id,
                createdAt: slice[slice.length - 1].createdAt.toISOString(),
              })
            : null,
        hasMore,
      },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Full audit entry detail incl. metadata payload.' })
  @ApiOkResponse({ type: AuditEntryDto })
  async detail(@Param('id') id: string): Promise<AuditEntryDto> {
    const row = await this.prisma.auditLog.findUnique({ where: { id }, include: { actor: true } });
    if (!row)
      throw new NotFoundDomainException(
        ErrorCode.REQUEST_NOT_FOUND,
        `Audit entry ${id} not found.`,
      );
    return this.toDto(row);
  }

  private toDto(row: {
    id: string;
    action: string;
    subjectType: string;
    subjectId: string;
    actorId: string | null;
    metadata: unknown;
    createdAt: Date;
    actor?: { displayName: string; email: string } | null;
  }): AuditEntryDto {
    return {
      id: row.id,
      action: row.action,
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      actorId: row.actorId ?? undefined,
      actorDisplayName: row.actor?.displayName,
      actorEmail: row.actor?.email,
      metadata: (row.metadata as Record<string, unknown>) ?? undefined,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
