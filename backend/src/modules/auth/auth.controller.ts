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
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import {
  AuthenticatedRequestUser,
  KeycloakAuthGuard,
} from '../../infra/keycloak/keycloak-auth.guard';
import { AuthService } from './auth.service';
import {
  MeResponseDto,
  PluginDeviceDto,
  PluginExchangeDto,
  PluginExchangeResponseDto,
  PluginRefreshDto,
  PluginRefreshResponseDto,
  PluginRevokeDto,
  UpdateLocaleDto,
} from './dto/me-response.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('me')
  @UseGuards(KeycloakAuthGuard)
  @ApiBearerAuth('keycloak')
  @ApiOperation({ summary: 'Return the authenticated user, with derived role + avatar.' })
  @ApiOkResponse({ type: MeResponseDto })
  me(@AuthUser() principal: AuthenticatedRequestUser): Promise<MeResponseDto> {
    return this.auth.buildMe(principal.user, principal.role);
  }

  @Patch('me/locale')
  @UseGuards(KeycloakAuthGuard)
  @ApiBearerAuth('keycloak')
  @ApiOperation({ summary: "Persist the user's preferred locale." })
  @ApiOkResponse({ type: MeResponseDto })
  async updateLocale(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Body() body: UpdateLocaleDto,
  ): Promise<MeResponseDto> {
    const updated = await this.auth.setLocale(principal.user, body.locale);
    return this.auth.buildMe(updated, principal.role);
  }

  // ─── Plugin device-token flow ───────────────────────────────────────────
  // These endpoints do not require Keycloak Bearer auth themselves — the
  // plugin POSTs its just-acquired Keycloak access token in the body for
  // /exchange, and refresh/revoke/devices identify the caller by the
  // already-issued device token.

  @Public()
  @RateLimit({ windowSec: 60, max: 20, scope: 'ip', name: 'auth.plugin_exchange' })
  @Post('plugin/exchange')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Exchange a Keycloak access token for a long-lived plugin device token.',
  })
  @ApiOkResponse({ type: PluginExchangeResponseDto })
  async exchangePlugin(@Body() body: PluginExchangeDto): Promise<PluginExchangeResponseDto> {
    const issued = await this.auth.exchangePluginToken(body.keycloakAccessToken, body.deviceLabel);
    return {
      deviceToken: issued.token,
      deviceId: issued.deviceId,
      expiresAt: issued.expiresAt.toISOString(),
    };
  }

  @Public()
  @Post('plugin/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Slide the expiry of an existing plugin device token.' })
  @ApiOkResponse({ type: PluginRefreshResponseDto })
  async refreshPlugin(@Body() body: PluginRefreshDto): Promise<PluginRefreshResponseDto> {
    const next = await this.auth.refreshPluginToken(body.deviceToken);
    return { expiresAt: next.toISOString() };
  }

  @Post('plugin/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(KeycloakAuthGuard)
  @ApiBearerAuth('keycloak')
  @ApiOperation({ summary: 'Revoke one of your own plugin devices.' })
  async revokePlugin(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Body() body: PluginRevokeDto,
  ): Promise<void> {
    await this.auth.revokePluginDevice(principal.user.id, body.deviceId);
  }

  @Get('plugin/devices')
  @UseGuards(KeycloakAuthGuard)
  @ApiBearerAuth('keycloak')
  @ApiOperation({ summary: 'List active plugin devices for the current user.' })
  @ApiOkResponse({ type: PluginDeviceDto, isArray: true })
  listPluginDevices(@AuthUser() principal: AuthenticatedRequestUser): Promise<PluginDeviceDto[]> {
    return this.auth.listPluginDevices(principal.user.id);
  }

  @Delete('plugin/devices/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(KeycloakAuthGuard)
  @ApiBearerAuth('keycloak')
  @ApiOperation({ summary: 'Revoke a plugin device by id.' })
  async deletePluginDevice(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Param('id') deviceId: string,
  ): Promise<void> {
    await this.auth.revokePluginDevice(principal.user.id, deviceId);
  }
}
