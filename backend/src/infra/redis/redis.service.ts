import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfigService } from '../../config/app-config.service';

/**
 * Single Redis client shared by BullMQ producers and any ad-hoc cache use.
 * Workers in Part 3 will instantiate their own connections from REDIS_URL.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  public readonly client: Redis;

  constructor(config: AppConfigService) {
    this.client = new Redis(config.get('REDIS_URL'), {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: true,
    });
  }

  async onModuleInit(): Promise<void> {
    if (process.env.OPENAPI_EXPORT === '1') return;
    // The client is lazyConnect, so it starts in the 'wait' state. In worker
    // mode a sibling provider can trip an auto-connect (any queued command
    // dials the socket) before this hook runs, and ioredis throws
    // "Redis is already connecting/connected" if connect() is called again —
    // which crash-looped the worker. Make startup idempotent: only dial from a
    // fresh state, otherwise wait for the in-flight connection to go ready.
    if (this.client.status === 'wait' || this.client.status === 'end') {
      await this.client.connect();
    } else if (this.client.status !== 'ready') {
      await new Promise<void>((resolve, reject) => {
        const onReady = (): void => {
          cleanup();
          resolve();
        };
        const onError = (err: Error): void => {
          cleanup();
