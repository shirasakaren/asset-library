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
import { AdminCategoriesService } from './admin-categories.service';
import {
  AdminCategoryDto,
  CategoryIconInitiateDto,
  CreateCategoryDto,
  ReorderCategoriesDto,
  UpdateCategoryDto,
} from './dto/admin-category.dto';

@ApiTags('Admin')
@ApiBearerAuth('keycloak')
@Controller('admin/categories')
@UseGuards(AdminGuard)
export class AdminCategoriesController {
  constructor(private readonly admin: AdminCategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'List every category, active and inactive, with asset counts.' })
  @ApiOkResponse({ type: AdminCategoryDto, isArray: true })
  list(): Promise<AdminCategoryDto[]> {
    return this.admin.list();
  }

  @Post()
  @AuditAction({
    action: 'category.create_request',
    subjectType: 'Category',
    subjectParam: 'body.slug',
  })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new category.' })
  @ApiCreatedResponse({ type: AdminCategoryDto })
  create(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Body() dto: CreateCategoryDto,
  ): Promise<AdminCategoryDto> {
    return this.admin.create(principal.user, dto);
  }
