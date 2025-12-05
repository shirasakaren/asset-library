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
