import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma, Report, User } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { ErrorCode } from '../../common/errors/error-code';
import {
  BadRequestDomainException,
  NotFoundDomainException,
} from '../../common/errors/problem.dto';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor';
import { resolvePageSize } from '../../common/pagination/list-query.dto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AdminAssetsModerationService } from '../admin/assets-moderation.service';
import { JobsProducer } from '../jobs/jobs.producer';
import {
  ActionReportDto,
  CreateReportDto,
  DismissReportDto,
  ListReportsQueryDto,
  ReportActionKind,
  ReportDto,
} from './dto/report.dto';

const CONFIRMATION_PHRASE = 'I understand';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly producer: JobsProducer,
    private readonly audit: AuditService,
    private readonly moderation: AdminAssetsModerationService,
  ) {}

  async create(dto: CreateReportDto, reporter: User): Promise<{ id: string }> {
    const asset = await this.prisma.asset.findUnique({ where: { id: dto.assetId } });
    if (!asset)
      throw new NotFoundDomainException(
        ErrorCode.ASSET_NOT_FOUND,
        `Asset ${dto.assetId} not found.`,
      );
    const row = await this.prisma.report.create({
      data: {
        assetId: dto.assetId,
        reporterId: reporter.id,
        category: dto.category,
        notes: dto.notes,
      },
      select: { id: true },
    });

    // Notify the asset owner + every admin.
    const admins = await this.prisma.user.findMany({
      where: { isAdmin: true, deletedAt: null },
      select: { id: true },
    });
    const basePayload = {
      reportId: row.id,
      assetId: asset.id,
      assetSlug: asset.slug,
      assetTitle: asset.title,
      category: dto.category,
    };
    await Promise.all([
      ...(asset.ownerId !== reporter.id
        ? [
            this.producer.enqueueNotify({
              recipientUserId: asset.ownerId,
              type: NotificationType.REPORT_RECEIVED_FOR_YOUR_ASSET,
              payload: basePayload,
              actor: { id: reporter.id, displayName: reporter.displayName, email: reporter.email },
            }),
          ]
        : []),
      ...admins.map((a) =>
        this.producer.enqueueNotify({
          recipientUserId: a.id,
          type: NotificationType.REPORT_CREATED,
          payload: {
            ...basePayload,
            reporter: { id: reporter.id, displayName: reporter.displayName, email: reporter.email },
          },
          actor: { id: reporter.id, displayName: reporter.displayName, email: reporter.email },
        }),
      ),
    ]);
    return row;
  }

  async list(query: ListReportsQueryDto) {
    const limit = resolvePageSize(query.limit);
    const cursor = decodeCursor(query.cursor ?? null);
    const where: Prisma.ReportWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.category) where.category = query.category;

    const rows = await this.prisma.report.findMany({
      where,
      include: { reporter: true, asset: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
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

  async get(id: string): Promise<ReportDto> {
    const row = await this.prisma.report.findUnique({
      where: { id },
      include: { reporter: true, asset: true },
    });
    if (!row)
      throw new NotFoundDomainException(ErrorCode.REQUEST_NOT_FOUND, `Report ${id} not found.`);
    return this.toDto(row);
  }

  async startReview(id: string, admin: User): Promise<void> {
    const row = await this.prisma.report.findUnique({ where: { id } });
    if (!row)
      throw new NotFoundDomainException(ErrorCode.REQUEST_NOT_FOUND, `Report ${id} not found.`);
    if (row.status !== 'OPEN') {
      throw new BadRequestDomainException(
        ErrorCode.ASSET_ARCHIVE_BLOCKED,
        `Report is in ${row.status}, not OPEN.`,
      );
    }
    await this.prisma.report.update({ where: { id }, data: { status: 'REVIEWING' } });
    await this.audit.record({
      actorId: admin.id,
      action: 'report.start_review',
      subjectType: 'Report',
      subjectId: id,
    });
  }

  async action(id: string, admin: User, dto: ActionReportDto): Promise<void> {
    const row = await this.prisma.report.findUnique({ where: { id }, include: { asset: true } });
    if (!row)
      throw new NotFoundDomainException(ErrorCode.REQUEST_NOT_FOUND, `Report ${id} not found.`);

    if (dto.action === 'FORCE_DELETE_ASSET') {
      if (dto.confirm !== CONFIRMATION_PHRASE || !dto.confirmedAt) {
        throw new BadRequestDomainException(
          ErrorCode.CONFIRMATION_REQUIRED,
          'FORCE_DELETE_ASSET requires confirm/confirmedAt body fields.',
        );
      }
      const ts = Date.parse(dto.confirmedAt);
      if (!Number.isFinite(ts) || Date.now() - ts > 60_000) {
        throw new BadRequestDomainException(
          ErrorCode.CONFIRMATION_EXPIRED,
          'Confirmation expired — re-confirm within the last 60 seconds.',
        );
      }
    }

    await this.applyAction(dto.action, row.asset.id, admin, dto.adminNotes, id);

    await this.prisma.report.update({
      where: { id },
      data: { status: 'ACTIONED', adminNotes: dto.adminNotes, resolvedAt: new Date() },
    });
    await this.audit.record({
      actorId: admin.id,
      action: 'report.action',
      subjectType: 'Report',
      subjectId: id,
      metadata: { action: dto.action, assetId: row.asset.id, adminNotes: dto.adminNotes },
    });
  }

  async dismiss(id: string, admin: User, dto: DismissReportDto): Promise<void> {
    const row = await this.prisma.report.findUnique({ where: { id } });
    if (!row)
      throw new NotFoundDomainException(ErrorCode.REQUEST_NOT_FOUND, `Report ${id} not found.`);
    await this.prisma.report.update({
      where: { id },
      data: { status: 'DISMISSED', adminNotes: dto.adminNotes, resolvedAt: new Date() },
    });
    await this.audit.record({
      actorId: admin.id,
      action: 'report.dismiss',
      subjectType: 'Report',
      subjectId: id,
      metadata: { adminNotes: dto.adminNotes },
    });
  }

  private async applyAction(
    kind: ReportActionKind,
    assetId: string,
    admin: User,
    adminNotes: string,
    reportId: string,
  ): Promise<void> {
    const reason = `report:${reportId} — ${adminNotes.slice(0, 200)}`;
    switch (kind) {
      case 'NOTHING':
        return;
      case 'ARCHIVE_ASSET':
        return this.moderation.archive(assetId, admin, reason);
      case 'DELETE_ASSET':
        return this.moderation.softDelete(assetId, admin, reason);
      case 'FORCE_DELETE_ASSET':
        return this.moderation.forceDelete(assetId, admin, reason);
    }
  }

  private toDto(
    row: Report & { asset: { id: string; slug: string; title: string }; reporter: User },
  ): ReportDto {
    return {
      id: row.id,
      category: row.category,
      notes: row.notes,
      status: row.status,
      assetId: row.assetId,
      assetTitle: row.asset.title,
      assetSlug: row.asset.slug,
      reporter: {
        id: row.reporter.id,
        displayName: row.reporter.displayName,
        email: row.reporter.email,
      },
      adminNotes: row.adminNotes,
      createdAt: row.createdAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString(),
    };
  }
}
