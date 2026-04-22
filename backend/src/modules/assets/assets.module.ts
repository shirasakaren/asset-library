import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { LicensesModule } from '../licenses/licenses.module';
import { TagsModule } from '../tags/tags.module';
import { AssetMapperService } from './asset-mapper.service';
import { AssetsController } from './assets.controller';
import { AssetsListService } from './assets-list.service';
import { AssetsService } from './assets.service';
import { DiscoverService } from './discover.service';
import { PublishChecklistService } from './publish-checklist.service';

@Module({
  imports: [CategoriesModule, LicensesModule, TagsModule],
  controllers: [AssetsController],
  providers: [
    AssetsService,
    AssetsListService,
    AssetMapperService,
    DiscoverService,
    PublishChecklistService,
  ],
  exports: [AssetsService, AssetsListService, AssetMapperService, DiscoverService],
})
export class AssetsModule {}
