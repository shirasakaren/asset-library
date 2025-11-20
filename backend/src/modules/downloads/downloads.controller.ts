import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthenticatedRequestUser } from '../../infra/keycloak/keycloak-auth.guard';
import { FlexibleAuthGuard } from '../../infra/keycloak/flexible-auth.guard';
import { DownloadResponseDto, InitiateDownloadDto } from './dto/download.dto';
import { DownloadsService } from './downloads.service';

@ApiTags('Downloads')
@ApiBearerAuth('keycloak')
@Controller('downloads')
@UseGuards(FlexibleAuthGuard)
export class DownloadsController {
  constructor(private readonly downloads: DownloadsService) {}

  @Get('options')
  @ApiOperation({ summary: 'List downloadable files for the popup, no URLs, no Download rows.' })
  @ApiOkResponse({ type: DownloadResponseDto })
  options(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Query('assetId') assetId: string,
    @Query('versionId') versionId: string,
  ): Promise<DownloadResponseDto> {
    return this.downloads.options(assetId, versionId, principal.user);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Issue signed URLs, record Download rows, auto-save to library.' })
  @ApiOkResponse({ type: DownloadResponseDto })
  initiate(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Body() dto: InitiateDownloadDto,
    @Req() req: FastifyRequest,
  ): Promise<DownloadResponseDto> {
    return this.downloads.initiate(
      dto.assetId,
      dto.versionId,
      dto.fileId,
      dto.source,
      principal.user,
      req.ip,
      req.headers['user-agent'] as string | undefined,
    );
  }
}
