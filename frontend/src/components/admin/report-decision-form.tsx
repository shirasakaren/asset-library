'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuthedFetch } from '@/lib/api/client';
import { toast } from '@/components/ui/toaster';
import type { AdminReport, ReportAction } from '@/lib/api/admin-types';

const ACTIONS: { value: ReportAction; label: string }[] = [
  { value: 'NOTHING', label: 'No action' },
  { value: 'ARCHIVE_ASSET', label: 'Archive asset' },
  { value: 'DELETE_ASSET', label: 'Soft-delete asset' },
  { value: 'FORCE_DELETE_ASSET', label: 'Force-delete asset (immediate)' },
];

interface Props {
  report: AdminReport;
}

export function ReportDecisionForm({ report }: Props) {
  const fetcher = useAuthedFetch();
  const router = useRouter();
  const [action, setAction] = useState<ReportAction>('NOTHING');
  const [adminNotes, setAdminNotes] = useState(report.adminNotes ?? '');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const requireConfirm = action === 'FORCE_DELETE_ASSET';
  const requireNotes = action !== 'NOTHING';

  const startReview = async () => {
    setBusy(true);
    try {
      await fetcher(`/admin/reports/${report.id}/start-review`, { method: 'POST' });
      toast.success('Report marked under review');
      router.refresh();
    } catch (err) {
      toast.error('Could not start review', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const dismiss = async () => {
    if (adminNotes.trim().length < 4) {
      toast.error('Add a short note explaining why you dismissed.');
      return;
    }
    setBusy(true);
    try {
      await fetcher(`/admin/reports/${report.id}/dismiss`, {
        method: 'POST',
        body: { adminNotes },
      });
      toast.success('Report dismissed');
      router.push('/admin/reports');
    } catch (err) {
      toast.error('Could not dismiss', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const submitDecision = async () => {
    if (requireNotes && adminNotes.trim().length < 4) {
      toast.error('Admin notes are required for actions other than No action.');
      return;
    }
    if (requireConfirm && confirmText !== 'I understand') {
      toast.error('Type "I understand" to confirm force-delete.');
      return;
    }
    setBusy(true);
    try {
      await fetcher(`/admin/reports/${report.id}/action`, {
        method: 'POST',
        body: {
          adminNotes,
          action,
          confirm: requireConfirm ? 'I understand' : undefined,
          confirmedAt: requireConfirm ? new Date().toISOString() : undefined,
        },
      });
      toast.success('Decision submitted');
      router.push('/admin/reports');
    } catch (err) {
      toast.error('Decision failed', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
