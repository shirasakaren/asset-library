import { Global, Module } from '@nestjs/common';
import { EmailRendererService } from './email-renderer.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { WsFanoutService } from './ws-fanout.service';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, EmailRendererService, WsFanoutService],
  exports: [NotificationsService, EmailRendererService, WsFanoutService],
})
export class NotificationsModule {}
