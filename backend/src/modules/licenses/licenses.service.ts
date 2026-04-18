import { Injectable } from '@nestjs/common';
import { License, Locale } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code';
import { NotFoundDomainException } from '../../common/errors/problem.dto';
import { LocalizedJson, resolveLocalized } from '../../common/i18n/locale-resolver';
import { CachedService } from '../../infra/redis/cached.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { LicenseDetailDto, LicenseSummaryDto } from './dto/license.dto';

// License summaries vary by locale (description is localized), so the cache
// key includes it.
const LIST_CACHE_KEY = (locale: Locale) => `cache:licenses:v1:locale:${locale}`;
// 60 min: licenses are admin-managed and effectively immutable in production.
// Detail (`/licenses/:id`) is not cached — it's hit far less often than the
// list and we want to keep its key cardinality bounded.
const LIST_CACHE_TTL_SECONDS = 60 * 60;

@Injectable()
export class LicensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cached: CachedService,
  ) {}

  async findByIdOrThrow(id: string): Promise<License> {
    const row = await this.prisma.license.findUnique({ where: { id } });
    if (!row)
      throw new NotFoundDomainException(ErrorCode.LICENSE_NOT_FOUND, `License ${id} not found.`);
    return row;
  }

  async list(locale: Locale): Promise<LicenseSummaryDto[]> {
    return this.cached.getOrFetch<LicenseSummaryDto[]>(
      LIST_CACHE_KEY(locale),
      LIST_CACHE_TTL_SECONDS,
      () => this.computeList(locale),
    );
  }

  private async computeList(locale: Locale): Promise<LicenseSummaryDto[]> {
    const rows = await this.prisma.license.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((row) => this.toSummary(row, locale));
  }

  async getDetail(id: string, locale: Locale): Promise<LicenseDetailDto> {
    const row = await this.findByIdOrThrow(id);
    const summary = this.toSummary(row, locale);
    return {
      ...summary,
      fullText: resolveLocalized(row.fullText as LocalizedJson, locale) ?? '',
    };
  }

  /** Drops the cached listings — call after admin mutations. */
  async invalidateCache(): Promise<void> {
    await this.cached.invalidate(LIST_CACHE_KEY('en'), LIST_CACHE_KEY('id'));
  }

  private toSummary(row: License, locale: Locale): LicenseSummaryDto {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: resolveLocalized(row.description as LocalizedJson, locale) ?? '',
      sortOrder: row.sortOrder,
    };
  }
}
