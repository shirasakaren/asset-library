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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuditAction } from '../../common/audit/audit-action.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AdminGuard } from '../../common/guards/admin.guard';
import { AuthenticatedRequestUser } from '../../infra/keycloak/keycloak-auth.guard';
import {
  AdminFeaturedSlotDto,
  CreateFeaturedSlotDto,
  FeaturedBannerInitiateDto,
  FeaturedBannerInitiateResponseDto,
  ReorderFeaturedSlotsDto,
  UpdateFeaturedSlotDto,
} from './dto/featured.dto';
import { FeaturedService } from './featured.service';

@ApiTags('Admin')
@ApiBearerAuth('keycloak')
@Controller('admin/featured')
@UseGuards(AdminGuard)
export class AdminFeaturedController {
  constructor(private readonly featured: FeaturedService) {}

  @Get()
  @ApiOperation({ summary: 'List every featured slot, active and inactive.' })
  @ApiOkResponse({ type: AdminFeaturedSlotDto, isArray: true })
  list(): Promise<AdminFeaturedSlotDto[]> {
    return this.featured.list();
  }

  @Post()
  @AuditAction({
    action: 'featured.create_request',
    subjectType: 'FeaturedSlot',
    subjectParam: 'body.assetId',
  })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a featured slot. Caps active at 5.' })
  @ApiCreatedResponse({ type: AdminFeaturedSlotDto })
  create(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Body() dto: CreateFeaturedSlotDto,
  ): Promise<AdminFeaturedSlotDto> {
    return this.featured.create(principal.user, dto);
  }

