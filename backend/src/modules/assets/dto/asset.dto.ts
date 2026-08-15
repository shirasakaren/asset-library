import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssetEngine, AssetStatus, Locale } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Matches,
  ValidateNested,
} from 'class-validator';
import { AvatarDto } from '../../auth/dto/me-response.dto';

export const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;

export class AssetTranslationInputDto {
  @ApiProperty({ enum: ['en', 'id'] })
  @IsIn(['en', 'id'])
  locale!: Locale;

  @ApiProperty({ maxLength: 280 })
  @IsString()
  @MaxLength(280)
  shortDescription!: string;

  @ApiProperty({ description: 'TipTap JSON document (full schema).' })
  @IsObject()
  longDescription!: object;
}

export class CreateAssetDto {
  @ApiProperty({ maxLength: 140 })
  @IsString()
  @Length(3, 140)
  title!: string;

  @ApiProperty({ enum: AssetEngine })
  @IsEnum(AssetEngine)
  engine!: AssetEngine;

  @ApiProperty()
  @IsString()
  categoryId!: string;

  @ApiProperty()
  @IsString()
  licenseId!: string;

  @ApiProperty({ example: '1.0.0' })
  @Matches(SEMVER_REGEX)
  semver!: string;

  @ApiProperty({ type: AssetTranslationInputDto, isArray: true, minimum: 1 })
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => AssetTranslationInputDto)
  translations!: AssetTranslationInputDto[];

  @ApiPropertyOptional({ type: String, isArray: true, description: 'Free-form tag display names.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresEmptyProject?: boolean;
}

export class UpdateAssetDto {
  @ApiPropertyOptional({ maxLength: 140 })
  @IsOptional()
  @IsString()
  @Length(3, 140)
  title?: string;

  @ApiPropertyOptional({
    description: 'Slug. Server enforces uniqueness; rejected after publish.',
    maxLength: 120,
  })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  slug?: string;

  @ApiPropertyOptional({
    enum: AssetEngine,
    description: 'Locked after publish (server rejects with 400).',
  })
  @IsOptional()
  @IsEnum(AssetEngine)
  engine?: AssetEngine;

  @ApiPropertyOptional({
    description:
      'Semver of the latest version. Routed to the latest AssetVersion row, not the Asset itself. Locked after publish.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  semver?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  licenseId?: string;

  @ApiPropertyOptional({ type: AssetTranslationInputDto, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => AssetTranslationInputDto)
  translations?: AssetTranslationInputDto[];

  @ApiPropertyOptional({ type: String, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresEmptyProject?: boolean;

  @ApiPropertyOptional({
    description:
      'Owner-curated preview gallery. Array of `{ id, kind, key, label, mime, viewUrl? }`. `viewUrl` is ignored on write — the backend always re-signs from `key`.',
    type: Object,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(24)
  previewMedia?: PreviewMediaInputDto[];
}

export class PreviewMediaInputDto {
  @ApiProperty() @IsString() id!: string;
  @ApiProperty({ enum: ['image', 'video', 'audio', '3d'] })
  @IsString()
  kind!: 'image' | 'video' | 'audio' | '3d';
  /** Full-resolution / original object key. */
  @ApiProperty() @IsString() key!: string;
  /** Compressed display variant key (images only). */
  @ApiPropertyOptional() @IsOptional() @IsString() displayKey?: string;
  @ApiProperty() @IsString() label!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mime?: string;
  /** visible (default) | blur (NSFW, click to reveal) | hidden. */
  @ApiPropertyOptional({ enum: ['visible', 'blur', 'hidden'] })
  @IsOptional()
  @IsIn(['visible', 'blur', 'hidden'])
  visibility?: 'visible' | 'blur' | 'hidden';
  /** Optional warning label shown over a blurred item. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) warning?: string;
}

export class PublishAssetDto {}

export class PreviewMediaItemDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['image', 'video', 'audio', '3d'] })
  kind!: 'image' | 'video' | 'audio' | '3d';
  @ApiProperty() key!: string;
  @ApiPropertyOptional() displayKey?: string;
  @ApiProperty() label!: string;
  /** Fast display URL (compressed variant if present, else the original). */
  @ApiProperty() viewUrl!: string;
  /** Full-resolution URL — used when the viewer clicks to enlarge. */
  @ApiProperty() originalUrl!: string;
  @ApiPropertyOptional() mime?: string;
  @ApiPropertyOptional({ enum: ['visible', 'blur', 'hidden'] })
  visibility?: 'visible' | 'blur' | 'hidden';
  @ApiPropertyOptional() warning?: string;
}

export class AssetSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty() shortDescription!: string;
  @ApiProperty({ enum: AssetEngine }) engine!: AssetEngine;
  @ApiProperty({ enum: AssetStatus }) status!: AssetStatus;
  @ApiPropertyOptional() thumbnailUrl?: string;
  @ApiProperty() ownerDisplayName!: string;
  @ApiProperty() categoryName!: string;
  @ApiProperty() totalDownloads!: number;
  @ApiProperty() totalSaves!: number;
  @ApiProperty() updatedAt!: string;
  @ApiPropertyOptional() publishedAt?: string;
}

export class AssetOwnerDto {
  @ApiProperty() id!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ type: AvatarDto }) avatar!: AvatarDto;
}

export class AssetThumbnailDto {
  @ApiPropertyOptional() key?: string;
  @ApiPropertyOptional() url?: string;
}

export class AssetCategoryRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
}

export class AssetLicenseRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
}

export class AssetTagDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() displayName!: string;
}

export class AssetVersionFileTreeNodeDto {
  @ApiProperty() id!: string;
  @ApiProperty() relativePath!: string;
  @ApiProperty() kind!: string;
  @ApiProperty() bytes!: string; // bigint stringified
  @ApiPropertyOptional() meta?: object;
}

export class AssetVersionCompatibilityDto {
  @ApiProperty() engineVersion!: string;
  @ApiProperty({ type: [String] }) renderPipelines!: string[];
  @ApiProperty({ type: [String] }) targets!: string[];
}

export class AssetVersionDependencyDto {
  @ApiProperty() name!: string;
  @ApiPropertyOptional() version?: string;
  @ApiProperty() source!: string;
}

export class AssetVersionPayloadDto {
  @ApiProperty() id!: string;
  @ApiProperty() semver!: string;
  @ApiProperty({ description: 'TipTap JSON keyed by locale.' }) releaseNotes!: object;
  @ApiPropertyOptional() publishedAt?: string;
  @ApiProperty() isLatest!: boolean;
  @ApiProperty() analysisStatus!: string;
  @ApiProperty() bytesTotal!: string;
  @ApiProperty() fileCount!: number;
  @ApiProperty({ type: AssetVersionFileTreeNodeDto, isArray: true })
  files!: AssetVersionFileTreeNodeDto[];
  @ApiProperty({ type: AssetVersionCompatibilityDto, isArray: true })
  compatibility!: AssetVersionCompatibilityDto[];
  @ApiProperty({ type: AssetVersionDependencyDto, isArray: true })
  dependencies!: AssetVersionDependencyDto[];
  @ApiProperty() requiresEmptyProject!: boolean;
}

export class AssetDetailDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty() shortDescription!: string;
  @ApiProperty({ description: 'TipTap JSON.' }) longDescription!: object | null;
  @ApiProperty({ type: [String] }) availableLocales!: Locale[];
  @ApiProperty({ enum: AssetEngine }) engine!: AssetEngine;
  @ApiProperty({ type: AssetCategoryRefDto }) category!: AssetCategoryRefDto;
  @ApiProperty({ type: AssetLicenseRefDto }) license!: AssetLicenseRefDto;
  @ApiProperty({ type: AssetTagDto, isArray: true }) tags!: AssetTagDto[];
  @ApiProperty({ type: AssetThumbnailDto }) thumbnail!: AssetThumbnailDto;
  @ApiPropertyOptional({ type: AssetThumbnailDto }) thumbnailAutoGenerated?: AssetThumbnailDto;
  @ApiProperty({ type: Object, isArray: true }) previewMedia!: PreviewMediaItemDto[];
  @ApiProperty({ type: AssetOwnerDto }) owner!: AssetOwnerDto;
  @ApiProperty({ type: AssetVersionPayloadDto, isArray: true }) versions!: AssetVersionPayloadDto[];
  @ApiProperty() totalDownloads!: number;
  @ApiProperty() totalSaves!: number;
  @ApiProperty({ enum: AssetStatus }) status!: AssetStatus;
  @ApiPropertyOptional() publishedAt?: string;
  @ApiProperty() updatedAt!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty() isSaved!: boolean;
  @ApiProperty() canEdit!: boolean;
  @ApiProperty() canDelete!: boolean;
  @ApiProperty() canArchive!: boolean;
}
