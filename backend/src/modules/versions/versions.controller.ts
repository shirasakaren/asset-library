import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import {
  AuthenticatedRequestUser,
  KeycloakAuthGuard,
} from '../../infra/keycloak/keycloak-auth.guard';
import { OptionalAuthGuard } from '../../infra/keycloak/optional-auth.guard';
import {
  CreateVersionDto,
  SetCompatibilityDto,
  UpdateVersionDto,
  VersionSummaryDto,
} from './dto/version.dto';
import { VersionsService } from './versions.service';

@ApiTags('Versions')
@Controller('assets/:assetId/versions')
export class VersionsController {
  constructor(private readonly versions: VersionsService) {}

  @Get()
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: 'List versions; non-owners see only published/clean rows.' })
  @ApiOkResponse({ type: VersionSummaryDto, isArray: true })
  list(
    @AuthUser() principal: AuthenticatedRequestUser | undefined,
    @Param('assetId') assetId: string,
  ): Promise<VersionSummaryDto[]> {
    return this.versions.list(assetId, principal?.user ?? null);
  }

  @Post()
  @UseGuards(KeycloakAuthGuard)
  @ApiBearerAuth('keycloak')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new version row (semver-unique per asset).' })
  @ApiCreatedResponse()
  create(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Param('assetId') assetId: string,
    @Body() dto: CreateVersionDto,
  ): Promise<{ id: string }> {
    return this.versions.create(assetId, dto, principal.user);
  }

  @Patch(':vid')
  @UseGuards(KeycloakAuthGuard)
  @ApiBearerAuth('keycloak')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Update release notes; semver is immutable post-publish.' })
  update(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Param('vid') vid: string,
    @Body() dto: UpdateVersionDto,
  ): Promise<void> {
