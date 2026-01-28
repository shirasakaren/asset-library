import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { AdminFeaturedSurface } from '@/components/admin/featured-surface';

export const metadata = { title: 'Featured · Admin' };
export const dynamic = 'force-dynamic';

export default function AdminFeaturedPage() {
  return (
    <>
      <AdminPageHeader
        title="Featured"
        description="Curate the rotating banner on the Discover page. Up to 5 active slots."
      />
      <AdminFeaturedSurface />
    </>
  );
}
