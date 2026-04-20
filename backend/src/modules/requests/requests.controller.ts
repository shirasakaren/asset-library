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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import {
  AuthenticatedRequestUser,
  KeycloakAuthGuard,
} from '../../infra/keycloak/keycloak-auth.guard';
import {
  AssetRequestDto,
  CreateAssetRequestDto,
  ListAssetRequestsQueryDto,
} from './dto/request.dto';
import { RequestsService } from './requests.service';

@ApiTags('AssetRequests')
@ApiBearerAuth('keycloak')
@Controller('asset-requests')
@UseGuards(KeycloakAuthGuard)
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Post()
  @RateLimit({ windowSec: 86_400, max: 20, scope: 'user', name: 'requests.create' })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a new asset-sourcing request.' })
  @ApiCreatedResponse()
  create(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Body() dto: CreateAssetRequestDto,
  ): Promise<{ id: string }> {
    return this.requests.create(dto, principal.user);
  }

  @Get()
  @ApiOperation({ summary: 'List requests — admins see all; others see only their own.' })
  @ApiOkResponse()
  list(@AuthUser() principal: AuthenticatedRequestUser, @Query() query: ListAssetRequestsQueryDto) {
    return this.requests.list(query, principal.user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Single request — owner or admin only.' })
  @ApiOkResponse({ type: AssetRequestDto })
  get(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Param('id') id: string,
  ): Promise<AssetRequestDto> {
    return this.requests.get(id, principal.user);
  }
}
