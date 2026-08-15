import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString } from 'class-validator';
import { ListQueryDto } from '../../../common/pagination/list-query.dto';

export class ListAuditQueryDto extends ListQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() actorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() action?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subjectType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subjectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() to?: string;
}

export class AuditEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty() action!: string;
  @ApiProperty() subjectType!: string;
  @ApiProperty() subjectId!: string;
  @ApiPropertyOptional() actorId?: string;
  @ApiPropertyOptional() actorDisplayName?: string;
  @ApiPropertyOptional() actorEmail?: string;
  @ApiPropertyOptional() metadata?: Record<string, unknown>;
  @ApiProperty() createdAt!: string;
}
