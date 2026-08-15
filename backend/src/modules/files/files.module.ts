import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  imports: [AssetsModule],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
