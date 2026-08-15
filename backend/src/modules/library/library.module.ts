import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { LibraryController } from './library.controller';
import { LibraryService } from './library.service';

@Module({
  imports: [AssetsModule],
  controllers: [LibraryController],
  providers: [LibraryService],
  exports: [LibraryService],
})
export class LibraryModule {}
