import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssetRequestStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, IsUrl, MaxLength, Min } from 'class-validator';
import { ListQueryDto } from '../../../common/pagination/list-query.dto';

export class CreateAssetRequestDto {
  @ApiProperty()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  assetLink!: string;

  @ApiProperty({ example: 'Unity 3D model' })
  @IsString()
  @MaxLength(80)
  assetType!: string;

  @ApiProperty({ description: 'How will this asset be used internally?' })
  @IsString()
  @MaxLength(2000)
  intendedUse!: string;

  @ApiPropertyOptional({ description: 'Indicative price the requester saw.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ListAssetRequestsQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: AssetRequestStatus })
  @IsOptional()
  @IsIn(Object.values(AssetRequestStatus))
  status?: AssetRequestStatus;

  /** Admins-only convenience flag; ignored for non-admins. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requesterId?: string;
}

export class AssetRequestDto {
  @ApiProperty() id!: string;
  @ApiProperty() assetLink!: string;
  @ApiProperty() assetType!: string;
  @ApiProperty() intendedUse!: string;
  @ApiPropertyOptional() price?: number | null;
  @ApiPropertyOptional() notes?: string | null;
  @ApiProperty({ enum: AssetRequestStatus }) status!: AssetRequestStatus;
  @ApiPropertyOptional() adminComment?: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
  @ApiProperty() requester!: { id: string; displayName: string };
}

import {
  IsIn as IsIn2,
  IsOptional as IsOptional2,
  IsString as IsString2,
  MaxLength as MaxLength2,
} from 'class-validator';

const ADMIN_REVIEW_STATUSES: AssetRequestStatus[] = [
  AssetRequestStatus.IN_REVIEW,
  AssetRequestStatus.PENDING,
  AssetRequestStatus.APPROVED,
  AssetRequestStatus.REJECTED,
];

export class AdminUpdateAssetRequestDto {
  @ApiProperty({ enum: ADMIN_REVIEW_STATUSES })
  @IsIn2(ADMIN_REVIEW_STATUSES)
  status!: AssetRequestStatus;

  @ApiPropertyOptional({ description: 'Required when transitioning to REJECTED.' })
  @IsOptional2()
  @IsString2()
  @MaxLength2(2000)
  adminComment?: string;
}
