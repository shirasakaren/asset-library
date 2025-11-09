import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ListQueryDto } from '../../../common/pagination/list-query.dto';

export class ListAdminUsersQueryDto extends ListQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isAdmin?: boolean;
}

export class AdminUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() isAdmin!: boolean;
  @ApiProperty() locale!: string;
  @ApiProperty() createdAt!: string;
  @ApiPropertyOptional() publishedAssetCount?: number;
}

export class ConfirmActionDto {
  @ApiProperty({ example: 'I understand' })
  @IsString()
  confirm!: string;

  @ApiProperty()
  @IsString()
  confirmedAt!: string;
}
