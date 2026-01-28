import { UnityLogo } from '@/components/brand/engines/unity';
import { UnrealLogo } from '@/components/brand/engines/unreal';
import { AgnosticLogo } from '@/components/brand/engines/agnostic';
import type { Engine } from '@/lib/api/types';
import { cn } from '@/lib/utils';

const sizeClass = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
} as const;

interface EngineLogoProps {
  engine: Engine;
  size?: keyof typeof sizeClass;
  className?: string;
}

export function EngineLogo({ engine, size = 'md', className }: EngineLogoProps) {
  const cls = cn(sizeClass[size], 'text-ink-2', className);
  switch (engine) {
    case 'UNITY':
      return <UnityLogo className={cls} />;
    case 'UNREAL':
      return <UnrealLogo className={cls} />;
    case 'ENGINE_AGNOSTIC':
    default:
      return <AgnosticLogo className={cls} />;
  }
}

export const engineLabels: Record<Engine, string> = {
  UNITY: 'Unity',
  UNREAL: 'Unreal',
  BLENDER: 'Blender',
  STANDALONE_3D: '3D General',
  AUDIO: 'Audio',
  IMAGE: 'Image',
  VIDEO: 'Video',
  OTHER: 'Other engine',
  ENGINE_AGNOSTIC: 'Engine-agnostic',
};
