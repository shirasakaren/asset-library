import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Locale } from '@prisma/client';
import { IsIn, IsString, Length, MaxLength } from 'class-validator';
import { AppRole } from '../../../infra/keycloak/role-resolver.service';

export class AvatarDto {
  @ApiProperty({ example: 'ID' })
  initials!: string;

  @ApiProperty({ example: 'brand-blue' })
  bgColor!: string;

  @ApiProperty({ example: 'ink-white' })
  fgColor!: string;
}

export class MeResponseDto {
  @ApiProperty({ example: 'cln1abcde' })
  id!: string;

  @ApiProperty({ example: 'admin@labmgm.org' })
  email!: string;

  @ApiProperty({ example: 'Idham' })
  displayName!: string;

  @ApiProperty({ enum: ['en', 'id'], example: 'en' })
  locale!: Locale;

  @ApiProperty()
  isAdmin!: boolean;

  @ApiProperty({ enum: ['admin', 'contributor', 'user'] })
  role!: AppRole;

  @ApiProperty({ type: AvatarDto })
  avatar!: AvatarDto;

  @ApiProperty()
  hasPublishedAssets!: boolean;

  @ApiProperty({
    example: 0,
    description: 'Stub returns 0 until Part 3 notification fan-out lands.',
  })
  unreadNotifications!: number;

  @ApiProperty({ description: 'ISO 8601 UTC.' })
  createdAt!: string;
}

export class UpdateLocaleDto {
  @ApiProperty({ enum: ['en', 'id'] })
  @IsIn(['en', 'id'])
  locale!: Locale;
}

export class PluginExchangeDto {
  @ApiProperty({ description: 'Bearer token obtained from Keycloak in the plugin loopback flow.' })
  @IsString()
  @Length(20, 8192)
  keycloakAccessToken!: string;

  @ApiProperty({ example: 'Unity 2022.3 — DESKTOP-ABCD', maxLength: 120 })
  @IsString()
  @MaxLength(120)
  deviceLabel!: string;
}

export class PluginExchangeResponseDto {
  @ApiProperty()
  deviceToken!: string;

  @ApiProperty()
  deviceId!: string;

  @ApiProperty()
  expiresAt!: string;
}

export class PluginRefreshDto {
  @ApiProperty()
  @IsString()
  @Length(20, 512)
  deviceToken!: string;
}

export class PluginRefreshResponseDto {
  @ApiProperty()
  expiresAt!: string;
}

export class PluginRevokeDto {
  @ApiProperty()
  @IsString()
  deviceId!: string;
}

export class PluginDeviceDto {
  @ApiProperty() id!: string;
  @ApiProperty() deviceLabel!: string;
  @ApiProperty() createdAt!: string;
  @ApiPropertyOptional() lastUsedAt?: string;
  @ApiProperty() expiresAt!: string;
}
