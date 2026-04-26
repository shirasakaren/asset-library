import { Injectable } from '@nestjs/common';
import { License, Prisma, User } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { ErrorCode } from '../../common/errors/error-code';
import { ConflictDomainException, NotFoundDomainException } from '../../common/errors/problem.dto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AdminLicenseDto, CreateLicenseDto, UpdateLicenseDto } from './dto/admin-license.dto';
import { LicensesService } from './licenses.service';

@Injectable()
export class AdminLicensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly licenses: LicensesService,
  ) {}

  async list(): Promise<AdminLicenseDto[]> {
    const rows = await this.prisma.license.findMany({
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }],
      include: { _count: { select: { assets: true } } },
    });
    return rows.map((r) => this.toDto(r));
  }

  async create(admin: User, dto: CreateLicenseDto): Promise<AdminLicenseDto> {
    const collision = await this.prisma.license.findUnique({ where: { slug: dto.slug } });
    if (collision) {
      throw new ConflictDomainException(
        ErrorCode.LICENSE_IN_USE,
        `Slug "${dto.slug}" is already taken.`,
      );
    }
    const row = await this.prisma.license.create({
      data: {
        slug: dto.slug,
        name: dto.name,
        description: dto.description as Prisma.InputJsonValue,
        fullText: dto.fullText as Prisma.InputJsonValue,
        sortOrder: dto.sortOrder ?? 999,
        isActive: dto.isActive ?? true,
      },
      include: { _count: { select: { assets: true } } },
    });
    await this.licenses.invalidateCache();
    await this.audit.record({
      actorId: admin.id,
      action: 'license.create',
      subjectType: 'License',
      subjectId: row.id,
      metadata: { slug: dto.slug },
    });
    return this.toDto(row);
  }

  async update(id: string, admin: User, dto: UpdateLicenseDto): Promise<AdminLicenseDto> {
    const existing = await this.prisma.license.findUnique({ where: { id } });
    if (!existing)
      throw new NotFoundDomainException(ErrorCode.LICENSE_NOT_FOUND, `License ${id} not found.`);
    const mergedDescription =
      dto.description == null
        ? (existing.description as Prisma.InputJsonValue)
        : ({
            ...((existing.description as Record<string, string>) ?? {}),
            ...dto.description,
          } as Prisma.InputJsonValue);
    const mergedFullText =
      dto.fullText == null
        ? (existing.fullText as Prisma.InputJsonValue)
        : ({
            ...((existing.fullText as Record<string, string>) ?? {}),
            ...dto.fullText,
          } as Prisma.InputJsonValue);
    const row = await this.prisma.license.update({
      where: { id },
      data: {
        name: dto.name ?? existing.name,
        description: mergedDescription,
        fullText: mergedFullText,
        sortOrder: dto.sortOrder ?? existing.sortOrder,
        isActive: dto.isActive ?? existing.isActive,
      },
      include: { _count: { select: { assets: true } } },
    });
    await this.licenses.invalidateCache();
    await this.audit.record({
      actorId: admin.id,
      action: 'license.update',
      subjectType: 'License',
      subjectId: id,
      metadata: { changes: dto },
    });
    return this.toDto(row);
  }

  async remove(id: string, admin: User): Promise<void> {
    const usage = await this.prisma.asset.count({ where: { licenseId: id } });
    if (usage > 0) {
      throw new ConflictDomainException(
        ErrorCode.LICENSE_IN_USE,
        `License is referenced by ${usage} asset(s) — reassign first.`,
      );
    }
    const row = await this.prisma.license.findUnique({ where: { id } });
    if (!row)
      throw new NotFoundDomainException(ErrorCode.LICENSE_NOT_FOUND, `License ${id} not found.`);
    await this.prisma.license.delete({ where: { id } });
    await this.licenses.invalidateCache();
    await this.audit.record({
      actorId: admin.id,
      action: 'license.delete',
      subjectType: 'License',
      subjectId: id,
      metadata: { slug: row.slug },
    });
  }

  private toDto(row: License & { _count: { assets: number } }): AdminLicenseDto {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: (row.description as { en?: string; id?: string }) ?? {},
      fullText: (row.fullText as { en?: string; id?: string }) ?? {},
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      assetCount: row._count.assets,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
