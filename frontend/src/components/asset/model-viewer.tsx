'use client';

import { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Loader2, Box } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

declare global {
  // model-viewer is a web component — augment intrinsic elements so JSX accepts it.
  // We type the few attributes we actually use; the rest are passed through.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          alt?: string;
          'shadow-intensity'?: string;
          exposure?: string;
          'camera-controls'?: boolean;
          'tone-mapping'?: string;
          'animation-name'?: string;
          autoplay?: boolean;
          'interaction-prompt'?: string;
          'environment-image'?: string;
        },
        HTMLElement
      >;
    }
  }
}

const MODEL_VIEWER_SCRIPT = 'https://unpkg.com/@google/model-viewer@^3.5.0/dist/model-viewer.min.js';

let scriptLoadPromise: Promise<void> | null = null;
function loadModelViewerScript(): Promise<void> {
  if (scriptLoadPromise) return scriptLoadPromise;
  if (typeof window === 'undefined') return Promise.resolve();
  if (customElements.get('model-viewer')) return Promise.resolve();
  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    const tag = document.createElement('script');
    tag.type = 'module';
    tag.src = MODEL_VIEWER_SCRIPT;
    tag.onload = () => resolve();
    tag.onerror = (e) => reject(e);
    document.head.appendChild(tag);
  });
  return scriptLoadPromise;
}

interface ModelViewerProps {
  src: string;
  alt?: string;
  className?: string;
  /** A still image (thumbnail) shown blurred behind the loading bar. */
  poster?: string | null;
  /** Animation names embedded in the GLB; if non-empty we expose the picker UI. */
  animations?: string[];
}

const GLB_RE = /\.(glb|gltf)(\?|$)/i;

export function ModelViewerPanel({
  src,
  alt,
  className,
  poster,
  animations = [],
}: ModelViewerProps) {
  const t = useTranslations('asset.viewer');
  const ref = useRef<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(true);
  const [activeAnim, setActiveAnim] = useState<string | undefined>(animations[0]);
  const [progress, setProgress] = useState(0);
  // Model (not animation) download/parse progress, 0..1. `loaded` flips true
  // once model-viewer fires its `load` event.
  const [modelProgress, setModelProgress] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // model-viewer only renders glTF/GLB. FBX/OBJ/etc. can't be previewed
  // inline — we show a clear "download to view" fallback instead of a blank box.
  const isGlb = GLB_RE.test(src);

  useEffect(() => {
    void loadModelViewerScript().then(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ref.current || !ready || !isGlb) return;
    const el = ref.current as unknown as HTMLElement & {
      currentTime?: number;
      duration?: number;
      pause?: () => void;
      play?: () => void;
    };
    const onTimeUpdate = () => {
      if (el.duration) setProgress(((el.currentTime ?? 0) / el.duration) * 100);
    };
    const onAnimFinished = () => setPaused(true);
    const onLoadProgress = (e: Event) => {
      const detail = (e as CustomEvent<{ totalProgress?: number }>).detail;
      const p = detail?.totalProgress ?? 0;
      setModelProgress(p);
      if (p >= 1) setLoaded(true);
    };
    const onLoad = () => {
      setModelProgress(1);
      setLoaded(true);
    };
    el.addEventListener('animation-finished', onAnimFinished);
    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('progress', onLoadProgress);
    el.addEventListener('load', onLoad);
    return () => {
      el.removeEventListener('animation-finished', onAnimFinished);
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('progress', onLoadProgress);
      el.removeEventListener('load', onLoad);
    };
  }, [ready, isGlb]);

  const togglePlay = () => {
    const el = ref.current as unknown as { pause?: () => void; play?: () => void } | null;
    if (!el) return;
    if (paused) {
      el.play?.();
      setPaused(false);
    } else {
      el.pause?.();
      setPaused(true);
    }
  };

