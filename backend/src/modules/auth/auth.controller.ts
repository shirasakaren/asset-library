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
