import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AvatarDto } from '../../auth/dto/me-response.dto';

export class UserSearchResultDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() isAdmin!: boolean;
}

export class UserPublicProfileDto {
  @ApiProperty() id!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ type: AvatarDto }) avatar!: AvatarDto;
  @ApiProperty() joinedAt!: string;
  @ApiProperty() publishedAssetCount!: number;
  @ApiPropertyOptional({
    description: 'Only present when the requester is the user themselves or an admin.',
  })
  email?: string;
}
