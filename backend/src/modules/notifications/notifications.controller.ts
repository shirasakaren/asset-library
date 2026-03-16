import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthenticatedRequestUser } from '../../infra/keycloak/keycloak-auth.guard';
import { FlexibleAuthGuard } from '../../infra/keycloak/flexible-auth.guard';
import { NotificationsService } from './notifications.service';
import { WsFanoutService } from './ws-fanout.service';

@ApiTags('Notifications')
@ApiBearerAuth('keycloak')
@Controller('notifications')
@UseGuards(FlexibleAuthGuard)
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly wsFanout: WsFanoutService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Paginated notification inbox for the current user.' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean })
  @ApiOkResponse()
  async list(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.notifications.list(principal.user, {
      cursor,
