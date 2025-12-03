import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/**
 * Reports submission + admin moderation queue. The asset-side effects of an
 * action (archive / delete / force-delete) are routed through
 * `AdminAssetsModerationService`, which lives in `AdminModule`.
 */
@Module({
  imports: [AdminModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
