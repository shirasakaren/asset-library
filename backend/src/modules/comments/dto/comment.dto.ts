import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CommentKind, IssueStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

const COMMENT_LISTS = ['ALL', 'COMMENT', 'ISSUE'] as const;
type CommentListMode = (typeof COMMENT_LISTS)[number];

export class ListCommentsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional({ enum: COMMENT_LISTS, default: 'ALL' })
  @IsOptional()
  @IsIn(COMMENT_LISTS as unknown as string[])
  kind?: CommentListMode;
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CreateCommentDto {
  @ApiProperty({ enum: CommentKind })
  @IsEnum(CommentKind)
  kind!: CommentKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiProperty({ description: 'Lite TipTap JSON document.' })
  @IsObject()
  body!: object;
}

export class UpdateCommentDto {
  @ApiProperty({ description: 'Lite TipTap JSON document.' })
  @IsObject()
  body!: object;
}

export class UpdateIssueStatusDto {
  @ApiProperty({ enum: IssueStatus })
  @IsEnum(IssueStatus)
  status!: IssueStatus;
}

export class CommentAuthorDto {
  @ApiProperty() id!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() avatar!: { initials: string; bgColor: string; fgColor: string };
}

export class CommentNodeDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: CommentKind }) kind!: CommentKind;
  @ApiPropertyOptional() parentId?: string | null;
  @ApiProperty() depth!: number;
  @ApiProperty() body!: object;
  @ApiPropertyOptional({ enum: IssueStatus }) status?: IssueStatus | null;
  @ApiPropertyOptional() editedAt?: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty() author!: CommentAuthorDto;
  @ApiProperty({ type: () => [CommentNodeDto] }) replies!: CommentNodeDto[];
}

export class CommentListResponseDto {
  @ApiProperty({ type: [CommentNodeDto] }) items!: CommentNodeDto[];
  @ApiProperty() pageInfo!: { nextCursor: string | null; hasMore: boolean };
}
