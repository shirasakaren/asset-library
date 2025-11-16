import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuditAction } from '../../common/audit/audit-action.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AdminGuard } from '../../common/guards/admin.guard';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import {
  AuthenticatedRequestUser,
  KeycloakAuthGuard,
} from '../../infra/keycloak/keycloak-auth.guard';
import {
  ActionReportDto,
  CreateReportDto,
  DismissReportDto,
  ListReportsQueryDto,
  ReportDto,
} from './dto/report.dto';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@ApiBearerAuth('keycloak')
@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  // ─── Public submit ──────────────────────────────────────────────────────

  @Post('reports')
  @UseGuards(KeycloakAuthGuard)
  @RateLimit({ windowSec: 86_400, max: 5, scope: 'user', name: 'reports.create' })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a report on an asset (5 per user per day).' })
  @ApiCreatedResponse()
  create(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Body() dto: CreateReportDto,
  ): Promise<{ id: string }> {
    return this.reports.create(dto, principal.user);
  }

  // ─── Admin queue ────────────────────────────────────────────────────────

  @Get('admin/reports')
