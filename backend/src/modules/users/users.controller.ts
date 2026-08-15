import { Controller, ForbiddenException, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import {
  AuthenticatedRequestUser,
  KeycloakAuthGuard,
} from '../../infra/keycloak/keycloak-auth.guard';
import { UserPublicProfileDto, UserSearchResultDto } from './dto/user-public.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth('keycloak')
@Controller('users')
@UseGuards(KeycloakAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('search')
  @ApiOperation({ summary: 'Admin-only typeahead over users by email + displayName.' })
  @ApiQuery({ name: 'q', required: true })
  @ApiOkResponse({ type: UserSearchResultDto, isArray: true })
  search(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Query('q') q: string,
  ): Promise<UserSearchResultDto[]> {
    if (!principal.user.isAdmin) throw new ForbiddenException('Admins only.');
    return this.users.searchUsers(q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Public-facing user profile.' })
  @ApiOkResponse({ type: UserPublicProfileDto })
  profile(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Param('id') id: string,
  ): Promise<UserPublicProfileDto> {
    return this.users.getPublicProfile(id, principal.user);
  }
}
