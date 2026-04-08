import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../../common/guards/admin.guard';
import { DashboardResponseDto, DashboardService } from './dashboard.service';

@ApiTags('Admin')
@ApiBearerAuth('keycloak')
@Controller('admin/dashboard')
@UseGuards(AdminGuard)
export class AdminDashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiOperation({
    summary: 'Composite admin home payload: counts, storage, charts, top assets, recent audit.',
  })
  @ApiOkResponse()
  get(): Promise<DashboardResponseDto> {
    return this.dashboard.get();
  }
}
