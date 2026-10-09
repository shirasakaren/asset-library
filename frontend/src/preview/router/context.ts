import type { Db } from '../types';
import { bus } from '../events/bus';
import type { PreviewContext } from './router';

export const DEFAULT_ME_ID = 'u-persona';

export function createContext(
  db: Db,
  opts: { meId?: string; timers?: boolean } = {},
): PreviewContext {
  let counter = 0;
  return {
    db,
    meId: opts.meId ?? DEFAULT_ME_ID,
    timers: opts.timers ?? true,
    now: () => new Date(),
    newId: (prefix) =>
      `${prefix}-${(++counter).toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    emit: (e) => bus.emit(e),
  };
}
