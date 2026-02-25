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
