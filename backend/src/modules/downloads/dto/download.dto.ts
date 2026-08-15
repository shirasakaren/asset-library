import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DownloadSource } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class InitiateDownloadDto {
  @ApiProperty() @IsString() assetId!: string;
  @ApiProperty() @IsString() versionId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() fileId?: string;
  @ApiProperty({ enum: DownloadSource }) @IsEnum(DownloadSource) source!: DownloadSource;
}

export class DownloadFileItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() relativePath!: string;
  @ApiProperty() kind!: string;
  @ApiProperty() bytes!: string;
  @ApiPropertyOptional() getUrl?: string;
  @ApiPropertyOptional() expiresAt?: string;
}

export class OlderVersionRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() semver!: string;
  @ApiPropertyOptional() publishedAt?: string;
}

export class DownloadResponseDto {
  @ApiProperty() asset!: { id: string; title: string };
  @ApiProperty() version!: { id: string; semver: string; releaseNotes: object | null };
  @ApiProperty({ type: [DownloadFileItemDto] }) files!: DownloadFileItemDto[];
  @ApiProperty({ type: [OlderVersionRefDto] }) olderVersions!: OlderVersionRefDto[];
}
