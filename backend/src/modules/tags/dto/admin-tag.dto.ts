import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { ListQueryDto } from '../../../common/pagination/list-query.dto';

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export class ListTagsQueryDto extends ListQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  minUsage?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  maxUsage?: number;
}

export class MergeTagsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  fromTagIds!: string[];

  @ApiProperty()
  @IsString()
  intoTagId!: string;
}

export class UpdateTagDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(SLUG_REGEX)
  @MaxLength(80)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;
}

export class AdminTagDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() usageCount!: number;
  @ApiProperty() createdAt!: string;
}
