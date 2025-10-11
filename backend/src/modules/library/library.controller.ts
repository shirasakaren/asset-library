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
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthenticatedRequestUser } from '../../infra/keycloak/keycloak-auth.guard';
import { FlexibleAuthGuard } from '../../infra/keycloak/flexible-auth.guard';
import {
  AddLibraryItemDto,
  LibraryItemDto,
  ListLibraryQueryDto,
  UpdateLibraryItemDto,
} from './dto/library.dto';
import { LibraryService } from './library.service';

@ApiTags('Library')
@ApiBearerAuth('keycloak')
@Controller('library')
@UseGuards(FlexibleAuthGuard)
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  @Get()
  @ApiOperation({ summary: "List the current user's library." })
  @ApiOkResponse()
  list(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Query() query: ListLibraryQueryDto,
  ): Promise<{
    items: LibraryItemDto[];
    pageInfo: { nextCursor: string | null; hasMore: boolean };
  }> {
    return this.library.list(principal.user, query, query.locale ?? principal.user.locale);
  }

  @Post('items')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Add an asset to the current user's library (idempotent)." })
  add(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Body() dto: AddLibraryItemDto,
  ): Promise<void> {
