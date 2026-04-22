import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FastifyReply } from 'fastify';
import { AuditAction } from '../../common/audit/audit-action.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { RequireConfirmation } from '../../common/confirmation/require-confirmation.decorator';
import { AdminGuard } from '../../common/guards/admin.guard';
import { AuthenticatedRequestUser } from '../../infra/keycloak/keycloak-auth.guard';
import { AssetDetailDto, UpdateAssetDto } from '../assets/dto/asset.dto';
import { AssetsListService } from '../assets/assets-list.service';
import { AssetsService } from '../assets/assets.service';
import { ListAssetsQueryDto } from '../assets/dto/list-assets-query.dto';
import { AdminAssetsModerationService } from './assets-moderation.service';
import {
  AdminAssetActionDto,
  AdminAssetForceDeleteDto,
  AdminAssetTransferDto,
} from './dto/admin-asset.dto';

@ApiTags('Admin')
@ApiBearerAuth('keycloak')
@Controller('admin/assets')
@UseGuards(AdminGuard)
export class AdminAssetsController {
  constructor(
    private readonly assets: AssetsService,
    private readonly list: AssetsListService,
    private readonly moderation: AdminAssetsModerationService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Filterable cross-status asset list with X-Total-* status headers.' })
  @ApiOkResponse()
  async listAll(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Query() query: ListAssetsQueryDto,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    // Force the admin lens: include every status, no owner check.
    query.includeUnpublished = true;
    const result = await this.list.listFromPostgres(
      query,
      principal.user,
      query.locale ?? principal.user.locale,
    );
    const counts = await this.moderation.statusCounts();
    void res.header('X-Total-Draft', String(counts.DRAFT));
    void res.header('X-Total-Published', String(counts.PUBLISHED));
    void res.header('X-Total-Archived', String(counts.ARCHIVED));
    void res.header('X-Total-Deleted', String(counts.DELETED));
    return result;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Admin detail view (sees DRAFT/ARCHIVED/DELETED too).' })
  @ApiOkResponse({ type: AssetDetailDto })
  detail(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Param('id') id: string,
  ): Promise<AssetDetailDto> {
    return this.assets.getDetail(id, principal.user, principal.user.locale);
  }

  @Patch(':id')
  @AuditAction({ action: 'asset.admin_edit', subjectType: 'Asset' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Admin edit on behalf of contributor (bypasses owner check).' })
  @ApiNoContentResponse()
  async edit(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateAssetDto,
  ): Promise<void> {
    await this.assets.update(id, dto, principal.user);
  }

  @Post(':id/archive')
  @AuditAction({ action: 'asset.admin_archive_request', subjectType: 'Asset' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Admin-forced archive with mandatory reason.' })
  archive(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Body() dto: AdminAssetActionDto,
  ): Promise<void> {
    return this.moderation.archive(id, principal.user, dto.reason);
  }

  @Post(':id/restore')
  @AuditAction({ action: 'asset.admin_restore_request', subjectType: 'Asset' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Restore an archived or soft-deleted asset.' })
  restore(@AuthUser() principal: AuthenticatedRequestUser, @Param('id') id: string): Promise<void> {
    return this.moderation.restore(id, principal.user);
  }

  @Delete(':id')
  @AuditAction({ action: 'asset.admin_soft_delete_request', subjectType: 'Asset' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete with mandatory reason; physical purge after 30 days.' })
  softDelete(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Body() dto: AdminAssetActionDto,
  ): Promise<void> {
    return this.moderation.softDelete(id, principal.user, dto.reason);
  }

  @Post(':id/force-delete')
  @RequireConfirmation()
  @AuditAction({ action: 'asset.force_delete_request', subjectType: 'Asset' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Immediate hard delete including S3. Requires confirmation phrase.' })
  forceDelete(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Body() dto: AdminAssetForceDeleteDto,
  ): Promise<void> {
    return this.moderation.forceDelete(id, principal.user, dto.reason);
  }

  @Post(':id/transfer')
  @AuditAction({ action: 'asset.transfer_request', subjectType: 'Asset' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reassign ownership to another user.' })
  transfer(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Body() dto: AdminAssetTransferDto,
  ): Promise<void> {
    return this.moderation.transfer(id, principal.user, dto.newOwnerId);
  }
}
