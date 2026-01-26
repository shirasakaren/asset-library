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
