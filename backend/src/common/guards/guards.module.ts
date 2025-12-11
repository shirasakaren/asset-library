import { Global, Module } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { RolesGuard } from './roles.guard';

/**
 * Cross-cutting guards exposed globally. Includes RolesGuard (Part 1) +
 * AdminGuard (Part 4). Controllers compose them via `@UseGuards(AdminGuard)`.
 */
@Global()
@Module({
  providers: [AdminGuard, RolesGuard],
  exports: [AdminGuard, RolesGuard],
})
export class GuardsModule {}
