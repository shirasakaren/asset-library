import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AuthModule } from '../auth/auth.module';
import { MeController } from './me.controller';

@Module({
  imports: [AuthModule, AnalyticsModule],
  controllers: [MeController],
})
export class MeModule {}
