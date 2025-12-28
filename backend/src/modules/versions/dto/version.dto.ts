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

