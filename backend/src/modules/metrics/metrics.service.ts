import { Injectable, OnModuleInit } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { JobsProducer } from '../jobs/jobs.producer';

/**
 * Owns the prom-client registry and exposes typed counters / gauges / histograms
 * for the worker pipelines. The controller renders the registry to text.
 */
@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  readonly jobsTotal: Counter<'queue' | 'status'>;
  readonly jobDuration: Histogram<'queue'>;
  readonly queueDepth: Gauge<'queue' | 'state'>;

  constructor(private readonly producer: JobsProducer) {
    collectDefaultMetrics({ register: this.registry });
    this.jobsTotal = new Counter({
      name: 'mgm_jobs_total',
      help: 'Job outcomes by queue.',
      labelNames: ['queue', 'status'],
      registers: [this.registry],
    });
    this.jobDuration = new Histogram({
      name: 'mgm_job_duration_seconds',
      help: 'Job processing time by queue.',
      labelNames: ['queue'],
      buckets: [0.05, 0.25, 1, 5, 30, 120, 600],
      registers: [this.registry],
    });
    this.queueDepth = new Gauge({
      name: 'mgm_queue_depth',
      help: 'Current job count per queue state (waiting / active / failed / delayed).',
      labelNames: ['queue', 'state'],
      registers: [this.registry],
    });
  }

  onModuleInit(): void {
    setInterval(() => {
      void this.refreshQueueDepth();
    }, 15_000).unref();
  }

  async refreshQueueDepth(): Promise<void> {
    for (const q of this.producer.listQueues()) {
      const counts = await q.getJobCounts('waiting', 'active', 'failed', 'delayed', 'completed');
      for (const [state, n] of Object.entries(counts)) {
        this.queueDepth.set({ queue: q.name, state }, n);
      }
    }
  }

  async render(): Promise<string> {
    return this.registry.metrics();
  }
}
