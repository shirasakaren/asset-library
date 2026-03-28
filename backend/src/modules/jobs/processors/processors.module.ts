import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalysisReport, AnalysisReportSchema } from './analyze/analysis-report.schema';
import { WebhookDelivery, WebhookDeliverySchema } from './webhook/webhook-delivery.schema';
import { AnalyzeService } from './analyze/analyze.service';
import { AnalyzeWorker } from './analyze/analyze.worker';
import { AnalyzeVersionWorker } from './analyze/analyze-version.worker';
import { GltfConvertWorker } from './convert/gltf-convert.worker';
import { NotifyWorker } from './notify.worker';
import { SearchIndexBatchWorker } from './search/search-index-batch.worker';
import { SearchIndexMarkWorker } from './search/search-index.worker';
import { ThumbnailRenderWorker } from './thumbnails/thumbnail-render.worker';
import { ThumbnailVariantsWorker } from './thumbnails/thumbnail-variants.worker';
import { WebhookWorker } from './webhook/webhook.worker';
import { ArchivePurgeWorker } from './maintenance/archive-purge.worker';
import { AuditPurgeWorker } from './maintenance/audit-purge.worker';
import { EditorMediaGcWorker } from './maintenance/editor-media-gc.worker';
import { AnalyticsRollupWorker } from './maintenance/analytics-rollup.worker';
import { StorageRollupWorker } from './maintenance/storage-rollup.worker';

/**
 * Registers every BullMQ worker. Imported only by `WorkerModule` —
 * API replicas don't start processors.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AnalysisReport.name, schema: AnalysisReportSchema },
      { name: WebhookDelivery.name, schema: WebhookDeliverySchema },
    ]),
  ],
  providers: [
    AnalyzeService,
    AnalyzeWorker,
    AnalyzeVersionWorker,
    GltfConvertWorker,
    ThumbnailVariantsWorker,
    ThumbnailRenderWorker,
    SearchIndexMarkWorker,
    SearchIndexBatchWorker,
    NotifyWorker,
    WebhookWorker,
    ArchivePurgeWorker,
    AuditPurgeWorker,
    EditorMediaGcWorker,
    AnalyticsRollupWorker,
    StorageRollupWorker,
  ],
})
export class ProcessorsModule {}
