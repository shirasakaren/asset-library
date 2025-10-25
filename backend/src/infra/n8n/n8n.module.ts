import { Global, Module } from '@nestjs/common';
import { N8nService } from './n8n.service';

@Global()
@Module({
  providers: [N8nService],
  exports: [N8nService],
})
export class N8nModule {}
