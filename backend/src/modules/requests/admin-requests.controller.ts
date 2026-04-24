import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditAction } from '../../common/audit/audit-action.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AdminGuard } from '../../common/guards/admin.guard';
import { AuthenticatedRequestUser } from '../../infra/keycloak/keycloak-auth.guard';
import {
  AdminUpdateAssetRequestDto,
  AssetRequestDto,
  ListAssetRequestsQueryDto,
} from './dto/request.dto';
import { RequestsService } from './requests.service';

@ApiTags('Admin')
@ApiBearerAuth('keycloak')
@Controller('admin/asset-requests')
@UseGuards(AdminGuard)
export class AdminRequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  @ApiOperation({ summary: 'List requests across every requester.' })
  @ApiOkResponse()
  list(@AuthUser() principal: AuthenticatedRequestUser, @Query() query: ListAssetRequestsQueryDto) {
    return this.requests.list(query, principal.user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a single asset request by id (admin view).' })
  @ApiOkResponse({ type: AssetRequestDto })
  getOne(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Param('id') id: string,
  ): Promise<AssetRequestDto> {
    return this.requests.get(id, principal.user);
  }

  @Patch(':id')
  @AuditAction({ action: 'asset_request.status_change_request', subjectType: 'AssetRequest' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin transition: IN_REVIEW | PENDING | APPROVED | REJECTED.' })
  @ApiOkResponse({ type: AssetRequestDto })
  update(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Body() dto: AdminUpdateAssetRequestDto,
  ): Promise<AssetRequestDto> {
    return this.requests.adminUpdate(id, principal.user, dto);
  }
}
