import { Global, Module } from '@nestjs/common';
import { CachedService } from './cached.service';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService, CachedService],
  exports: [RedisService, CachedService],
})
export class RedisModule {}
