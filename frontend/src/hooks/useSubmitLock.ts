import { useCallback, useRef, useState } from 'react';

/**
 * Keeps a form from being submitted twice while the first submit is still running.
 *
 * Adding something to a trip takes a moment (the request, then a reload of the
 * list) before the modal closes, and a second click of "Add" in that window
 * created a duplicate. The lock is a ref, so it takes effect immediately; React
 * state alone would not stop a second click that lands before the next render.
 * `isSubmitting` is for the UI: disable the buttons and show "Saving...".
 *
 * @example
 * ```tsx
 * const { isSubmitting, run } = useSubmitLock();
 *
 * const handleSubmit = (e: React.FormEvent) => {
 *   e.preventDefault();
 *   return run(async () => {
 *     await save();
 *     closeModal();
 *   });
 * };
 *
 * <button type="submit" disabled={isSubmitting}>
 *   {isSubmitting ? 'Saving...' : 'Add'}
 * </button>
 * ```
 */
export function useSubmitLock() {
  const lockRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Runs `task` unless a submit is already in flight.
   * @returns the task's result, or `undefined` when the call was ignored
   */
  const run = useCallback(async <T,>(task: () => Promise<T>): Promise<T | undefined> => {
    if (lockRef.current) return undefined;
    lockRef.current = true;
    setIsSubmitting(true);
    try {
      return await task();
    } finally {
      lockRef.current = false;
      setIsSubmitting(false);
    }
  }, []);

  return { isSubmitting, run };
}
