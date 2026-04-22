import { Injectable } from '@nestjs/common';
import { CommentKind, IssueStatus, NotificationType, Prisma, User } from '@prisma/client';
import { resolveAvatar } from '../../common/avatar/avatar';
import { ErrorCode } from '../../common/errors/error-code';
import {
  BadRequestDomainException,
  ForbiddenDomainException,
  NotFoundDomainException,
} from '../../common/errors/problem.dto';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor';
import { validateLiteTipTap } from '../../common/tiptap/validate';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { JobsProducer } from '../jobs/jobs.producer';
import {
  CommentListResponseDto,
  CommentNodeDto,
  CreateCommentDto,
  ListCommentsQueryDto,
} from './dto/comment.dto';

const MAX_DEPTH = 5;
const PAGE_SIZE = 25;

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsProducer,
  ) {}

  async list(assetId: string, query: ListCommentsQueryDto): Promise<CommentListResponseDto> {
    const cursor = decodeCursor(query.cursor ?? null);
    const pageSize = Math.min(Math.max(query.limit ?? PAGE_SIZE, 1), 100);
    const kindFilter: Prisma.CommentWhereInput =
      query.kind && query.kind !== 'ALL'
        ? { kind: query.kind === 'ISSUE' ? 'ISSUE' : 'COMMENT' }
        : {};

    // Top-level rows first (parent IS NULL); then we hydrate the whole subtree
    // with one query and stitch in memory. Capped at depth 5 by service-side
    // validation so the subtree per top-level row is bounded.
    const topRows = await this.prisma.comment.findMany({
      where: { assetId, parentId: null, deletedAt: null, ...kindFilter },
      orderBy: { createdAt: 'desc' },
      take: pageSize + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor.id } } : {}),
      include: { author: true },
    });
    const hasMore = topRows.length > pageSize;
    const topRowsClipped = topRows.slice(0, pageSize);
    if (topRowsClipped.length === 0) {
      return { items: [], pageInfo: { nextCursor: null, hasMore: false } };
    }

    const topIds = new Set(topRowsClipped.map((c) => c.id));
    const subtreeRows = await this.fetchSubtree(topRowsClipped.map((c) => c.id));

    const items: CommentNodeDto[] = topRowsClipped.map((top) =>
      this.toTree(top.id, [top, ...subtreeRows], topIds),
    );
    const last = topRowsClipped[topRowsClipped.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor({ id: last.id, createdAt: last.createdAt.toISOString() })
        : null;
    return { items, pageInfo: { nextCursor, hasMore } };
  }

  /**
   * Recursive CTE that walks the comments tree under any of `rootIds`. Column
   * names are quoted camelCase to match Prisma's default mapping (the model's
   * `@@map` renames only the table, not its columns).
   */
  private async fetchSubtree(rootIds: string[]) {
    if (rootIds.length === 0) return [] as CommentRow[];
    const rows = await this.prisma.$queryRaw<CommentRow[]>(Prisma.sql`
      WITH RECURSIVE thread AS (
        SELECT c.*, 1 AS hop FROM comments c
        WHERE c."parentId" = ANY(${rootIds}::text[]) AND c."deletedAt" IS NULL
        UNION ALL
        SELECT c.*, t.hop + 1 FROM comments c
        INNER JOIN thread t ON c."parentId" = t.id
        WHERE c."deletedAt" IS NULL AND t.hop < ${MAX_DEPTH}
      )
      SELECT
        thread.id, thread."assetId", thread."authorId",
        thread."parentId", thread.kind, thread.body, thread.status,
        thread.depth, thread."editedAt", thread."createdAt",
        u."displayName" AS "authorDisplayName", u.email AS "authorEmail"
      FROM thread
      LEFT JOIN users u ON u.id = thread."authorId"
      ORDER BY thread."createdAt" ASC
    `);
    return rows;
  }

  private toTree(
    rootId: string,
    allRows: Array<CommentRow | (CommentRow & { author?: User })>,
    topIds: Set<string>,
  ): CommentNodeDto {
    const byParent = new Map<string | null, CommentRow[]>();
    for (const row of allRows) {
      const key = row.parentId;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(row);
    }
    const buildNode = (row: CommentRow): CommentNodeDto => {
      const children = (byParent.get(row.id) ?? []).map((c) => buildNode(c));
      // Two row shapes flow into this mapper:
      //   - top-level rows from Prisma with `include: { author: true }` (the
      //     User relation on `row.author`)
      //   - subtree rows from the recursive raw SQL (flat `authorDisplayName`
      //     and `authorEmail` columns from the LEFT JOIN)
      // Reading only the SQL-flat columns made every top-level commenter
      // render as "(unknown)" — falling back to the relation fixes it.
      const withAuthor = row as CommentRow & {
        author?: { displayName?: string | null; email?: string | null };
      };
      const displayName = row.authorDisplayName ?? withAuthor.author?.displayName ?? null;
      const email = row.authorEmail ?? withAuthor.author?.email ?? '';
      return {
        id: row.id,
        kind: row.kind,
        parentId: row.parentId,
        depth: row.depth,
        body: row.body as object,
        status: row.status ?? undefined,
        editedAt: row.editedAt?.toISOString(),
        createdAt: row.createdAt.toISOString(),
        author: {
          id: row.authorId,
          displayName: displayName ?? '(unknown)',
          avatar: resolveAvatar(row.authorId, displayName, email),
        },
        replies: children,
      };
    };
    const top = allRows.find((r) => r.id === rootId);
    if (!top) throw new Error(`Comment ${rootId} disappeared between queries.`);
    if (!topIds.has(rootId)) throw new Error('Root id outside the requested set.');
    return buildNode(top);
  }

  async create(assetId: string, dto: CreateCommentDto, author: User): Promise<{ id: string }> {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset)
      throw new NotFoundDomainException(ErrorCode.ASSET_NOT_FOUND, `Asset ${assetId} not found.`);

    const body = validateLiteTipTap(dto.body) as unknown as Prisma.InputJsonValue;

    let depth = 0;
    if (dto.parentId) {
      const parent = await this.prisma.comment.findUnique({ where: { id: dto.parentId } });
      if (!parent || parent.assetId !== assetId) {
        throw new NotFoundDomainException(ErrorCode.COMMENT_NOT_FOUND, 'Parent comment not found.');
      }
      depth = parent.depth + 1;
      if (depth >= MAX_DEPTH) {
        throw new BadRequestDomainException(
          ErrorCode.COMMENT_DEPTH_EXCEEDED,
          `Replies nest at most ${MAX_DEPTH} levels deep.`,
        );
      }
    }
    // Only top-level rows may be kind=ISSUE; replies inside an issue thread
    // are normal comments.
    const effectiveKind: CommentKind = dto.parentId ? 'COMMENT' : dto.kind;
    const status: IssueStatus | null = effectiveKind === 'ISSUE' ? 'OPEN' : null;

    const created = await this.prisma.comment.create({
      data: {
        assetId,
        authorId: author.id,
        parentId: dto.parentId ?? null,
        kind: effectiveKind,
        body,
        status,
        depth,
      },
      select: { id: true, parentId: true, assetId: true },
    });

    // Notification fan-out (Part 3 delivers; Part 2 only enqueues).
    const payload = this.buildCommentPayload(asset, created.id, author, body);
    if (dto.parentId) {
      const parent = await this.prisma.comment.findUnique({
        where: { id: dto.parentId },
        select: { authorId: true },
      });
      if (parent && parent.authorId !== author.id) {
        await this.jobs.enqueueNotify({
          recipientUserId: parent.authorId,
          type: NotificationType.COMMENT_REPLY,
          payload: { ...payload, parentCommentId: dto.parentId },
          actor: { id: author.id, displayName: author.displayName, email: author.email },
        });
      }
    } else if (asset.ownerId !== author.id) {
      await this.jobs.enqueueNotify({
        recipientUserId: asset.ownerId,
        type:
          effectiveKind === 'ISSUE'
            ? NotificationType.ISSUE_CREATED
            : NotificationType.COMMENT_CREATED,
        payload,
        actor: { id: author.id, displayName: author.displayName, email: author.email },
      });
    }
    return { id: created.id };
  }

  private buildCommentPayload(
    asset: { id: string; slug: string; title: string },
    commentId: string,
    author: User,
    body: Prisma.InputJsonValue,
  ): Record<string, unknown> {
    return {
      assetId: asset.id,
      assetSlug: asset.slug,
      assetTitle: asset.title,
      commentId,
      commentExcerpt: this.excerpt(body),
      author: { id: author.id, displayName: author.displayName, email: author.email },
    };
  }

  /** Pulls the first ~140 chars of plain text out of a Lite TipTap doc. */
  private excerpt(doc: Prisma.InputJsonValue): string {
    const buf: string[] = [];
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      const obj = node as Record<string, unknown>;
      if (typeof obj.text === 'string') buf.push(obj.text);
      if (Array.isArray(obj.content)) for (const c of obj.content) walk(c);
    };
    walk(doc);
    return buf.join(' ').slice(0, 140);
  }

  async edit(commentId: string, body: object, editor: User): Promise<void> {
    const row = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!row || row.deletedAt)
      throw new NotFoundDomainException(
        ErrorCode.COMMENT_NOT_FOUND,
        `Comment ${commentId} not found.`,
      );
    if (row.authorId !== editor.id) {
      throw new ForbiddenDomainException(
        ErrorCode.AUTH_FORBIDDEN,
        'You can only edit your own comments.',
      );
    }
    const sanitized = validateLiteTipTap(body) as unknown as Prisma.InputJsonValue;
    await this.prisma.comment.update({
      where: { id: commentId },
      data: { body: sanitized, editedAt: new Date() },
    });
  }

  async adminDelete(commentId: string, admin: User): Promise<void> {
    if (!admin.isAdmin)
      throw new ForbiddenDomainException(ErrorCode.AUTH_FORBIDDEN, 'Admins only.');
    const row = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!row)
      throw new NotFoundDomainException(
        ErrorCode.COMMENT_NOT_FOUND,
        `Comment ${commentId} not found.`,
      );
    await this.prisma.comment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });
  }

  async setIssueStatus(commentId: string, status: IssueStatus, requester: User): Promise<void> {
    const row = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: { asset: { select: { ownerId: true } } },
    });
    if (!row)
      throw new NotFoundDomainException(
        ErrorCode.COMMENT_NOT_FOUND,
        `Comment ${commentId} not found.`,
      );
    if (row.kind !== 'ISSUE' || row.parentId !== null) {
      throw new BadRequestDomainException(
        ErrorCode.COMMENT_NOT_FOUND,
        'Only top-level issues have a status.',
      );
    }
    if (!requester.isAdmin && row.asset.ownerId !== requester.id) {
      throw new ForbiddenDomainException(
        ErrorCode.AUTH_FORBIDDEN,
        'Only the asset owner or an admin can change issue status.',
      );
    }
    await this.prisma.comment.update({ where: { id: commentId }, data: { status } });
    if (row.authorId !== requester.id) {
      const asset = await this.prisma.asset.findUnique({
        where: { id: row.assetId },
        select: { id: true, slug: true, title: true },
      });
      await this.jobs.enqueueNotify({
        recipientUserId: row.authorId,
        type: NotificationType.ISSUE_STATUS_CHANGED,
        payload: {
          assetId: row.assetId,
          assetSlug: asset?.slug ?? '',
          assetTitle: asset?.title ?? '',
          commentId,
          newStatus: status,
          changedBy: {
            id: requester.id,
            displayName: requester.displayName,
            email: requester.email,
          },
        },
        actor: { id: requester.id, displayName: requester.displayName, email: requester.email },
      });
    }
  }
}

interface CommentRow {
  id: string;
  assetId: string;
  authorId: string;
  parentId: string | null;
  kind: CommentKind;
  body: unknown;
  status: IssueStatus | null;
  depth: number;
  editedAt: Date | null;
  createdAt: Date;
  authorDisplayName?: string | null;
  authorEmail?: string | null;
}
