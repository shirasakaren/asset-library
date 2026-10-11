import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { AdminTagsSurface } from '@/components/admin/tags-surface';

export const metadata = { title: 'Tags · Admin' };

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
