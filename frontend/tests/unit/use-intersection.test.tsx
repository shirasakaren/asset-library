import { act, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIntersection } from '@/lib/hooks/use-intersection';

type Callback = (entries: { isIntersecting: boolean }[]) => void;

const observed: Element[] = [];
const disconnected: number[] = [];
let callbacks: Callback[] = [];

beforeEach(() => {
  observed.length = 0;
  disconnected.length = 0;
  callbacks = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: Callback) {
        callbacks.push(cb);
      }
      observe(el: Element) {
        observed.push(el);
      }
      disconnect() {
        disconnected.push(1);
      }
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Mirrors the list pages: the sentinel only exists once the data has arrived. */
function LateSentinel({ show }: { show: boolean }) {
  const { ref, isIntersecting } = useIntersection<HTMLDivElement>();
  return (
    <div>
      {show ? <div ref={ref} data-testid="sentinel" /> : null}
      <span data-testid="state">{String(isIntersecting)}</span>
    </div>
  );
}

function Host() {
  const [show, setShow] = useState(false);
  return (
    <>
      <button onClick={() => setShow(true)}>show</button>
      <LateSentinel show={show} />
    </>
  );
}

describe('useIntersection', () => {
  it('observes a sentinel that mounts after the first render (lists render it once data loaded)', () => {
    const { getByText, getByTestId } = render(<Host />);
    expect(observed).toHaveLength(0);

    act(() => getByText('show').click());
    expect(observed).toEqual([getByTestId('sentinel')]);

    act(() => callbacks[0]!([{ isIntersecting: true }]));
    expect(getByTestId('state').textContent).toBe('true');
  });

  it('observes an element present on the first render and disconnects on unmount', () => {
    const { unmount, getByTestId } = render(<LateSentinel show />);
    expect(observed).toEqual([getByTestId('sentinel')]);
    unmount();
    expect(disconnected.length).toBeGreaterThan(0);
  });
});
