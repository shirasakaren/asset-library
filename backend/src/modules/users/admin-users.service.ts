import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma, User } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { AppConfigService } from '../../config/app-config.service';
import { ErrorCode } from '../../common/errors/error-code';
import { ConflictDomainException, NotFoundDomainException } from '../../common/errors/problem.dto';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor';
import { resolvePageSize } from '../../common/pagination/list-query.dto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { JobsProducer } from '../jobs/jobs.producer';
import { AdminUserDto, ListAdminUsersQueryDto } from './dto/admin-user.dto';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly producer: JobsProducer,
    private readonly config: AppConfigService,
    private readonly redis: RedisService,
  ) {}

  /** Drop the auth guard's cached principal so a role change applies at once. */
  private async invalidatePrincipal(keycloakSub: string): Promise<void> {
    await this.redis.client.del(`authz:principal:${keycloakSub}`).catch(() => undefined);
  }

  async list(query: ListAdminUsersQueryDto): Promise<{
    items: AdminUserDto[];
    pageInfo: { nextCursor: string | null; hasMore: boolean };
  }> {
    const limit = resolvePageSize(query.limit);
    const cursor = decodeCursor(query.cursor ?? null);
    const where: Prisma.UserWhereInput = { deletedAt: null };
    if (query.q) {
      where.OR = [
        { email: { contains: query.q, mode: 'insensitive' } },
        { displayName: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.isAdmin != null) where.isAdmin = query.isAdmin;

    const rows = await this.prisma.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor.id } } : {}),
      include: { _count: { select: { assetsOwned: { where: { status: 'PUBLISHED' } } } } },
    });
    const hasMore = rows.length > limit;
    const slice = rows.slice(0, limit);
    return {
      items: slice.map((r) => ({
        id: r.id,
        email: r.email,
        displayName: r.displayName,
        isAdmin: r.isAdmin,
        locale: r.locale,
        createdAt: r.createdAt.toISOString(),
        publishedAssetCount: r._count.assetsOwned,
      })),
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

  async promote(id: string, admin: User): Promise<void> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target)
      throw new NotFoundDomainException(ErrorCode.USER_NOT_FOUND, `User ${id} not found.`);
    if (target.isAdmin) return;
    await this.prisma.user.update({ where: { id }, data: { isAdmin: true } });
    await this.invalidatePrincipal(target.keycloakSub);
    await this.producer.enqueueNotify({
      recipientUserId: id,
      type: NotificationType.ADMIN_PROMOTED,
      payload: { promotedBy: { id: admin.id, displayName: admin.displayName, email: admin.email } },
      actor: { id: admin.id, displayName: admin.displayName, email: admin.email },
    });
    await this.audit.record({
      actorId: admin.id,
      action: 'user.promote',
      subjectType: 'User',
      subjectId: id,
      metadata: { email: target.email },
    });
  }

  async demote(id: string, admin: User): Promise<void> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target)
      throw new NotFoundDomainException(ErrorCode.USER_NOT_FOUND, `User ${id} not found.`);
    if (!target.isAdmin) return;
    if (target.email.toLowerCase() === this.config.get('ADMIN_BOOTSTRAP_EMAIL').toLowerCase()) {
      throw new ConflictDomainException(
        ErrorCode.ADMIN_CANNOT_DEMOTE_BOOTSTRAP,
        'Cannot demote the bootstrap admin.',
      );
    }
    const remainingAdmins = await this.prisma.user.count({
      where: { isAdmin: true, deletedAt: null, NOT: { id } },
    });
    if (remainingAdmins === 0) {
      throw new ConflictDomainException(
        ErrorCode.ADMIN_CANNOT_REMOVE_LAST_ADMIN,
        'Refusing to demote — this would leave the system with zero admins.',
      );
    }
    await this.prisma.user.update({ where: { id }, data: { isAdmin: false } });
    await this.invalidatePrincipal(target.keycloakSub);
    await this.producer.enqueueNotify({
      recipientUserId: id,
      type: NotificationType.ADMIN_DEMOTED,
      payload: { demotedBy: { id: admin.id, displayName: admin.displayName, email: admin.email } },
      actor: { id: admin.id, displayName: admin.displayName, email: admin.email },
    });
    await this.audit.record({
      actorId: admin.id,
      action: 'user.demote',
      subjectType: 'User',
      subjectId: id,
      metadata: { email: target.email },
    });
  }
}
