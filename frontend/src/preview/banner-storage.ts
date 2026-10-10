/** localStorage key remembering that the visitor closed the preview banner. */
export const BANNER_DISMISSED_KEY = 'preview.banner.dismissed';

// Storage can throw (private windows, blocked site data) or be missing; the banner must
// work without it, so every access is guarded.
export function readBannerDismissed(): boolean {
  try {
    return window.localStorage.getItem(BANNER_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeBannerDismissed(): void {
  try {
    window.localStorage.setItem(BANNER_DISMISSED_KEY, '1');
  } catch {
    // not persisted; the banner stays hidden for this page view only
  }
}

export function clearBannerDismissed(): void {
  try {
    window.localStorage.removeItem(BANNER_DISMISSED_KEY);
  } catch {
    // nothing to clear
  }
}
