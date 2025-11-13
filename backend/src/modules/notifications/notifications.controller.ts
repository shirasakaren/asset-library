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
      limit: limit ? Number(limit) : undefined,
      unreadOnly: unreadOnly === 'true',
    });
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Cheap unread counter for the bell badge.' })
  async unreadCount(@AuthUser() principal: AuthenticatedRequestUser): Promise<{ count: number }> {
    return { count: await this.notifications.unreadCount(principal.user) };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a single notification as read.' })
  async markRead(@AuthUser() principal: AuthenticatedRequestUser, @Param('id') id: string) {
    const row = await this.notifications.markRead(principal.user, id);
    // Fan out to other tabs/devices so they also dim the badge.
