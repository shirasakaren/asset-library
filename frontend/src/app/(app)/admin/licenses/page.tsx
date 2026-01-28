import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { AdminLicensesSurface } from '@/components/admin/licenses-surface';

export const metadata = { title: 'Licenses · Admin' };
export const dynamic = 'force-dynamic';

export default function AdminLicensesPage() {
  return (
    <>
      <AdminPageHeader
        title="Licenses"
        description="Standard license templates contributors choose from when publishing."
      />
      <AdminLicensesSurface />
    </>
  );
}
