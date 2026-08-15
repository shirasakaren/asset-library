import { Module } from '@nestjs/common';
import { AdminRequestsController } from './admin-requests.controller';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({
  controllers: [RequestsController, AdminRequestsController],
  providers: [RequestsService],
  exports: [RequestsService],
})
export class RequestsModule {}
