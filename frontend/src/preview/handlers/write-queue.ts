/**
 * One module-level promise chain for every read-modify-write handler (library saves, asset and
 * version writes, file attach/remove). Records are replaced as a whole (`versions` is an array),
 * so two overlapping requests that both read first would drop one of the edits; running them
 * one after another makes both land.
 *
 * Never call `serialized` from inside a function that is already running under it: the inner
 * call would wait for the outer one and deadlock.
 */
let writeChain: Promise<unknown> = Promise.resolve();

export function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(fn, fn);
  writeChain = next.catch(() => undefined);
  return next;
}
