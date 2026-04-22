'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Field, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuthedFetch } from '@/lib/api/client';
import { toast } from '@/components/ui/toaster';
import type { AssetRequest, AssetRequestStatus } from '@/lib/api/types';

const STATUSES: AssetRequestStatus[] = ['IN_REVIEW', 'PENDING', 'APPROVED', 'REJECTED'];

interface Props {
  request: AssetRequest;
}

export function RequestDecisionForm({ request }: Props) {
  const fetcher = useAuthedFetch();
  const router = useRouter();
  const [status, setStatus] = useState<AssetRequestStatus>(request.status);
  const [comment, setComment] = useState(request.adminComment ?? '');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (status === 'REJECTED' && comment.trim().length < 4) {
      toast.error('A comment is required when rejecting.');
      return;
    }
    setBusy(true);
    try {
      await fetcher(`/admin/asset-requests/${request.id}`, {
        method: 'PATCH',
        body: { status, adminComment: comment || undefined },
      });
      toast.success('Saved');
      router.push('/admin/requests');
    } catch (err) {
      toast.error('Could not save', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Field label="Status">
        <div className="grid sm:grid-cols-2 gap-2">
          {STATUSES.map((s) => {
            const active = status === s;
            return (
              <label
                key={s}
                className={`inline-flex items-center gap-2.5 px-3 h-9 rounded-[10px] border cursor-pointer transition-colors ${
                  active ? 'border-ink bg-surface-muted/60' : 'border-line hover:border-ink/40'
                }`}
              >
                <input
                  type="radio"
                  name="req-status"
                  checked={active}
                  onChange={() => setStatus(s)}
                  className="h-4 w-4 accent-ink"
                />
                <span className="text-[14px] text-ink">{s.replace('_', ' ')}</span>
              </label>
            );
          })}
        </div>
      </Field>

      <Field id="req-comment" label="Admin comment" required={status === 'REJECTED'}>
        <Textarea
          id="req-comment"
          rows={4}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="What should the requester know?"
        />
      </Field>

      <div className="flex items-center justify-end pt-2">
        <Button onClick={submit} loading={busy}>
          Save
        </Button>
      </div>
    </div>
  );
}
