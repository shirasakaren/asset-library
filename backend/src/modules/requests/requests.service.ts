import { Injectable } from '@nestjs/common';
import { AssetRequest, AssetRequestStatus, NotificationType, Prisma, User } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { ErrorCode } from '../../common/errors/error-code';
import {
  BadRequestDomainException,
  ForbiddenDomainException,
  NotFoundDomainException,
} from '../../common/errors/problem.dto';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor';
import { resolvePageSize } from '../../common/pagination/list-query.dto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { JobsProducer } from '../jobs/jobs.producer';
import {
  AdminUpdateAssetRequestDto,
  AssetRequestDto,
  CreateAssetRequestDto,
  ListAssetRequestsQueryDto,
} from './dto/request.dto';

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsProducer,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateAssetRequestDto, requester: User): Promise<{ id: string }> {
    const created = await this.prisma.assetRequest.create({
      data: {
        requesterId: requester.id,
        assetLink: dto.assetLink,
        assetType: dto.assetType,
        intendedUse: dto.intendedUse,
        price: dto.price != null ? new Prisma.Decimal(dto.price) : undefined,
        notes: dto.notes ?? undefined,
      },
      select: { id: true },
    });
    // Find all admins and notify each (delivery handled by Part 3 worker).
    const admins = await this.prisma.user.findMany({
      where: { isAdmin: true, deletedAt: null },
      select: { id: true },
    });
    await Promise.all(
      admins.map((a) =>
        this.jobs.enqueueNotify({
          recipientUserId: a.id,
          type: NotificationType.REQUEST_CREATED,
          payload: {
            requestId: created.id,
            requester: {
              id: requester.id,
              displayName: requester.displayName,
              email: requester.email,
            },
            assetLink: dto.assetLink,
            assetType: dto.assetType,
            intendedUse: dto.intendedUse,
          },
          actor: { id: requester.id, displayName: requester.displayName, email: requester.email },
        }),
      ),
    );
    return created;
  }

  async list(query: ListAssetRequestsQueryDto, requester: User) {
    const limit = resolvePageSize(query.limit);
    const cursor = decodeCursor(query.cursor ?? null);

    const where: Prisma.AssetRequestWhereInput = requester.isAdmin
      ? {}
      : { requesterId: requester.id };
    if (query.status) where.status = query.status;
    if (requester.isAdmin && query.requesterId) where.requesterId = query.requesterId;

    const rows = await this.prisma.assetRequest.findMany({
      where,
      include: { requester: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor.id } } : {}),
    });
    const hasMore = rows.length > limit;
    const itemsRaw = rows.slice(0, limit);
    return {
      items: itemsRaw.map((r) => this.toDto(r)),
      pageInfo: {
        nextCursor:
          hasMore && itemsRaw.length
            ? encodeCursor({
                id: itemsRaw[itemsRaw.length - 1].id,
                createdAt: itemsRaw[itemsRaw.length - 1].createdAt.toISOString(),
              })
            : null,
        hasMore,
      },
    };
  }

  async get(id: string, requester: User): Promise<AssetRequestDto> {
    const row = await this.prisma.assetRequest.findUnique({
      where: { id },
      include: { requester: true },
    });
    if (!row)
      throw new NotFoundDomainException(ErrorCode.REQUEST_NOT_FOUND, `Request ${id} not found.`);
    if (!requester.isAdmin && row.requesterId !== requester.id) {
      throw new ForbiddenDomainException(ErrorCode.AUTH_FORBIDDEN, 'You do not own this request.');
    }
    return this.toDto(row);
  }

  /**
   * Admin transitions a request through its review lifecycle. Reject requires
   * a non-empty `adminComment`; every transition fires REQUEST_STATUS_CHANGED
   * to the requester and writes an audit row.
   */
  async adminUpdate(
    id: string,
    admin: User,
    dto: AdminUpdateAssetRequestDto,
  ): Promise<AssetRequestDto> {
    if (
      dto.status === AssetRequestStatus.REJECTED &&
      (!dto.adminComment || dto.adminComment.trim().length === 0)
    ) {
      throw new BadRequestDomainException(
        ErrorCode.REQUEST_NOT_FOUND,
        'Rejecting requires a non-empty adminComment so the requester understands why.',
      );
    }
    const row = await this.prisma.assetRequest.findUnique({
      where: { id },
      include: { requester: true },
    });
    if (!row)
      throw new NotFoundDomainException(ErrorCode.REQUEST_NOT_FOUND, `Request ${id} not found.`);

    const updated = await this.prisma.assetRequest.update({
      where: { id },
      data: { status: dto.status, adminComment: dto.adminComment ?? row.adminComment },
      include: { requester: true },
    });
    await this.jobs.enqueueNotify({
      recipientUserId: row.requesterId,
      type: NotificationType.REQUEST_STATUS_CHANGED,
      payload: {
        requestId: id,
        newStatus: dto.status,
        adminComment: dto.adminComment ?? row.adminComment ?? '',
      },
      actor: { id: admin.id, displayName: admin.displayName, email: admin.email },
    });
    await this.audit.record({
      actorId: admin.id,
      action: 'asset_request.status_change',
      subjectType: 'AssetRequest',
      subjectId: id,
      metadata: { from: row.status, to: dto.status, adminComment: dto.adminComment },
    });
    return this.toDto(updated);
  }

  private toDto(row: AssetRequest & { requester: User }): AssetRequestDto {
    return {
      id: row.id,
      assetLink: row.assetLink,
      assetType: row.assetType,
      intendedUse: row.intendedUse,
      price: row.price ? Number(row.price) : null,
      notes: row.notes ?? null,
      status: row.status,
      adminComment: row.adminComment ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      requester: { id: row.requester.id, displayName: row.requester.displayName },
    };
  }
}
