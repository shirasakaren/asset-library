import { Injectable } from '@nestjs/common';
import { Notification, NotificationType, Prisma, User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor';
import { ErrorCode } from '../../common/errors/error-code';
import { NotFoundDomainException } from '../../common/errors/problem.dto';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface NotificationDto {
  id: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Used by the notify worker — writes a single inbox row and returns it. */
  async insertInApp(
    userId: string,
    type: NotificationType,
    payload: Record<string, unknown>,
  ): Promise<Notification> {
    return this.prisma.notification.create({
      data: {
        userId,
        type,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async list(
    user: User,
    opts: { cursor?: string | null; limit?: number; unreadOnly?: boolean },
  ): Promise<{
    items: NotificationDto[];
    pageInfo: { nextCursor: string | null; hasMore: boolean };
  }> {
    const limit = Math.min(Math.max(opts.limit ?? 24, 1), 100);
    const cursor = decodeCursor(opts.cursor ?? null);
    const where: Prisma.NotificationWhereInput = { userId: user.id };
    if (opts.unreadOnly) where.readAt = null;

    const rows = await this.prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor.id } } : {}),
    });

    const hasMore = rows.length > limit;
    const slice = rows.slice(0, limit);
    return {
      items: slice.map((r) => this.toDto(r)),
