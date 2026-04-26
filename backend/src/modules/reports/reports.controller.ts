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
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Paginated moderation queue.' })
  @ApiOkResponse()
  list(@Query() query: ListReportsQueryDto) {
    return this.reports.list(query);
  }

  @Get('admin/reports/:id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Report detail with linked asset snapshot.' })
  @ApiOkResponse({ type: ReportDto })
  detail(@Param('id') id: string): Promise<ReportDto> {
    return this.reports.get(id);
  }

  @Post('admin/reports/:id/start-review')
  @UseGuards(AdminGuard)
  @AuditAction({ action: 'report.start_review_request', subjectType: 'Report' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Flip OPEN → REVIEWING.' })
  startReview(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.reports.startReview(id, principal.user);
  }

  @Post('admin/reports/:id/action')
  @UseGuards(AdminGuard)
  @AuditAction({ action: 'report.action_request', subjectType: 'Report' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Action a report — archive / delete / force-delete the asset (atomically).',
  })
  action(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Body() dto: ActionReportDto,
  ): Promise<void> {
    return this.reports.action(id, principal.user, dto);
  }

  @Post('admin/reports/:id/dismiss')
  @UseGuards(AdminGuard)
  @AuditAction({ action: 'report.dismiss_request', subjectType: 'Report' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Dismiss with admin notes.' })
  dismiss(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Body() dto: DismissReportDto,
  ): Promise<void> {
    return this.reports.dismiss(id, principal.user, dto);
  }
}
