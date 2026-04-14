import { describe, it, expect } from 'vitest';
import { queryKeys } from '@/lib/api/queries';

describe('queryKeys', () => {
  it('asset detail key includes locale', () => {
    expect(queryKeys.asset('slug', 'en')).toEqual(['asset', 'slug', 'en']);
    expect(queryKeys.asset('slug', 'id')).toEqual(['asset', 'slug', 'id']);
  });

  it('library/all is a prefix of any filtered library key', () => {
    const all = queryKeys.libraryAll;
    const filtered = queryKeys.library({ engine: 'UNITY', hidden: 'false' });
    expect(filtered[0]).toBe(all[0]);
  });

  it('search keys are deterministic by query + filters', () => {
    const a = queryKeys.searchAssets('cat', { engine: 'UNITY' });
    const b = queryKeys.searchAssets('cat', { engine: 'UNITY' });
    expect(a).toEqual(b);
  });
});
