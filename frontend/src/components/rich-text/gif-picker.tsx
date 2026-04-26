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
        </div>

        {available.length === 0 && !loading ? (
          <p className="py-12 text-center text-body-sm text-ink-3">
            GIF search isn&apos;t configured on the server.
          </p>
        ) : loading && results.length === 0 ? (
          <div className="py-16 flex items-center justify-center text-ink-3">
            <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.25} />
          </div>
        ) : results.length === 0 ? (
          <p className="py-12 text-center text-body-sm text-ink-3">No GIFs found.</p>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[55vh] overflow-y-auto">
            {results.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick({ url: g.url, alt: g.title || 'GIF' });
                    onOpenChange(false);
                  }}
                  className="block w-full overflow-hidden rounded-[10px] border border-line bg-surface-muted hover:border-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={g.preview}
                    alt={g.title}
                    loading="lazy"
                    className="w-full h-auto object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 text-caption text-ink-4 inline-flex items-center gap-1">
          <X className="h-3 w-3" strokeWidth={2.25} />
          Powered by {provider === 'giphy' ? 'GIPHY' : 'Tenor'}
        </p>
      </ModalContent>
    </Modal>
  );
}
