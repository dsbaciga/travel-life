import { useCallback, useMemo, useRef } from 'react';

/**
 * "Save & Add Another": submit the form, then keep it open and empty.
 *
 * The obvious implementation does not work:
 *
 * ```tsx
 * onClick={() => { setKeepOpen(true); form.requestSubmit(); }}
 * ```
 *
 * `requestSubmit()` runs the form's submit handler immediately, before React
 * has re-rendered, so the handler is the one from the previous render and still
 * sees `keepOpen === false`. The entry was saved and the form closed anyway.
 *
 * This hook keeps the intent in refs, which are readable straight away, and
 * ties it to one submission:
 *
 * - `submit(form)` marks the intent only for the submit it triggers itself.
 * - `beginSubmit()` must run synchronously at the start of every submit of the
 *   form. It records whether *this* submission was an "add another" one.
 * - `keepOpen()` answers for the submission in progress, at any later point,
 *   including after awaits.
 *
 * Because every submit starts with `beginSubmit()`, a later plain "Add" (or the
 * Enter key) can never inherit the intent of an earlier attempt that was
 * abandoned or failed validation.
 *
 * @example
 * ```tsx
 * const addAnother = useSaveAndAddAnother();
 *
 * const handleSubmit = (e: React.FormEvent) => {
 *   e.preventDefault();
 *   addAnother.beginSubmit();
 *   return run(async () => {
 *     await save();
 *     if (addAnother.keepOpen()) resetFields();
 *     else closeForm();
 *   });
 * };
 *
 * <button type="button" disabled={isSubmitting}
 *   onClick={() => addAnother.submit(document.getElementById('my-form'))}>
 *   Save & Add Another
 * </button>
 * ```
 *
 * When the form's `onSubmit` belongs to a child component, call `beginSubmit`
 * from `onSubmitCapture` on an element wrapping that component instead.
 */
export function useSaveAndAddAnother() {
  /** True only while `submit()` is dispatching its own submit event. */
  const requested = useRef(false);
  /** Whether the submission currently being handled should keep the form open. */
  const current = useRef(false);

  const submit = useCallback((form: HTMLElement | null) => {
    if (!(form instanceof HTMLFormElement)) return;
    // Let the browser report a missing required field without arming anything.
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    requested.current = true;
    try {
      form.requestSubmit();
    } finally {
      requested.current = false;
    }
  }, []);

  const beginSubmit = useCallback(() => {
    current.current = requested.current;
  }, []);

  const keepOpen = useCallback(() => current.current, []);

  return useMemo(() => ({ submit, beginSubmit, keepOpen }), [submit, beginSubmit, keepOpen]);
}
