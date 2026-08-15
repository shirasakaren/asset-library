import { Module } from '@nestjs/common';
import { AdminLicensesController } from './admin-licenses.controller';
import { AdminLicensesService } from './admin-licenses.service';
import { LicensesController } from './licenses.controller';
import { LicensesService } from './licenses.service';

@Module({
  controllers: [LicensesController, AdminLicensesController],
  providers: [LicensesService, AdminLicensesService],
  exports: [LicensesService],
})
export class LicensesModule {}
