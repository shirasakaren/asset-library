import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { AppConfigService } from '../../../../config/app-config.service';
import { RedisService } from '../../../../infra/redis/redis.service';
import { SentryService } from '../../../../infra/sentry/sentry.service';
import { SearchIndexJob } from '../../contracts';
import { QUEUE } from '../../queue-names';
import { JobWorkerBase } from '../../worker-base';

export const SEARCH_DIRTY_SET = 'search:pending';

/**
 * Marks an asset as dirty by SADD'ing into a Redis set. The actual indexing
 * is done by `SearchIndexBatchWorker` on a 5-second cadence. We keep the
 * dirty set itself so a flood of publishes only triggers one Meilisearch
 * update per asset per cycle.
 */
@Injectable()
export class SearchIndexMarkWorker extends JobWorkerBase<SearchIndexJob> {
  constructor(
    config: AppConfigService,
    sentry: SentryService,
    private readonly redis: RedisService,
  ) {
    super(QUEUE.SEARCH_INDEX, config, sentry);
  }

  async process(job: Job<SearchIndexJob>): Promise<void> {
    await this.redis.client.sadd(SEARCH_DIRTY_SET, job.data.assetId);
  }
}
