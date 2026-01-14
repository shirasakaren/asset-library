import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';

export class InitiateUploadDto {
  @ApiProperty() @IsString() assetId!: string;
  @ApiProperty() @IsString() versionId!: string;
  @ApiProperty({ maxLength: 512 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  relativePath!: string;
  @ApiProperty({ maxLength: 200 }) @IsString() @MaxLength(200) contentType!: string;
  @ApiProperty() @IsInt() @Min(0) bytes!: number;
}

export class InitiateUploadResponseDto {
  @ApiProperty() uploadId!: string;
  @ApiProperty() putUrl!: string;
  @ApiProperty() key!: string;
  @ApiProperty() fileId!: string;
  @ApiProperty() expiresAt!: string;
}

export class CompleteUploadDto {
  @ApiProperty() @IsString() uploadId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() etag?: string;
}

export class InitiateMultipartDto extends InitiateUploadDto {
  @ApiProperty({ minimum: 1, maximum: 10000 })
  @IsInt()
  @Min(1)
  @Max(10000)
  partCount!: number;
}

export class InitiateMultipartResponseDto {
  @ApiProperty() uploadId!: string;
  @ApiProperty() key!: string;
  @ApiProperty() fileId!: string;
  @ApiProperty() partUrls!: Array<{ partNumber: number; url: string }>;
  @ApiProperty() expiresAt!: string;
}

export class SignMultipartPartsDto {
  @ApiProperty() @IsString() uploadId!: string;
  @ApiProperty({ type: [Number] })
  @IsArray()
  @IsInt({ each: true })
  partNumbers!: number[];
}

export class CompletedPartDto {
  @ApiProperty() @IsInt() partNumber!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() etag?: string;
}

export class CompleteMultipartDto {
  @ApiProperty() @IsString() uploadId!: string;

