import { useEffect, useCallback, useRef } from 'react';

/**
 * Hook for tracking form dirty state and warning users about unsaved changes.
 * Designed for modal-based forms where route-level blocking (useNavigationBlock)
 * is not needed, but browser-level protection (beforeunload) is.
 *
 * Usage:
 * 1. Call `captureInitialValues(values)` when the form loads or resets with data
 * 2. The hook compares current `values` against the captured initial values
 * 3. Automatically registers a `beforeunload` handler when dirty
 * 4. Call `markSaved()` right before a successful submit to suppress the warning
 * 5. Use `isDirty` to conditionally show a confirmation before closing the modal
 *
 * @param values - The current form values object
 * @param isFormOpen - Whether the form/modal is currently open
 *
 * @example
 * ```tsx
 * const { captureInitialValues, isDirty, markSaved } = useUnsavedChangesWarning(values, showForm);
 *
 * // After loading data into the form:
 * captureInitialValues(values);
 *
 * // Before closing the modal:
 * const handleClose = () => {
 *   if (isDirty && !window.confirm('You have unsaved changes. Discard?')) return;
 *   closeForm();
 * };
 *
 * // On successful submit:
 * markSaved();
 * ```
 */
export function useUnsavedChangesWarning<T extends object>(
  values: T,
  isFormOpen: boolean,
) {
  const initialValuesRef = useRef<T | null>(null);
  const formSavedRef = useRef(false);

  /**
   * Capture the current form values as the "clean" baseline.
   * Call this after loading data into the form (edit mode) or after resetting (create mode).
   */
  const captureInitialValues = useCallback((snapshot: T) => {
    initialValuesRef.current = { ...snapshot };
    formSavedRef.current = false;
  }, []);

  /**
   * Mark the form as saved so the beforeunload handler is suppressed
   * until the next edit. Call this right before a successful submit.
   */
  const markSaved = useCallback(() => {
    formSavedRef.current = true;
  }, []);

  /**
   * Compare current values to the captured initial values.
   * Uses JSON serialization for deep comparison of objects/arrays.
   */
  const computeIsDirty = useCallback((): boolean => {
    if (!initialValuesRef.current) return false;
    if (formSavedRef.current) return false;
    return JSON.stringify(values) !== JSON.stringify(initialValuesRef.current);
  }, [values]);

  const isDirty = isFormOpen && computeIsDirty();

  // Register beforeunload handler when dirty
  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Reset saved flag when form closes
  useEffect(() => {
    if (!isFormOpen) {
      formSavedRef.current = false;
      initialValuesRef.current = null;
    }
  }, [isFormOpen]);

  return {
    /** Whether the form has unsaved changes */
    isDirty,
    /** Capture current values as the clean baseline */
    captureInitialValues,
    /** Mark the form as saved (suppresses warning until next edit) */
    markSaved,
  };
}
