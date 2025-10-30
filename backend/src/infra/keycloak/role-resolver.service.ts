import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Application-level roles, derived per request — NOT stored in Keycloak. */
export type AppRole = 'admin' | 'contributor' | 'user';

@Injectable()
export class RoleResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Computes a user's effective role:
   *   - `admin`       — `User.isAdmin === true`
   *   - `contributor` — has at least one published, non-deleted Asset
   *   - `user`        — otherwise
   *
   * Counts are kept cheap by selecting only the existence of a published asset.
   */
  async resolve(user: User, tx?: Prisma.TransactionClient): Promise<AppRole> {
    if (user.isAdmin) return 'admin';
    const client = tx ?? this.prisma;
    const owned = await client.asset.findFirst({
      where: {
        ownerId: user.id,
        status: { in: ['PUBLISHED', 'ARCHIVED'] },
      },
      select: { id: true },
    });
    return owned ? 'contributor' : 'user';
  }
}
