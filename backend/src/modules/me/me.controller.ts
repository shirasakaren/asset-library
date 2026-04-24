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
    return { ...base, devices };
  }

  @Post('devices/:id/revoke')
  @AuditAction({ action: 'me.revoke_device', subjectType: 'PluginDeviceToken' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Revoke one of the user's plugin devices." })
  async revokeDevice(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.auth.revokePluginDevice(principal.user.id, id);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Logout side-effect: audit row + WS broadcast to the user's open tabs.",
  })
  async logout(@AuthUser() principal: AuthenticatedRequestUser): Promise<void> {
    await this.audit.record({
      actorId: principal.user.id,
      action: 'me.logout',
      subjectType: 'User',
      subjectId: principal.user.id,
    });
    const envelope = this.notifications.newWsEnvelope('session:logout', {
      userId: principal.user.id,
      at: new Date().toISOString(),
    });
    await this.wsFanout.publish({ userId: principal.user.id, ...envelope });
  }
}
