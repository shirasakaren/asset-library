import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReportCategory, ReportStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ListQueryDto } from '../../../common/pagination/list-query.dto';

export class CreateReportDto {
  @ApiProperty()
  @IsString()
  assetId!: string;

  @ApiProperty({ enum: ReportCategory })
  @IsEnum(ReportCategory)
  category!: ReportCategory;

  @ApiProperty({ minLength: 4, maxLength: 1000 })
  @IsString()
  @MinLength(4)
  @MaxLength(1000)
  notes!: string;
}

export class ListReportsQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: ReportStatus })
  @IsOptional()
  @IsIn(Object.values(ReportStatus))
  status?: ReportStatus;

  @ApiPropertyOptional({ enum: ReportCategory })
  @IsOptional()
  @IsIn(Object.values(ReportCategory))
  category?: ReportCategory;
}

export type ReportActionKind = 'NOTHING' | 'ARCHIVE_ASSET' | 'DELETE_ASSET' | 'FORCE_DELETE_ASSET';

export class ActionReportDto {
  @ApiProperty()
  @IsString()
  @MinLength(4)
  @MaxLength(1000)
  adminNotes!: string;

  @ApiProperty({ enum: ['NOTHING', 'ARCHIVE_ASSET', 'DELETE_ASSET', 'FORCE_DELETE_ASSET'] })
  @IsIn(['NOTHING', 'ARCHIVE_ASSET', 'DELETE_ASSET', 'FORCE_DELETE_ASSET'])
  action!: ReportActionKind;

  @ApiPropertyOptional({
    description: 'Required when action=FORCE_DELETE_ASSET — value: "I understand".',
  })
  @IsOptional()
  @IsString()
  confirm?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  confirmedAt?: string;
}

export class DismissReportDto {
  @ApiProperty()
  @IsString()
  @MinLength(4)
  @MaxLength(1000)
  adminNotes!: string;
}

export class ReportDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ReportCategory }) category!: ReportCategory;
  @ApiProperty() notes!: string;
  @ApiProperty({ enum: ReportStatus }) status!: ReportStatus;
  @ApiProperty() assetId!: string;
  @ApiProperty() assetTitle!: string;
  @ApiProperty() assetSlug!: string;
  @ApiProperty() reporter!: { id: string; displayName: string; email?: string };
  @ApiPropertyOptional() adminNotes?: string | null;
  @ApiProperty() createdAt!: string;
  @ApiPropertyOptional() resolvedAt?: string;
}
