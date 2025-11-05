import { Module } from '@nestjs/common';
import { ProcessorsModule } from '../modules/jobs/processors/processors.module';
import { WorkerHealthController } from './worker-health.controller';

@Module({
  imports: [ProcessorsModule],
  controllers: [WorkerHealthController],
})
export class WorkerHealthModule {}
