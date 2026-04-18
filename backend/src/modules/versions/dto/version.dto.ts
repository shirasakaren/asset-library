import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { SEMVER_REGEX } from '../../assets/dto/asset.dto';

export class CreateVersionDto {
  @ApiProperty({ example: '1.2.0' })
  @Matches(SEMVER_REGEX)
  semver!: string;

  @ApiPropertyOptional({ description: 'TipTap JSON keyed by locale: { en?, id? }.' })
  @IsOptional()
  @IsObject()
  releaseNotes?: object;
}

export class UpdateVersionDto {
  @ApiPropertyOptional({ description: 'TipTap JSON keyed by locale.' })
  @IsOptional()
  @IsObject()
  releaseNotes?: object;
}

export class CompatibilityRowDto {
  @ApiProperty({ example: '6000.1.14f1' })
  @IsString()
  @MaxLength(40)
  engineVersion!: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Unity render pipelines: URP|HDRP|SRP|BUILT_IN',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  renderPipelines?: string[];

  @ApiProperty({ type: [String], description: 'Platform targets (WINDOWS|MAC|...).' })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  targets!: string[];
}

export class SetCompatibilityDto {
  @ApiProperty({ type: CompatibilityRowDto, isArray: true })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CompatibilityRowDto)
  rows!: CompatibilityRowDto[];
}

export class VersionSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() semver!: string;
  @ApiProperty() isLatest!: boolean;
  @ApiProperty() analysisStatus!: string;
  @ApiPropertyOptional() publishedAt?: string;
  @ApiProperty() bytesTotal!: string;
  @ApiProperty() fileCount!: number;
  @ApiProperty() createdAt!: string;
}
