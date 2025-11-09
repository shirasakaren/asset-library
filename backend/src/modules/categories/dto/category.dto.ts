import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CategoryDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ example: '3D Models' }) name!: string;
  @ApiPropertyOptional() iconKey?: string;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ description: 'Count of published assets in this category.' })
  assetCount!: number;
}
