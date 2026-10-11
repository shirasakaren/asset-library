/**
 * `resetDemo()` got as far as wiping the records, but the uploaded files (their own IndexedDB)
 * could not be removed. The demo data IS reset; only orphaned bytes remain on the visitor's disk.
 * Kept in its own module so UI code can check for it without importing the whole preview runtime.
 */
export class ResetPartialError extends Error {
  readonly name = 'ResetPartialError';
  constructor(cause?: unknown) {
    super('The demo data was reset, but the uploaded files could not be removed.');
    this.cause = cause;
  }
}
