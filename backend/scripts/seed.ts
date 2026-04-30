/**
 * Idempotent seed script.
 *
 * Creates (or refreshes):
 *   - Bootstrap admin user (email from ADMIN_BOOTSTRAP_EMAIL).
 *   - Default categories (3D models, 2D art, audio, VFX, tools, scripts,
 *     animations, templates, documents).
 *   - Default license templates (MIT, CC0, CC-BY, CC-BY-SA, CC-BY-NC,
 *     COMMERCIAL, INTERNAL_USE_ONLY).
 *
 * Safe to run repeatedly — every record is upserted on its slug.
 */

import { Locale, PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

interface CategorySeed {
  slug: string;
  name: Record<Locale, string>;
  sortOrder: number;
}

interface LicenseSeed {
  slug: string;
  name: string;
  description: Record<Locale, string>;
  fullText: Record<Locale, string>;
  sortOrder: number;
}

const CATEGORIES: CategorySeed[] = [
  { slug: '3d-models', name: { en: '3D Models', id: 'Model 3D' }, sortOrder: 10 },
  { slug: '2d-art', name: { en: '2D Art & Sprites', id: 'Seni 2D & Sprite' }, sortOrder: 20 },
  { slug: 'audio', name: { en: 'Audio & Music', id: 'Audio & Musik' }, sortOrder: 30 },
  { slug: 'vfx', name: { en: 'VFX & Particles', id: 'VFX & Partikel' }, sortOrder: 40 },
  { slug: 'animation', name: { en: 'Animations', id: 'Animasi' }, sortOrder: 50 },
  { slug: 'tools', name: { en: 'Tools & Plugins', id: 'Alat & Plugin' }, sortOrder: 60 },
  { slug: 'scripts', name: { en: 'Scripts & Snippets', id: 'Skrip & Cuplikan' }, sortOrder: 70 },
  { slug: 'templates', name: { en: 'Project Templates', id: 'Template Proyek' }, sortOrder: 80 },
  { slug: 'shaders', name: { en: 'Shaders & Materials', id: 'Shader & Material' }, sortOrder: 90 },
  {
    slug: 'documents',
    name: { en: 'Documents & Guides', id: 'Dokumen & Panduan' },
    sortOrder: 100,
  },
];

const LICENSES: LicenseSeed[] = [
  {
    slug: 'mit',
    name: 'MIT License',
    description: {
      en: 'Permissive license requiring attribution.',
      id: 'Lisensi permisif yang memerlukan atribusi.',
    },
    fullText: {
      en: 'MIT License — full text canonical at https://opensource.org/license/mit',
      id: '',
    },
    sortOrder: 10,
  },
  {
    slug: 'cc0',
    name: 'CC0 1.0 Universal',
    description: {
      en: 'No rights reserved — public domain dedication.',
      id: 'Tanpa hak cipta — dedikasi domain publik.',
    },
    fullText: {
      en: 'CC0 1.0 Universal — see https://creativecommons.org/publicdomain/zero/1.0/',
      id: '',
    },
    sortOrder: 20,
  },
  {
    slug: 'cc-by',
    name: 'CC BY 4.0',
    description: {
      en: 'Attribution required; commercial use allowed.',
      id: 'Atribusi wajib; penggunaan komersial diperbolehkan.',
    },
    fullText: { en: 'CC BY 4.0 — see https://creativecommons.org/licenses/by/4.0/', id: '' },
    sortOrder: 30,
  },
  {
    slug: 'cc-by-sa',
    name: 'CC BY-SA 4.0',
    description: {
      en: 'Attribution + ShareAlike; derivatives use same license.',
      id: 'Atribusi + ShareAlike; turunan menggunakan lisensi yang sama.',
    },
    fullText: { en: 'CC BY-SA 4.0 — see https://creativecommons.org/licenses/by-sa/4.0/', id: '' },
    sortOrder: 40,
  },
  {
    slug: 'cc-by-nc',
    name: 'CC BY-NC 4.0',
    description: {
      en: 'Attribution; non-commercial use only.',
      id: 'Atribusi; hanya penggunaan non-komersial.',
    },
    fullText: { en: 'CC BY-NC 4.0 — see https://creativecommons.org/licenses/by-nc/4.0/', id: '' },
    sortOrder: 50,
  },
  {
    slug: 'commercial',
    name: 'Commercial License',
    description: {
      en: 'Custom commercial terms — contact owner.',
      id: 'Ketentuan komersial khusus — hubungi pemilik.',
    },
    fullText: {
      en: 'Contact the asset owner for the full commercial license terms.',
      id: 'Hubungi pemilik aset untuk ketentuan lisensi komersial lengkap.',
    },
    sortOrder: 60,
  },
  {
    slug: 'internal-use-only',
    name: 'Internal Use Only',
    description: {
      en: 'Restricted to MGM Laboratory internal projects.',
      id: 'Terbatas untuk proyek internal MGM Laboratory.',
    },
    fullText: {
      en: 'For internal use within MGM Laboratory and its partners only. Redistribution outside the organization is prohibited.',
      id: 'Hanya untuk penggunaan internal di MGM Laboratory dan mitranya. Distribusi ulang ke luar organisasi dilarang.',
    },
    sortOrder: 70,
  },
];

async function seedAdmin(): Promise<void> {
  const email = (process.env.ADMIN_BOOTSTRAP_EMAIL ?? 'admin@labmgm.org').toLowerCase();
  // We can't reach Keycloak from a seed script, so we mint a placeholder sub
  // that the auth guard will overwrite on first real login.
  const placeholderSub = `seed:${email}`;
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      keycloakSub: placeholderSub,
      email,
      displayName: 'Bootstrap Admin',
      locale: Locale.en,
      isAdmin: true,
    },
    update: { isAdmin: true },
  });
  // eslint-disable-next-line no-console
  console.log(`[seed] admin user: ${user.email} (isAdmin=${user.isAdmin})`);
}

async function seedCategories(): Promise<void> {
  for (const c of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      create: { slug: c.slug, name: c.name, sortOrder: c.sortOrder, isActive: true },
      update: { name: c.name, sortOrder: c.sortOrder, isActive: true },
    });
  }
  // eslint-disable-next-line no-console
  console.log(`[seed] categories: ${CATEGORIES.length} upserted`);
}

async function seedLicenses(): Promise<void> {
  for (const l of LICENSES) {
    await prisma.license.upsert({
      where: { slug: l.slug },
      create: {
        slug: l.slug,
        name: l.name,
        description: l.description,
        fullText: l.fullText,
        sortOrder: l.sortOrder,
        isActive: true,
      },
      update: {
        name: l.name,
        description: l.description,
        fullText: l.fullText,
        sortOrder: l.sortOrder,
        isActive: true,
      },
    });
  }
  // eslint-disable-next-line no-console
  console.log(`[seed] licenses: ${LICENSES.length} upserted`);
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[seed] starting (run=${randomBytes(4).toString('hex')})`);
  await seedAdmin();
  await seedCategories();
  await seedLicenses();
  // eslint-disable-next-line no-console
  console.log('[seed] done.');
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[seed] failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
