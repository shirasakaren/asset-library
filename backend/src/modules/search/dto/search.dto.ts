import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssetEngine } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const asArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value == null || value === '') return undefined;
  return Array.isArray(value)
    ? value.map(String)
    : String(value)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
};

export class SearchAssetsQueryDto {
  @ApiProperty() @IsString() q!: string;
  @ApiPropertyOptional({ enum: AssetEngine })
  @IsOptional()
  @IsEnum(AssetEngine)
  engine?: AssetEngine;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(asArray)
  @IsArray()
  categoryIds?: string[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(asArray)
  @IsArray()
  tags?: string[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(asArray)
  @IsArray()
  fileKinds?: string[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(asArray)
  @IsArray()
  renderPipelines?: string[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(asArray)
  @IsArray()
  targets?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() licenseSlug?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 24;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  offset?: number = 0;
  @ApiPropertyOptional({ enum: ['en', 'id'] }) @IsOptional() @IsString() locale?: 'en' | 'id';
}

export class SearchAssetHitDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty() shortDescription!: string;
  @ApiPropertyOptional() thumbnailUrl?: string;
  @ApiProperty() engine!: string;
  @ApiProperty() categoryName!: string;
  @ApiProperty() ownerName!: string;
  @ApiProperty() totalDownloads!: number;
}

export class SearchAssetsResponseDto {
  @ApiProperty({ type: [SearchAssetHitDto] }) hits!: SearchAssetHitDto[];
  @ApiProperty() processingTimeMs!: number;
  @ApiPropertyOptional() estimatedTotalHits?: number;
}
