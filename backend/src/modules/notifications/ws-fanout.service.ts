import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfigService } from '../../config/app-config.service';
import { WsFanoutMessage } from '../jobs/contracts';

export type WsFanoutHandler = (message: WsFanoutMessage) => void;

const CHANNEL = 'ws:fanout';

/**
 * Cross-replica WebSocket fan-out via Redis pub/sub. The notify worker calls
 * `publish()`; every API replica subscribes and forwards matching messages
 * into its local `ConnectionRegistry` so the recipient's open sockets receive
 * the envelope no matter which replica handled the producing event.
 */
@Injectable()
export class WsFanoutService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WsFanoutService.name);
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private readonly handlers = new Set<WsFanoutHandler>();

  constructor(config: AppConfigService) {
    const url = config.get('REDIS_URL');
    this.publisher = new Redis(url, { lazyConnect: true });
    this.subscriber = new Redis(url, { lazyConnect: true });
  }

  async onModuleInit(): Promise<void> {
    await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
    await this.subscriber.subscribe(CHANNEL);
    this.subscriber.on('message', (channel, raw) => {
      if (channel !== CHANNEL) return;
      try {
        const message = JSON.parse(raw) as WsFanoutMessage;
        for (const handler of this.handlers) handler(message);
      } catch (err) {
        this.logger.warn(`Bad WS fan-out payload: ${(err as Error).message}`);
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.subscriber.quit().catch(() => undefined);
    await this.publisher.quit().catch(() => undefined);
  }

  /** Workers (notify) call this; every replica's gateway receives the message. */
  async publish(message: WsFanoutMessage): Promise<void> {
    await this.publisher.publish(CHANNEL, JSON.stringify(message));
  }

  /** API replicas register the gateway's local emitter as a handler. */
  subscribe(handler: WsFanoutHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}
