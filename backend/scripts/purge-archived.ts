/**
 * Cron-driven purge of assets that have been ARCHIVED or DELETED for longer
 * than ARCHIVE_PURGE_DAYS. Part 3 wires this into a BullMQ scheduler; for now
 * it can be invoked manually (`pnpm purge:archived`).
 */

import { PrismaClient } from '@prisma/client';
import { validateEnv } from '../src/config/env.schema';

async function main(): Promise<void> {
  const env = validateEnv(process.env);
  const prisma = new PrismaClient();
  const cutoff = new Date(Date.now() - env.ARCHIVE_PURGE_DAYS * 86_400_000);

  try {
    const candidates = await prisma.asset.findMany({
      where: {
        status: { in: ['ARCHIVED', 'DELETED'] },
        archivedAt: { not: null, lte: cutoff },
      },
      select: { id: true, slug: true, status: true, archivedAt: true },
    });
    // eslint-disable-next-line no-console
    console.log(`[purge] ${candidates.length} candidate(s) older than ${cutoff.toISOString()}`);

    // TODO(Part 3): for each candidate:
    //   1. Delete S3 objects under `assets/{id}/`.
    //   2. Remove from Meilisearch.
    //   3. Hard-delete the Asset row (cascades versions, files, translations).
    //   4. Emit n8n webhook `asset.purged`.
    // Until that's wired up we just print so ops can verify.
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[purge] failed:', err);
  process.exit(1);
});
