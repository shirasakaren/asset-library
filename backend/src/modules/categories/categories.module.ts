import { Module } from '@nestjs/common';
import { AdminCategoriesController } from './admin-categories.controller';
import { AdminCategoriesService } from './admin-categories.service';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

@Module({
  controllers: [CategoriesController, AdminCategoriesController],
  providers: [CategoriesService, AdminCategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
