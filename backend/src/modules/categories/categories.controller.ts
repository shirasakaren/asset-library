import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Locale } from '@prisma/client';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import {
  AuthenticatedRequestUser,
  KeycloakAuthGuard,
} from '../../infra/keycloak/keycloak-auth.guard';
import { CategoriesService } from './categories.service';
import { CategoryDto } from './dto/category.dto';

@ApiTags('Categories')
@ApiBearerAuth('keycloak')
@Controller('categories')
@UseGuards(KeycloakAuthGuard)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Active categories, sorted, with asset counts.' })
  @ApiQuery({ name: 'locale', required: false, enum: ['en', 'id'] })
  @ApiOkResponse({ type: CategoryDto, isArray: true })
  list(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Query('locale') locale?: Locale,
  ): Promise<CategoryDto[]> {
    return this.categories.list(locale ?? principal.user.locale);
  }
}
