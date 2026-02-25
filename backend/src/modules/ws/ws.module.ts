import { Module } from '@nestjs/common';
import { ConnectionRegistry } from './connection-registry';
import { NotificationsGateway } from './notifications.gateway';

@Module({
  providers: [ConnectionRegistry, NotificationsGateway],
  exports: [ConnectionRegistry],
})
export class WsModule {}
