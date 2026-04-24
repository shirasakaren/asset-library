import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditAction } from '../../common/audit/audit-action.decorator';
import { RequireConfirmation } from '../../common/confirmation/require-confirmation.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AdminGuard } from '../../common/guards/admin.guard';
import { AuthenticatedRequestUser } from '../../infra/keycloak/keycloak-auth.guard';
import { AdminUsersService } from './admin-users.service';
import { ConfirmActionDto, ListAdminUsersQueryDto } from './dto/admin-user.dto';

@ApiTags('Admin')
@ApiBearerAuth('keycloak')
@Controller('admin/users')
@UseGuards(AdminGuard)
export class AdminUsersController {
  constructor(private readonly admin: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: 'Paginated user list with email/displayName search.' })
  @ApiOkResponse()
  list(@Query() query: ListAdminUsersQueryDto) {
    return this.admin.list(query);
  }

  @Post(':id/promote')
  @RequireConfirmation()
  @AuditAction({ action: 'user.promote_request', subjectType: 'User' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Promote a user to admin. Requires confirmation phrase.' })
  promote(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Body() _dto: ConfirmActionDto,
  ): Promise<void> {
    return this.admin.promote(id, principal.user);
  }

  @Post(':id/demote')
  @RequireConfirmation()
  @AuditAction({ action: 'user.demote_request', subjectType: 'User' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Demote an admin. Refuses if it would leave zero admins or target is bootstrap.',
  })
  demote(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Body() _dto: ConfirmActionDto,
  ): Promise<void> {
    return this.admin.demote(id, principal.user);
  }
}
