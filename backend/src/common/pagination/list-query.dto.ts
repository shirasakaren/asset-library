import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Base query parameters every list endpoint accepts. Subclass and add
 * domain-specific filters via mixin.
 */
export class ListQueryDto {
  @ApiPropertyOptional({ description: 'Opaque base64url cursor from a previous page.' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 24 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 24;

  @ApiPropertyOptional({ enum: ['en', 'id'], description: 'Locale override for resolved fields.' })
  @IsOptional()
  @IsString()
  locale?: 'en' | 'id';
}

export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 100;

export function resolvePageSize(raw: number | undefined): number {
  if (!raw || raw < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(raw, MAX_PAGE_SIZE);
}
