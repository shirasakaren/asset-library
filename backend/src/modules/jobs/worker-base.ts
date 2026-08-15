import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Worker, WorkerOptions } from 'bullmq';
import { AppConfigService } from '../../config/app-config.service';
import { SentryService } from '../../infra/sentry/sentry.service';
import { QUEUE_CONCURRENCY, QueueName } from './queue-names';

/**
 * Shared boilerplate for every BullMQ worker. Subclasses implement
 * `process(job)`; the base wires Redis, applies the queue-specific
 * concurrency cap, and forwards failures to Sentry with the payload as
 * breadcrumb context.
 */
export abstract class JobWorkerBase<TPayload> implements OnModuleInit, OnModuleDestroy {
  protected readonly logger: Logger;
  protected worker: Worker | null = null;

  constructor(
    protected readonly queueName: QueueName,
    protected readonly config: AppConfigService,
    protected readonly sentry: SentryService,
    private readonly options: Partial<WorkerOptions> = {},
  ) {
    this.logger = new Logger(`Worker:${queueName}`);
  }

  abstract process(job: Job<TPayload>): Promise<unknown>;

  onModuleInit(): void {
    this.worker = new Worker<TPayload>(
      this.queueName,
      async (job) => {
        const start = Date.now();
        try {
          const result = await this.process(job);
          this.logger.log(
            `job=${job.id} name=${job.name} duration=${Date.now() - start}ms attempt=${job.attemptsMade + 1}`,
          );
          return result;
        } catch (err) {
          this.logger.error(
            `job=${job.id} name=${job.name} failed: ${(err as Error).message}`,
            (err as Error).stack,
          );
          this.sentry.captureException(err, {
            queue: this.queueName,
            jobId: job.id,
            data: job.data as unknown as Record<string, unknown>,
            attempt: job.attemptsMade + 1,
          });
          throw err;
        }
      },
      {
        connection: { url: this.config.get('REDIS_URL') } as never,
        concurrency: QUEUE_CONCURRENCY[this.queueName],
        ...this.options,
      },
    );
    this.worker.on('failed', (job, err) => {
      if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
        // Final failure — already captured in the catch above; log clearly.
        this.logger.warn(`job=${job.id} exhausted retries (${job.attemptsMade}): ${err.message}`);
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
