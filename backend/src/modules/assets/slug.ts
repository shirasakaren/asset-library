import { randomBytes } from 'node:crypto';

/**
 * Derives a URL-safe slug from a title. Collisions are resolved by the caller
 * (we suffix `-<4 hex>` until the unique constraint is satisfied).
 */
export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 80) || randomBytes(4).toString('hex')
  );
}

export function appendSlugSuffix(slug: string): string {
  return `${slug}-${randomBytes(2).toString('hex')}`;
}
