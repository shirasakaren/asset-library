'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { useAuthedFetch } from '@/lib/api/client';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { Modal, ModalContent, ModalHeader, ModalTitle } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface GifResult {
  id: string;
  url: string;
  preview: string;
  width: number;
  height: number;
  title: string;
}

interface GifSearchResponse {
  provider: 'tenor' | 'giphy' | null;
  results: GifResult[];
  available: ('tenor' | 'giphy')[];
}

interface GifPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (gif: { url: string; alt: string }) => void;
}

export function GifPicker({ open, onOpenChange, onPick }: GifPickerProps) {
  const fetcher = useAuthedFetch();
  const [q, setQ] = useState('');
  const debounced = useDebouncedValue(q, 350);
  const [provider, setProvider] = useState<'tenor' | 'giphy' | null>(null);
  const [available, setAvailable] = useState<('tenor' | 'giphy')[]>([]);
  const [results, setResults] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    if (!open) return;
    const mine = ++reqId.current;
    setLoading(true);
    fetcher<GifSearchResponse>('/gifs/search', {
      query: { q: debounced || undefined, provider: provider || undefined, limit: 24 },
    })
      .then((res) => {
        if (mine !== reqId.current) return;
        setResults(res.results);
        setAvailable(res.available);
        if (!provider && res.provider) setProvider(res.provider);
      })
      .catch(() => {
        if (mine === reqId.current) setResults([]);
      })
      .finally(() => {
        if (mine === reqId.current) setLoading(false);
      });
  }, [open, debounced, provider, fetcher]);

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent size="lg">
        <ModalHeader>
          <ModalTitle>Add a GIF</ModalTitle>
        </ModalHeader>
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-3"
              strokeWidth={2.25}
            />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search GIFs…"
              className="pl-9"
            />
          </div>
          {available.length > 1 ? (
            <div className="inline-flex rounded-[10px] border border-line overflow-hidden">
              {available.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProvider(p)}
                  className={cn(
                    'px-3 h-9 text-[12.5px] font-medium capitalize transition-colors',
                    provider === p ? 'bg-ink text-white' : 'bg-surface text-ink-2 hover:bg-surface-muted',
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          ) : null}
