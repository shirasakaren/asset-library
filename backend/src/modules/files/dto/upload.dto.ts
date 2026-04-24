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

  // Optional + ignored: the server now sources authoritative ETags via
  // S3 ListParts. Kept so older clients posting `parts` still validate.
  @ApiPropertyOptional({ type: [CompletedPartDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompletedPartDto)
  parts?: CompletedPartDto[];
}

export class AbortMultipartDto {
  @ApiProperty() @IsString() uploadId!: string;
}

export class InitiateThumbnailDto {
  @ApiProperty() @IsString() assetId!: string;
  @ApiProperty({ maxLength: 100 }) @IsString() @MaxLength(100) contentType!: string;
  @ApiProperty() @IsInt() @Min(0) bytes!: number;
}

export class InitiateThumbnailResponseDto {
  @ApiProperty() putUrl!: string;
  @ApiProperty() key!: string;
  @ApiProperty() expiresAt!: string;
}

export class CompleteThumbnailDto {
  @ApiProperty() @IsString() assetId!: string;
  @ApiProperty() @IsString() key!: string;
}

export class InitiateEditorMediaDto {
  @ApiProperty({ maxLength: 100 }) @IsString() @MaxLength(100) contentType!: string;
  @ApiProperty() @IsInt() @Min(0) bytes!: number;
}

export class InitiateEditorMediaResponseDto {
  @ApiProperty() putUrl!: string;
  @ApiProperty() key!: string;
  @ApiProperty() viewUrl!: string;
  @ApiProperty() expiresAt!: string;
}

export class RefreshEditorMediaDto {
  @ApiProperty({ maxLength: 512 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  key!: string;
}

export class RefreshEditorMediaResponseDto {
  @ApiProperty() viewUrl!: string;
  @ApiProperty() expiresAt!: string;
}

export class ReorderFilesDto {
  @ApiProperty({ type: [String], description: 'File ids in the desired display order.' })
  @IsArray()
  @IsString({ each: true })
  orderedFileIds!: string[];
}
