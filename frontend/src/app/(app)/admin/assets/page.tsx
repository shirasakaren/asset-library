import { Suspense } from 'react';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { AdminAssetsTable } from '@/components/admin/assets-table';

export const metadata = { title: 'Assets · Admin' };
export const dynamic = 'force-dynamic';

export default function AdminAssetsPage() {
  return (
    <>
      <AdminPageHeader
        title="Assets"
        description="Search, moderate, transfer, and force-delete any asset in the library."
      />
      <Suspense>
        <AdminAssetsTable />
      </Suspense>
    </>
  );
}
