import { Module } from '@nestjs/common';
import { AdminTagsController } from './admin-tags.controller';
import { AdminTagsService } from './admin-tags.service';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';

@Module({
  controllers: [TagsController, AdminTagsController],
  providers: [TagsService, AdminTagsService],
  exports: [TagsService],
})
export class TagsModule {}
