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
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditAction } from '../../common/audit/audit-action.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AdminGuard } from '../../common/guards/admin.guard';
import { AuthenticatedRequestUser } from '../../infra/keycloak/keycloak-auth.guard';
import { AdminTagsService } from './admin-tags.service';
import { AdminTagDto, ListTagsQueryDto, MergeTagsDto, UpdateTagDto } from './dto/admin-tag.dto';

@ApiTags('Admin')
@ApiBearerAuth('keycloak')
@Controller('admin/tags')
@UseGuards(AdminGuard)
export class AdminTagsController {
  constructor(private readonly admin: AdminTagsService) {}

  @Get()
  @ApiOperation({ summary: 'Search tags with usage counts.' })
  @ApiOkResponse()
  list(@Query() query: ListTagsQueryDto) {
    return this.admin.list(query);
  }

  @Post('merge')
  @AuditAction({ action: 'tag.merge_request', subjectType: 'Tag', subjectParam: 'body.intoTagId' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Merge several source tags into one target tag.' })
  merge(@AuthUser() principal: AuthenticatedRequestUser, @Body() dto: MergeTagsDto): Promise<void> {
    return this.admin.merge(principal.user, dto);
  }

  @Patch(':id')
  @AuditAction({ action: 'tag.update_request', subjectType: 'Tag' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rename a tag (slug + display name).' })
  @ApiOkResponse({ type: AdminTagDto })
  update(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateTagDto,
  ): Promise<AdminTagDto> {
    return this.admin.update(id, principal.user, dto);
  }

  @Delete(':id')
  @AuditAction({ action: 'tag.delete_request', subjectType: 'Tag' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an unused tag (usageCount must be 0).' })
  remove(@AuthUser() principal: AuthenticatedRequestUser, @Param('id') id: string): Promise<void> {
    return this.admin.remove(id, principal.user);
  }
}
