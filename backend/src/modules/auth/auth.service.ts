import { Injectable, UnauthorizedException } from '@nestjs/common';
import { User } from '@prisma/client';
import { resolveAvatar } from '../../common/avatar/avatar';
import { AppConfigService } from '../../config/app-config.service';
import { KeycloakJwksProvider } from '../../infra/keycloak/keycloak-jwks.provider';
import { IssuedPluginToken, PluginTokenService } from '../../infra/keycloak/plugin-token.service';
import { AppRole } from '../../infra/keycloak/role-resolver.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { MeResponseDto, PluginDeviceDto } from './dto/me-response.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pluginTokens: PluginTokenService,
    private readonly jwks: KeycloakJwksProvider,
    private readonly users: UsersService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Builds the response payload for `GET /auth/me`. The role + counter fields
   * are computed once per request — cheap enough not to cache.
   */
  async buildMe(user: User, role: AppRole): Promise<MeResponseDto> {
    const [hasPublishedAssets, unreadNotifications] = await Promise.all([
      this.prisma.asset.findFirst({
        where: { ownerId: user.id, status: 'PUBLISHED' },
        select: { id: true },
      }),
      this.prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      locale: user.locale,
      isAdmin: user.isAdmin,
      role,
      avatar: resolveAvatar(user.id, user.displayName, user.email),
      hasPublishedAssets: !!hasPublishedAssets,
      unreadNotifications,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async setLocale(user: User, locale: 'en' | 'id'): Promise<User> {
    return this.users.updateLocale(user.id, locale);
  }

  /**
   * Verifies a Keycloak access token (the plugin obtained it via the loopback
   * OAuth flow), upserts the matching User row if needed, and mints a long-
