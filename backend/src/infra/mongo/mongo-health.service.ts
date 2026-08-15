import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

/**
 * Wraps the Mongoose connection with a readiness ping used by /readyz.
 */
@Injectable()
export class MongoHealthService {
  private readonly logger = new Logger(MongoHealthService.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  async ping(): Promise<boolean> {
    try {
      if (this.connection.readyState !== 1 || !this.connection.db) return false;
      await this.connection.db.admin().command({ ping: 1 });
      return true;
    } catch (err) {
      this.logger.error('Mongo ping failed', err as Error);
      return false;
    }
  }
}
