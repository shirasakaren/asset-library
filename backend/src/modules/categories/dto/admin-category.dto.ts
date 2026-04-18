import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export class CreateCategoryDto {
  @ApiProperty({ example: '3d-models' })
  @IsString()
  @Matches(SLUG_REGEX, { message: 'slug must be lowercase kebab-case' })
  @MaxLength(80)
  slug!: string;

  @ApiProperty({ description: 'Multilingual label: { en, id }.' })
  @IsObject()
  name!: { en: string; id: string };

  @ApiPropertyOptional({ description: 'S3 key for an SVG / small PNG icon.' })
  @IsOptional()
  @IsString()
  iconKey?: string;

  @ApiPropertyOptional({ default: 999 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(SLUG_REGEX)
  @MaxLength(80)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  name?: { en?: string; id?: string };

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  iconKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ReorderCategoriesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  orderedIds!: string[];
}

export class CategoryIconInitiateDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MaxLength(100)
  contentType!: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  @MaxLength(256_000 as unknown as number) // doc-only — real limit lives in service
  bytes!: number;
}

export class AdminCategoryDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: { en?: string; id?: string };
  @ApiPropertyOptional() iconKey?: string;
  @ApiPropertyOptional() iconUrl?: string;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() assetCount!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}
