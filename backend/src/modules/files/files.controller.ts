import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthenticatedRequestUser } from '../../infra/keycloak/keycloak-auth.guard';
import { FlexibleAuthGuard } from '../../infra/keycloak/flexible-auth.guard';
import {
  AbortMultipartDto,
  CompleteMultipartDto,
  CompleteThumbnailDto,
  CompleteUploadDto,
  InitiateEditorMediaDto,
  InitiateEditorMediaResponseDto,
  InitiateMultipartDto,
  InitiateMultipartResponseDto,
  InitiateThumbnailDto,
  InitiateThumbnailResponseDto,
  InitiateUploadDto,
  InitiateUploadResponseDto,
  RefreshEditorMediaDto,
  RefreshEditorMediaResponseDto,
  ReorderFilesDto,
  SignMultipartPartsDto,
} from './dto/upload.dto';
import { FilesService } from './files.service';

@ApiTags('Files')
@ApiBearerAuth('keycloak')
@Controller('files')
@UseGuards(FlexibleAuthGuard)
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('uploads/initiate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a single-shot PUT URL for a file ≤ 100 MB.' })
  @ApiOkResponse({ type: InitiateUploadResponseDto })
  initiate(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Body() dto: InitiateUploadDto,
  ): Promise<InitiateUploadResponseDto> {
    return this.files.initiateUpload(dto, principal.user);
  }

  @Post('uploads/complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark a single-shot upload complete, fire analyzer + AV jobs.' })
  complete(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Body() dto: CompleteUploadDto,
  ): Promise<void> {
    return this.files.completeUpload(dto.uploadId, principal.user);
  }

  @Post('uploads/multipart/initiate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Begin a multipart upload; returns presigned URLs for every part.' })
  @ApiOkResponse({ type: InitiateMultipartResponseDto })
  initiateMultipart(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Body() dto: InitiateMultipartDto,
  ): Promise<InitiateMultipartResponseDto> {
    return this.files.initiateMultipart(dto, principal.user);
  }

  @Post('uploads/multipart/sign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-sign additional parts on an existing multipart upload.' })
  signParts(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Body() dto: SignMultipartPartsDto,
  ): Promise<Array<{ partNumber: number; url: string }>> {
    return this.files.signMultipartParts(dto.uploadId, dto.partNumbers, principal.user);
  }

  @Post('uploads/multipart/complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Finalize a multipart upload (calls CompleteMultipartUpload on S3).' })
  completeMultipart(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Body() dto: CompleteMultipartDto,
  ): Promise<void> {
    return this.files.completeMultipart(dto, principal.user);
  }

  @Post('uploads/multipart/abort')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Abort an in-flight multipart upload.' })
  abortMultipart(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Body() dto: AbortMultipartDto,
  ): Promise<void> {
    return this.files.abortMultipart(dto.uploadId, principal.user);
  }

  @Post('thumbnails/initiate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a presigned PUT URL for an asset thumbnail.' })
  @ApiOkResponse({ type: InitiateThumbnailResponseDto })
  initiateThumb(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Body() dto: InitiateThumbnailDto,
  ): Promise<InitiateThumbnailResponseDto> {
    return this.files.initiateThumbnail(dto, principal.user);
  }

  @Post('thumbnails/complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Wire a freshly uploaded thumbnail key to the asset, queue resize variants.',
  })
  completeThumb(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Body() dto: CompleteThumbnailDto,
  ): Promise<void> {
    return this.files.completeThumbnail(dto.assetId, dto.key, principal.user);
  }

  @Post('editor-media/initiate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get a presigned PUT URL for a TipTap embed; also returns a ~6-day GET URL.',
  })
  @ApiOkResponse({ type: InitiateEditorMediaResponseDto })
  initiateEditorMedia(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Body() dto: InitiateEditorMediaDto,
  ): Promise<InitiateEditorMediaResponseDto> {
    return this.files.initiateEditorMedia(dto, principal.user);
  }

  @Post('editor-media/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Re-sign an existing editor-media key, returning a fresh ~6-day GET URL.',
  })
  @ApiOkResponse({ type: RefreshEditorMediaResponseDto })
  refreshEditorMedia(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Body() dto: RefreshEditorMediaDto,
  ): Promise<RefreshEditorMediaResponseDto> {
    return this.files.refreshEditorMedia(dto.key, principal.user);
  }

  @Post('versions/:versionId/reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Persist a new display order for a version's package files." })
  reorderFiles(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Param('versionId') versionId: string,
    @Body() dto: ReorderFilesDto,
  ): Promise<void> {
    return this.files.reorderFiles(versionId, dto.orderedFileIds, principal.user);
  }

  @Delete(':fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a single uploaded package file (owner/admin).' })
  deleteFile(
    @AuthUser() principal: AuthenticatedRequestUser,
    @Param('fileId') fileId: string,
  ): Promise<void> {
    return this.files.deleteFile(fileId, principal.user);
  }
}
