import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/**
 * Hosts the cross-cutting `AuditService` used by the interceptor + every
 * admin handler that records audit rows. Distinct from
 * `modules/audit/AuditModule`, which owns the admin-facing READ endpoints
 * over `AuditLog`.
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditCoreModule {}
