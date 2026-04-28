import { ApiPropertyOptional } from '@nestjs/swagger';
import { AssetEngine } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { ListQueryDto } from '../../../common/pagination/list-query.dto';

const ASSET_SORTS = [
  'newest',
  'mostDownloaded',
  'recentlyUpdated',
  'alphabetical',
  'mostSaved',
] as const;
export type AssetSort = (typeof ASSET_SORTS)[number];

const asArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value == null || value === '') return undefined;
  if (Array.isArray(value)) return value.map(String);
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

export class ListAssetsQueryDto extends ListQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
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
  @ApiPropertyOptional() @IsOptional() @IsString() licenseSlug?: string;
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
  @ApiPropertyOptional({ enum: ASSET_SORTS })
  @IsOptional()
  @IsIn(ASSET_SORTS as unknown as string[])
  sort?: AssetSort;
  @ApiPropertyOptional() @IsOptional() @IsString() ownerId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeUnpublished?: boolean;
}
