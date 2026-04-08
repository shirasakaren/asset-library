import { Module } from '@nestjs/common';
import { AdminAuditController } from './audit.controller';

/**
 * Read endpoints over `AuditLog`. The cross-cutting AuditService that writes
 * rows lives in `common/audit/audit.module.ts` and is registered globally.
 */
@Module({
  controllers: [AdminAuditController],
})
export class AuditModule {}
