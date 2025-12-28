import { Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditAction } from '../../common/audit/audit-action.decorator';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import {
  AuthenticatedRequestUser,
  KeycloakAuthGuard,
} from '../../infra/keycloak/keycloak-auth.guard';
import { AuthService } from '../auth/auth.service';
import { MeResponseDto, PluginDeviceDto } from '../auth/dto/me-response.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { WsFanoutService } from '../notifications/ws-fanout.service';

interface MeWithDevicesDto extends MeResponseDto {
  devices: PluginDeviceDto[];
}

@ApiTags('Me')
@ApiBearerAuth('keycloak')
@Controller('me')
@UseGuards(KeycloakAuthGuard)
export class MeController {
  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly wsFanout: WsFanoutService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Same payload as /auth/me, plus the user's active plugin devices." })
  @ApiOkResponse()
  async me(@AuthUser() principal: AuthenticatedRequestUser): Promise<MeWithDevicesDto> {
    const [base, devices] = await Promise.all([
      this.auth.buildMe(principal.user, principal.role),
      this.auth.listPluginDevices(principal.user.id),
    ]);
