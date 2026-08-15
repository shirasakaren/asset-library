import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { AdminCategoriesSurface } from '@/components/admin/categories-surface';

export const metadata = { title: 'Categories · Admin' };
export const dynamic = 'force-dynamic';

export default function AdminCategoriesPage() {
  return (
    <>
      <AdminPageHeader
        title="Categories"
        description="Group assets. Reorder by drag. Categories with published assets cannot be deleted."
      />
      <AdminCategoriesSurface />
    </>
  );
}
