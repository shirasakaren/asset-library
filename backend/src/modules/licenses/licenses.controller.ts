import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Locale } from '@prisma/client';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import {
  AuthenticatedRequestUser,
  KeycloakAuthGuard,
} from '../../infra/keycloak/keycloak-auth.guard';
import { LicenseDetailDto, LicenseSummaryDto } from './dto/license.dto';
import { LicensesService } from './licenses.service';

@ApiTags('Licenses')
@ApiBearerAuth('keycloak')
@Controller('licenses')
@UseGuards(KeycloakAuthGuard)
export class LicensesController {
  constructor(private readonly licenses: LicensesService) {}

  @Get()
  @ApiOperation({ summary: 'Active license templates (summary).' })
  @ApiQuery({ name: 'locale', required: false, enum: ['en', 'id'] })
  @ApiOkResponse({ type: LicenseSummaryDto, isArray: true })
  list(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Query('locale') locale?: Locale,
  ): Promise<LicenseSummaryDto[]> {
    return this.licenses.list(locale ?? principal.user.locale);
  }

  @Get(':id')
  @ApiOperation({ summary: 'License detail incl. full localized text.' })
  @ApiOkResponse({ type: LicenseDetailDto })
  detail(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Query('locale') locale?: Locale,
  ): Promise<LicenseDetailDto> {
    return this.licenses.getDetail(id, locale ?? principal.user.locale);
  }
}
