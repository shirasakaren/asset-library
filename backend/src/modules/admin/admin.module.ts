import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AssetsModule } from '../assets/assets.module';
import { CategoriesModule } from '../categories/categories.module';
import {
  WebhookDelivery,
  WebhookDeliverySchema,
} from '../jobs/processors/webhook/webhook-delivery.schema';
import { AdminAssetsController } from './assets-moderation.controller';
import { AdminAssetsModerationService } from './assets-moderation.service';
import { AdminDashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { AdminStorageController } from './storage.controller';
import { WebhookDeliveriesController } from './webhook-deliveries.controller';

/**
 * Hub of the admin namespace. Hosts cross-cutting admin services
 * (`AdminAssetsModerationService`, `DashboardService`) and the controllers
 * that don't belong to any specific domain module. Domain-specific admin
 * surfaces (reports, requests, featured, etc.) live in those modules and
 * import what they need from here.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: WebhookDelivery.name, schema: WebhookDeliverySchema }]),
    AssetsModule,
    CategoriesModule,
  ],
  controllers: [
    AdminDashboardController,
    AdminStorageController,
    AdminAssetsController,
    WebhookDeliveriesController,
  ],
  providers: [AdminAssetsModerationService, DashboardService],
  exports: [AdminAssetsModerationService, DashboardService],
})
export class AdminModule {}
