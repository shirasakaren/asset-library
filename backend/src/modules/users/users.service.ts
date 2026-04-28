import { Injectable, NotFoundException } from '@nestjs/common';
import { Locale, Prisma, User } from '@prisma/client';
import { resolveAvatar } from '../../common/avatar/avatar';
import { ErrorCode } from '../../common/errors/error-code';
import { NotFoundDomainException } from '../../common/errors/problem.dto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { UserPublicProfileDto, UserSearchResultDto } from './dto/user-public.dto';

/**
 * Application-level user operations. Identity itself is owned by Keycloak —
 * this service only manipulates the local mirror row.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByIdOrThrow(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException(`User ${id} not found.`);
    return user;
  }

  findByKeycloakSub(sub: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { keycloakSub: sub } });
  }

  updateLocale(id: string, locale: Locale): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { locale } });
  }

  updateDisplayName(id: string, displayName: string): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { displayName } });
  }

  /** Admin-only typeahead used by the "promote another admin" picker. */
  async searchUsers(q: string, limit = 20): Promise<UserSearchResultDto[]> {
    const needle = q.trim();
    if (needle.length < 2) return [];
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      OR: [
        { email: { contains: needle, mode: 'insensitive' } },
        { displayName: { contains: needle, mode: 'insensitive' } },
      ],
    };
    const rows = await this.prisma.user.findMany({
      where,
      take: Math.min(limit, 20),
      orderBy: [{ isAdmin: 'desc' }, { displayName: 'asc' }],
      select: { id: true, email: true, displayName: true, isAdmin: true },
    });
    return rows;
  }

  /**
   * Public profile shape. Email is exposed only when the requester is the
   * user themselves or an admin.
   */
  async getPublicProfile(id: string, requester: User | null): Promise<UserPublicProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { _count: { select: { assetsOwned: { where: { status: 'PUBLISHED' } } } } },
    });
    if (!user || user.deletedAt) {
      throw new NotFoundDomainException(ErrorCode.USER_NOT_FOUND, `User ${id} not found.`);
    }
    const dto: UserPublicProfileDto = {
      id: user.id,
      displayName: user.displayName,
      avatar: resolveAvatar(user.id, user.displayName, user.email),
      joinedAt: user.createdAt.toISOString(),
      publishedAssetCount: user._count.assetsOwned,
    };
    if (requester && (requester.id === user.id || requester.isAdmin)) {
      dto.email = user.email;
    }
    return dto;
  }
}
