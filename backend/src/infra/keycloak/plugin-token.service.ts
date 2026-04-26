import { Injectable } from '@nestjs/common';
import { PluginDeviceToken, User } from '@prisma/client';
import { createHmac, randomBytes } from 'node:crypto';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';

export const PLUGIN_TOKEN_SCHEME = 'PluginToken';

export interface IssuedPluginToken {
  deviceId: string;
  token: string;
  expiresAt: Date;
}

/**
 * Long-lived bearer token issued by *our* backend (not Keycloak) after a
 * successful plugin loopback-OAuth handshake. Stored as HMAC-SHA256 with
 * PLUGIN_TOKEN_PEPPER so a DB leak does not yield usable tokens.
 */
@Injectable()
export class PluginTokenService {
  private readonly pepper: string;
  private readonly ttlDays: number;

  constructor(
    private readonly prisma: PrismaService,
    config: AppConfigService,
  ) {
    this.pepper = config.get('PLUGIN_TOKEN_PEPPER') ?? '';
    this.ttlDays = config.get('PLUGIN_TOKEN_TTL_DAYS');
    if (!this.pepper && config.isProduction) {
      throw new Error('PLUGIN_TOKEN_PEPPER must be set in production.');
    }
  }

  hash(token: string): string {
    return createHmac('sha256', this.pepper).update(token).digest('hex');
  }

  private newExpiry(): Date {
    return new Date(Date.now() + this.ttlDays * 86_400_000);
  }

  async issue(user: User, deviceLabel: string): Promise<IssuedPluginToken> {
    const token = randomBytes(32).toString('base64url');
    const record = await this.prisma.pluginDeviceToken.create({
      data: {
        userId: user.id,
        deviceLabel,
        tokenHash: this.hash(token),
        expiresAt: this.newExpiry(),
      },
    });
    return { deviceId: record.id, token, expiresAt: record.expiresAt };
  }

  /**
   * Verify-and-touch: returns the (user, token-row) tuple when the token is
   * active. Updates `lastUsedAt` opportunistically; does NOT slide the expiry
   * (refresh is an explicit endpoint).
   */
  async verifyAndTouch(token: string): Promise<{ user: User; record: PluginDeviceToken } | null> {
    const record = await this.prisma.pluginDeviceToken.findUnique({
      where: { tokenHash: this.hash(token) },
      include: { user: true },
    });
    if (!record || record.revokedAt || record.expiresAt < new Date()) return null;
    if (!record.lastUsedAt || Date.now() - record.lastUsedAt.getTime() > 60_000) {
      // Avoid hammering Postgres on every single request — only persist
      // lastUsedAt once a minute per device.
      await this.prisma.pluginDeviceToken
        .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
        .catch(() => undefined);
    }
    return { user: record.user, record };
  }

  async refreshExpiry(token: string): Promise<Date | null> {
    const tokenHash = this.hash(token);
    const record = await this.prisma.pluginDeviceToken.findUnique({ where: { tokenHash } });
    if (!record || record.revokedAt || record.expiresAt < new Date()) return null;
    const updated = await this.prisma.pluginDeviceToken.update({
      where: { tokenHash },
      data: { expiresAt: this.newExpiry(), lastUsedAt: new Date() },
    });
    return updated.expiresAt;
  }

  async revokeByDeviceId(userId: string, deviceId: string): Promise<boolean> {
    const result = await this.prisma.pluginDeviceToken.updateMany({
      where: { id: deviceId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count > 0;
  }

  listActiveDevices(userId: string): Promise<PluginDeviceToken[]> {
    return this.prisma.pluginDeviceToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
    });
  }
}
