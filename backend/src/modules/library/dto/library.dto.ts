import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssetEngine } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { ListQueryDto } from '../../../common/pagination/list-query.dto';
import { AssetSummaryDto } from '../../assets/dto/asset.dto';

const LIBRARY_SORTS = ['savedAt', 'alphabetical', 'recentlyUpdated'] as const;
type LibrarySort = (typeof LIBRARY_SORTS)[number];
const HIDDEN_MODES = ['true', 'false', 'all'] as const;

const asArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value == null || value === '') return undefined;
  return Array.isArray(value)
    ? value.map(String)
    : String(value)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
};

export class ListLibraryQueryDto extends ListQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
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
  @ApiPropertyOptional({ enum: AssetEngine })
  @IsOptional()
  @IsEnum(AssetEngine)
  engine?: AssetEngine;
  @ApiPropertyOptional({ enum: HIDDEN_MODES })
  @IsOptional()
  @IsIn(HIDDEN_MODES as unknown as string[])
  hidden?: 'true' | 'false' | 'all';
  @ApiPropertyOptional({ enum: LIBRARY_SORTS })
  @IsOptional()
  @IsIn(LIBRARY_SORTS as unknown as string[])
  sort?: LibrarySort;
}

export class LibraryItemDto {
  @ApiProperty() addedAt!: string;
  @ApiProperty() hidden!: boolean;
  @ApiProperty({ type: AssetSummaryDto }) asset!: AssetSummaryDto;
}

export class AddLibraryItemDto {
  @ApiProperty() @IsString() assetId!: string;
}

export class UpdateLibraryItemDto {
  @ApiProperty() @IsBoolean() hidden!: boolean;
}
