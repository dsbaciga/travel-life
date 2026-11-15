/**
 * useSubmitLock Tests
 *
 * Test cases:
 * - LOCK-001: A second call while the first is running is ignored
 * - LOCK-002: Two calls in the same tick (before React re-renders) still run the task once
 * - LOCK-003: isSubmitting is true while the task runs and false afterwards
 * - LOCK-004: The lock is released after the task finishes, so a later submit runs
 * - LOCK-005: A failing task releases the lock and the error reaches the caller
 * - LOCK-006: A form's submit button is disabled while saving and a second click adds nothing
 */
import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { useSubmitLock } from '../useSubmitLock';

/** A promise whose resolution the test controls. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useSubmitLock', () => {
  it('LOCK-001: ignores a second call while the first is running', async () => {
    const { result } = renderHook(() => useSubmitLock());
    const gate = deferred();
    const task = vi.fn(() => gate.promise);

    let first!: Promise<unknown>;
    let second!: unknown;
    await act(async () => {
      first = result.current.run(task);
      second = await result.current.run(task);
    });

    expect(task).toHaveBeenCalledTimes(1);
    expect(second).toBeUndefined();

    await act(async () => {
      gate.resolve();
      await first;
    });
  });

  it('LOCK-002: two calls in the same tick run the task once', async () => {
    const { result } = renderHook(() => useSubmitLock());
    const gate = deferred();
    const task = vi.fn(() => gate.promise);

    // Both calls are made before React has rendered anything, as two quick clicks can be.
    let both!: Promise<unknown[]>;
    act(() => {
      both = Promise.all([result.current.run(task), result.current.run(task)]);
    });
    await act(async () => {
      gate.resolve();
      await both;
    });

    expect(task).toHaveBeenCalledTimes(1);
  });

  it('LOCK-003: isSubmitting is true while the task runs and false afterwards', async () => {
    const { result } = renderHook(() => useSubmitLock());
    const gate = deferred();
    expect(result.current.isSubmitting).toBe(false);

    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.run(() => gate.promise);
    });
    expect(result.current.isSubmitting).toBe(true);

    await act(async () => {
      gate.resolve();
      await pending;
    });
    expect(result.current.isSubmitting).toBe(false);
  });

  it('LOCK-004: releases the lock after the task, so a later submit runs', async () => {
    const { result } = renderHook(() => useSubmitLock());
    const task = vi.fn(async () => 'saved');

    let a: string | undefined;
    let b: string | undefined;
    await act(async () => {
      a = await result.current.run(task);
    });
    await act(async () => {
      b = await result.current.run(task);
    });

    expect(task).toHaveBeenCalledTimes(2);
    expect([a, b]).toEqual(['saved', 'saved']);
  });

  it('LOCK-005: a failing task releases the lock and the error reaches the caller', async () => {
    const { result } = renderHook(() => useSubmitLock());

    await act(async () => {
      await expect(
        result.current.run(async () => {
          throw new Error('boom');
        })
      ).rejects.toThrow('boom');
    });
    expect(result.current.isSubmitting).toBe(false);

    // And the next attempt is allowed.
    const retry = vi.fn(async () => 'ok');
    await act(async () => {
      await result.current.run(retry);
    });
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('LOCK-006: a form disables its submit button while saving and a second click adds nothing', async () => {
    const gate = deferred();
    const create = vi.fn(() => gate.promise);

    function AddForm() {
      const { isSubmitting, run } = useSubmitLock();
      const [closed, setClosed] = useState(false);
      if (closed) return <p>closed</p>;
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            return run(async () => {
              await create();
              setClosed(true);
            });
          }}
        >
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Add Thing'}
          </button>
        </form>
      );
    }

    render(<AddForm />);
    const button = screen.getByRole('button', { name: 'Add Thing' });

    fireEvent.click(button);
    // Straight away, before any re-render has been awaited: a second click.
    fireEvent.click(button);
    fireEvent.submit(button.closest('form') as HTMLFormElement);

    expect(await screen.findByRole('button', { name: 'Saving...' })).toBeDisabled();
    expect(create).toHaveBeenCalledTimes(1);

    await act(async () => {
      gate.resolve();
    });
    await waitFor(() => expect(screen.getByText('closed')).toBeInTheDocument());
    expect(create).toHaveBeenCalledTimes(1);
  });
});
