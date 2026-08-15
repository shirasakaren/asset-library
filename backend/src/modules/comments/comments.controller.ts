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
import { OptionalAuthGuard } from '../../infra/keycloak/optional-auth.guard';
import { CommentsService } from './comments.service';
import {
  CommentListResponseDto,
  CreateCommentDto,
  ListCommentsQueryDto,
  UpdateCommentDto,
  UpdateIssueStatusDto,
} from './dto/comment.dto';

@ApiTags('Comments')
@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get('assets/:assetId/comments')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: 'List threaded comments / issues under an asset.' })
  @ApiOkResponse({ type: CommentListResponseDto })
  list(
    @Param('assetId') assetId: string,
    @Query() query: ListCommentsQueryDto,
  ): Promise<CommentListResponseDto> {
    return this.comments.list(assetId, query);
  }

  @Post('assets/:assetId/comments')
  @UseGuards(KeycloakAuthGuard)
  @ApiBearerAuth('keycloak')
  @RateLimit({ windowSec: 60, max: 60, scope: 'user', name: 'comments.create' })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a top-level comment/issue or a reply (max depth 5).' })
  @ApiCreatedResponse()
  create(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Param('assetId') assetId: string,
    @Body() dto: CreateCommentDto,
  ): Promise<{ id: string }> {
    return this.comments.create(assetId, dto, principal.user);
  }

  @Patch('comments/:id')
  @UseGuards(KeycloakAuthGuard)
  @ApiBearerAuth('keycloak')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Author edit; sets editedAt.' })
  edit(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateCommentDto,
  ): Promise<void> {
    return this.comments.edit(id, dto.body, principal.user);
  }

  @Delete('comments/:id')
  @UseGuards(KeycloakAuthGuard)
  @ApiBearerAuth('keycloak')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Admin-only soft delete.' })
  remove(@AuthUser() principal: AuthenticatedRequestUser, @Param('id') id: string): Promise<void> {
    return this.comments.adminDelete(id, principal.user);
  }

  @Patch('comments/:id/status')
  @UseGuards(KeycloakAuthGuard)
  @ApiBearerAuth('keycloak')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Asset owner or admin transitions an issue status.' })
  setStatus(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateIssueStatusDto,
  ): Promise<void> {
    return this.comments.setIssueStatus(id, dto.status, principal.user);
  }
}
