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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Locale } from '@prisma/client';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { IdempotencyKey } from '../../common/idempotency/idempotency-key.decorator';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import {
  AuthenticatedRequestUser,
  KeycloakAuthGuard,
} from '../../infra/keycloak/keycloak-auth.guard';
import { OptionalAuthGuard } from '../../infra/keycloak/optional-auth.guard';
import { AssetsListService } from './assets-list.service';
import { AssetsService } from './assets.service';
import { DiscoverResponseDto, DiscoverService } from './discover.service';
import { AssetDetailDto, AssetSummaryDto, CreateAssetDto, UpdateAssetDto } from './dto/asset.dto';
import { ListAssetsQueryDto } from './dto/list-assets-query.dto';

interface AssetListEnvelope {
  items: AssetSummaryDto[];
  pageInfo: { nextCursor: string | null; hasMore: boolean };
}

@ApiTags('Assets')
@Controller()
export class AssetsController {
  constructor(
    private readonly assets: AssetsService,
    private readonly assetsList: AssetsListService,
    private readonly discover: DiscoverService,
    private readonly idempotency: IdempotencyService,
  ) {}

  // ─── List + Discover (optional auth) ─────────────────────────────────────

  @Get('discover')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: 'Landing-page composite — featured slots + per-category rows.' })
  @ApiQuery({ name: 'locale', required: false, enum: ['en', 'id'] })
  @ApiOkResponse()
  discoverGet(
    @AuthUser() principal: AuthenticatedRequestUser | undefined,
    @Query('locale') locale?: Locale,
  ): Promise<DiscoverResponseDto> {
    return this.discover.get(locale ?? principal?.user.locale ?? 'en');
  }

  @Get('assets')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: 'List published assets (or all when admin + ?includeUnpublished).' })
  @ApiOkResponse()
  async list(
    @AuthUser() principal: AuthenticatedRequestUser | undefined,
    @Query() query: ListAssetsQueryDto,
  ): Promise<AssetListEnvelope> {
    const locale = query.locale ?? principal?.user.locale ?? 'en';
    if (query.q) {
      // Meilisearch path lives in SearchModule; surface a redirect-style hint.
      // For Part 2 the AssetsController never proxies to Meili — clients with
      // a search term should hit `/search/assets` directly.
    }
    return this.assetsList.listFromPostgres(query, principal?.user ?? null, locale);
  }

  @Get('assets/:idOrSlug')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: 'Asset detail by id or slug. Guests see published assets only.' })
  @ApiOkResponse({ type: AssetDetailDto })
  detail(
    @AuthUser() principal: AuthenticatedRequestUser | undefined,
    @Param('idOrSlug') idOrSlug: string,
    @Query('locale') locale?: Locale,
  ): Promise<AssetDetailDto> {
    return this.assets.getDetail(
      idOrSlug,
      principal?.user ?? null,
      locale ?? principal?.user.locale ?? 'en',
    );
  }

  @Get('assets/:id/recommended')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: 'Six related assets by category + tag overlap + same engine.' })
  @ApiOkResponse({ type: AssetSummaryDto, isArray: true })
  recommended(
    @AuthUser() principal: AuthenticatedRequestUser | undefined,
    @Param('id') id: string,
    @Query('locale') locale?: Locale,
  ): Promise<AssetSummaryDto[]> {
    return this.assets.recommended(id, locale ?? principal?.user.locale ?? 'en');
  }

  // ─── Mutations (auth required) ───────────────────────────────────────────

  @Post('assets')
  @UseGuards(KeycloakAuthGuard)
  @ApiBearerAuth('keycloak')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a draft asset (with its initial version row).' })
  @ApiCreatedResponse()
  async create(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Body() dto: CreateAssetDto,
    @IdempotencyKey() idemKey: string | null,
  ): Promise<{ id: string; slug: string }> {
    const route = 'POST /assets';
    if (idemKey) {
      const cached = await this.idempotency.lookup(principal.user.id, route, idemKey, dto);
      if (cached) return cached.response as { id: string; slug: string };
    }
    const created = await this.assets.create(dto, principal.user);
    if (idemKey) {
      await this.idempotency.store(
        principal.user.id,
        route,
        idemKey,
        dto,
        HttpStatus.CREATED,
        created,
      );
    }
    return created;
  }

  @Patch('assets/:id')
  @UseGuards(KeycloakAuthGuard)
  @ApiBearerAuth('keycloak')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Partial update; engine is immutable after publish.' })
  @ApiNoContentResponse()
  async update(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateAssetDto,
  ): Promise<void> {
    await this.assets.update(id, dto, principal.user);
  }

  @Post('assets/:id/publish')
  @UseGuards(KeycloakAuthGuard)
  @ApiBearerAuth('keycloak')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Flip DRAFT → PUBLISHED if every checklist item is green.' })
  @ApiOkResponse()
  async publish(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Param('id') id: string,
  ): Promise<{ warnings: Array<{ field: string; code: string; message: string }> }> {
    const warnings = await this.assets.publish(id, principal.user, false);
    return {
      warnings: warnings.map((w) => ({ field: w.field, code: w.code, message: w.message })),
    };
  }

  @Post('assets/:id/archive')
  @UseGuards(KeycloakAuthGuard)
  @ApiBearerAuth('keycloak')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Archive — hides from Discover/Search.' })
  archive(@AuthUser() principal: AuthenticatedRequestUser, @Param('id') id: string): Promise<void> {
    return this.assets.archive(id, principal.user);
  }

  @Post('assets/:id/restore')
  @UseGuards(KeycloakAuthGuard)
  @ApiBearerAuth('keycloak')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Restore an archived asset within the 30-day window.' })
  restore(@AuthUser() principal: AuthenticatedRequestUser, @Param('id') id: string): Promise<void> {
    return this.assets.restore(id, principal.user);
  }

  @Delete('assets/:id')
  @UseGuards(KeycloakAuthGuard)
  @ApiBearerAuth('keycloak')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete; physical purge happens after 30 days (Part 3).' })
  remove(@AuthUser() principal: AuthenticatedRequestUser, @Param('id') id: string): Promise<void> {
    return this.assets.softDelete(id, principal.user);
  }
}
