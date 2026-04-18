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

  @Patch(':id')
  @AuditAction({ action: 'category.update_request', subjectType: 'Category' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Partial update; reindexes affected assets.' })
  @ApiOkResponse({ type: AdminCategoryDto })
  update(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<AdminCategoryDto> {
    return this.admin.update(id, principal.user, dto);
  }

  @Delete(':id')
  @AuditAction({ action: 'category.delete_request', subjectType: 'Category' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a category. Rejected if any asset references it.' })
  remove(@AuthUser() principal: AuthenticatedRequestUser, @Param('id') id: string): Promise<void> {
    return this.admin.remove(id, principal.user);
  }

  @Post('reorder')
  @AuditAction({
    action: 'category.reorder_request',
    subjectType: 'Category',
    subjectParam: 'body.orderedIds.0',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Replace the sortOrder sequence.' })
  reorder(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Body() dto: ReorderCategoriesDto,
  ): Promise<void> {
    return this.admin.reorder(dto.orderedIds, principal.user);
  }

  @Post('icon-uploads/initiate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Presigned PUT URL for a small category icon (≤256 KB).' })
  initiateIcon(@Body() dto: CategoryIconInitiateDto) {
    return this.admin.initiateIconUpload(dto.contentType, dto.bytes);
  }
}
