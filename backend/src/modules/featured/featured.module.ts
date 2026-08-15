import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { AdminFeaturedController } from './featured.controller';
import { FeaturedService } from './featured.service';

@Module({
  imports: [AssetsModule],
  controllers: [AdminFeaturedController],
  providers: [FeaturedService],
  exports: [FeaturedService],
})
export class FeaturedModule {}
