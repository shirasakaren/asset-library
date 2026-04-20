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
    return this.library.add(principal.user, dto.assetId);
  }

  @Delete('items/:assetId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove an asset from the current user's library." })
  remove(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Param('assetId') assetId: string,
  ): Promise<void> {
    return this.library.remove(principal.user, assetId);
  }

  @Patch('items/:assetId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Toggle the `hidden` flag on a library entry.' })
  setHidden(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Param('assetId') assetId: string,
    @Body() dto: UpdateLibraryItemDto,
  ): Promise<void> {
    return this.library.setHidden(principal.user, assetId, dto.hidden);
  }
}
