import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
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

export class CreateLicenseDto {
  @ApiProperty()
  @IsString()
  @Matches(SLUG_REGEX)
  @MaxLength(80)
  slug!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(140)
  name!: string;

  @ApiProperty({ description: '{ en, id } short description.' })
  @IsObject()
  description!: { en: string; id: string };

  @ApiProperty({ description: '{ en, id } full legal text.' })
  @IsObject()
  fullText!: { en: string; id: string };

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

export class UpdateLicenseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(140)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  description?: { en?: string; id?: string };

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  fullText?: { en?: string; id?: string };

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

export class AdminLicenseDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty() description!: { en?: string; id?: string };
  @ApiProperty() fullText!: { en?: string; id?: string };
  @ApiProperty() sortOrder!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() assetCount!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}
