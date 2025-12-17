import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface AuditEntry {
  actorId?: string | null;
  action: string;
  subjectType: string;
  subjectId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Persists `AuditLog` rows. Used by `AuditInterceptor` for declarative
 * `@AuditAction()` recording and by services that need explicit control over
 * the subject id / metadata snapshot.
 *
 * Retention: 30 days, purged by Part 3's `audit-purge` cron.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: entry.actorId ?? undefined,
        action: entry.action,
        subjectType: entry.subjectType,
        subjectId: entry.subjectId,
        metadata: (entry.metadata ?? {}) as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
