import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { AdminTagsSurface } from '@/components/admin/tags-surface';

export const metadata = { title: 'Tags · Admin' };
export const dynamic = 'force-dynamic';

export default function AdminTagsPage() {
  return (
    <>
      <AdminPageHeader
        title="Tags"
        description="Free-form tags applied across assets. Merge near-duplicates, rename, or delete unused."
      />
      <AdminTagsSurface />
    </>
  );
}
