import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateFeaturedSlotDto {
  @ApiProperty()
  @IsString()
  assetId!: string;

  @ApiPropertyOptional({
    description: 'S3 key for a custom banner (use the initiate upload endpoint).',
  })
  @IsOptional()
  @IsString()
  customBannerKey?: string;

  @ApiPropertyOptional({ description: 'Overrides Asset.title in the carousel.' })
  @IsOptional()
  @IsString()
  @MaxLength(140)
  customTitle?: string;

  @ApiPropertyOptional({ description: '{ en?, id? } overrides for the short description.' })
  @IsOptional()
  @IsObject()
  customShortDescription?: Record<string, string>;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateFeaturedSlotDto {
  @ApiPropertyOptional() @IsOptional() @IsString() customBannerKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(140) customTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() customShortDescription?: Record<string, string>;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class ReorderFeaturedSlotsDto {
