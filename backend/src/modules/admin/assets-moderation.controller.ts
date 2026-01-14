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
