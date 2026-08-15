import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePermissions } from '@/lib/hooks/use-permissions';
import type { AssetDetail, MeResponse } from '@/lib/api/types';

const baseMe: Pick<MeResponse, 'id' | 'isAdmin' | 'role'> = { id: 'u1', isAdmin: false, role: 'user' };
const baseAsset: Pick<AssetDetail, 'status' | 'owner' | 'canEdit' | 'canDelete' | 'canArchive'> = {
  status: 'PUBLISHED',
  owner: { id: 'u2', displayName: 'Other', avatar: { initials: 'O', bgColor: 'brand-blue', fgColor: 'ink-white' } },
  canEdit: false,
  canDelete: false,
  canArchive: false,
};

describe('usePermissions', () => {
  it('allows save + report when user is not owner and not admin', () => {
    const { result } = renderHook(() => usePermissions({ me: baseMe, asset: baseAsset }));
    expect(result.current.canSave).toBe(true);
    expect(result.current.canReport).toBe(true);
    expect(result.current.canEditAsset).toBe(false);
  });

  it('hides save + report for the owner', () => {
    const { result } = renderHook(() =>
      usePermissions({ me: { ...baseMe, id: 'u2' }, asset: baseAsset }),
    );
    expect(result.current.canSave).toBe(false);
    expect(result.current.canReport).toBe(false);
    expect(result.current.canEditAsset).toBe(true);
    expect(result.current.canNewVersion).toBe(true);
  });

  it('admins can delete + manage but cannot report', () => {
    const { result } = renderHook(() =>
      usePermissions({ me: { ...baseMe, isAdmin: true, role: 'admin' }, asset: baseAsset }),
    );
    expect(result.current.canDeleteAsset).toBe(true);
    expect(result.current.canArchiveAsset).toBe(true);
    expect(result.current.canReport).toBe(false);
    expect(result.current.canDeleteAnyComment).toBe(true);
  });

  it('archived assets allow restore, not archive', () => {
    const { result } = renderHook(() =>
      usePermissions({
        me: { ...baseMe, id: 'u2' },
        asset: { ...baseAsset, status: 'ARCHIVED' },
      }),
    );
    expect(result.current.canRestoreAsset).toBe(true);
    expect(result.current.canArchiveAsset).toBe(false);
  });
});
