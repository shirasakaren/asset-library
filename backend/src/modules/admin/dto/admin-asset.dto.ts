import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class AdminAssetActionDto {
  @ApiProperty({ description: 'Required moderator reason recorded in the audit log.' })
  @IsString()
  @MinLength(4)
  @MaxLength(500)
  reason!: string;
}

export class AdminAssetForceDeleteDto extends AdminAssetActionDto {
  @ApiProperty({ example: 'I understand' })
  @IsString()
  confirm!: string;

  @ApiProperty({ example: '2026-05-20T03:00:00.000Z' })
  @IsString()
  confirmedAt!: string;
}

export class AdminAssetTransferDto {
  @ApiProperty()
  @IsString()
  newOwnerId!: string;
}
