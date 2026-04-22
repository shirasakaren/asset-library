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
      <Field label="Action">
        <div className="flex flex-col gap-1.5">
          {ACTIONS.map((opt) => {
            const active = action === opt.value;
            return (
              <label
                key={opt.value}
                className={`inline-flex items-center gap-2.5 px-3 h-9 rounded-[10px] border cursor-pointer transition-colors ${
                  active ? 'border-ink bg-surface-muted/60' : 'border-line hover:border-ink/40'
                }`}
              >
                <input
                  type="radio"
                  name="report-action"
                  checked={active}
                  onChange={() => setAction(opt.value)}
                  className="h-4 w-4 accent-ink"
                />
                <span className="text-[14px] text-ink">{opt.label}</span>
              </label>
            );
          })}
        </div>
      </Field>

      <Field id="report-notes" label="Admin notes" required={requireNotes}>
        <Textarea
          id="report-notes"
          rows={4}
          value={adminNotes}
          onChange={(e) => setAdminNotes(e.target.value)}
          placeholder="What did you decide and why?"
        />
      </Field>

      {requireConfirm ? (
        <Field id="report-confirm" label='Type "I understand" to confirm' required>
          <Input id="report-confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="I understand" />
        </Field>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pt-2">
        {report.status === 'OPEN' ? (
          <Button variant="secondary" onClick={startReview} loading={busy}>
            Start review
          </Button>
        ) : null}
        <Button variant="ghost" onClick={dismiss} loading={busy}>
          Dismiss
        </Button>
        <Button onClick={submitDecision} loading={busy} className="ml-auto">
          Submit decision
        </Button>
      </div>
    </div>
  );
}
