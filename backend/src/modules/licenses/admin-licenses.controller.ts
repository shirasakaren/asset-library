import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
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
import { AuthenticatedRequestUser } from '../../infra/keycloak/keycloak-auth.guard';
import { AdminLicensesService } from './admin-licenses.service';
import { AdminLicenseDto, CreateLicenseDto, UpdateLicenseDto } from './dto/admin-license.dto';

@ApiTags('Admin')
@ApiBearerAuth('keycloak')
@Controller('admin/licenses')
@UseGuards(AdminGuard)
export class AdminLicensesController {
  constructor(private readonly admin: AdminLicensesService) {}

  @Get()
  @ApiOperation({ summary: 'List every license template (active + inactive).' })
  @ApiOkResponse({ type: AdminLicenseDto, isArray: true })
  list(): Promise<AdminLicenseDto[]> {
    return this.admin.list();
  }

  @Post()
  @AuditAction({
    action: 'license.create_request',
    subjectType: 'License',
    subjectParam: 'body.slug',
  })
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ type: AdminLicenseDto })
  create(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Body() dto: CreateLicenseDto,
  ): Promise<AdminLicenseDto> {
    return this.admin.create(principal.user, dto);
  }

  @Patch(':id')
  @AuditAction({ action: 'license.update_request', subjectType: 'License' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AdminLicenseDto })
  update(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateLicenseDto,
  ): Promise<AdminLicenseDto> {
    return this.admin.update(id, principal.user, dto);
  }

  @Delete(':id')
  @AuditAction({ action: 'license.delete_request', subjectType: 'License' })
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@AuthUser() principal: AuthenticatedRequestUser, @Param('id') id: string): Promise<void> {
    return this.admin.remove(id, principal.user);
  }
}
