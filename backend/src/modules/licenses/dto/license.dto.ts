import { ApiProperty } from '@nestjs/swagger';

export class LicenseSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty() description!: string;
  @ApiProperty() sortOrder!: number;
}

export class LicenseDetailDto extends LicenseSummaryDto {
  @ApiProperty() fullText!: string;
}
