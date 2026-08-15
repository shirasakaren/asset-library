import { ApiProperty } from '@nestjs/swagger';

export class TagDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ description: 'Number of assets currently using this tag.' })
  usageCount!: number;
}
