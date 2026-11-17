import type { ReactNode } from 'react';

interface FormModalFooterProps {
  /** Handler called when the Cancel button is clicked */
  onCancel: () => void;
  /** The form element ID, used for the submit button's `form` attribute */
  formId: string;
  /** Whether the form is currently submitting (disables buttons and shows loading text) */
  isSubmitting?: boolean;
  /** Label for the submit button (e.g., "Add Lodging", "Update Activity") */
  submitLabel: string;
  /** Label shown while submitting (e.g., "Saving..."). Defaults to "Saving..." */
  submittingLabel?: string;
  /** Whether the form is in edit mode. Hides "Save & Add Another" in edit mode. */
  isEditMode?: boolean;
  /**
   * Handler called when "Save & Add Another" is clicked. If provided and not
   * in edit mode, the "Save & Add Another" button is rendered.
   */
  onSaveAndAddAnother?: () => void;
  /**
   * Optional content rendered on the left side of the footer (e.g., DraftIndicator).
   * When provided, the footer uses a two-column justify-between layout.
   */
  leftContent?: ReactNode;
}

/**
 * Shared footer component for FormModal dialogs.
 *
 * Eliminates the duplicated Cancel / "Save & Add Another" / Submit button
 * footer found across ActivityManager, LodgingManager, TransportationManager,
 * and JournalManager.
 *
 * Supports:
 * - Cancel button (always visible)
 * - Optional "Save & Add Another" button (hidden in edit mode, full-width second row on phones)
 * - Submit button with loading state
 * - Optional left-side content (e.g., DraftIndicator)
 *
 * @example
 * ```tsx
 * // Simple usage without draft indicator:
 * <FormModal footer={
 *   <FormModalFooter
 *     onCancel={handleClose}
 *     formId="activity-form"
 *     isSubmitting={isSubmitting}
 *     submitLabel={editingId ? "Update Activity" : "Add Activity"}
 *     isEditMode={!!editingId}
 *     // addAnother comes from useSaveAndAddAnother(); a plain useState flag
 *     // set here would not be visible to the submit handler it triggers.
 *     onSaveAndAddAnother={() => addAnother.submit(document.getElementById('activity-form'))}
 *   />
 * }>
 *
 * // With draft indicator on the left:
 * <FormModal footer={
 *   <FormModalFooter
 *     onCancel={handleClose}
 *     formId="lodging-form"
 *     submitLabel={editingId ? "Update Lodging" : "Add Lodging"}
 *     isEditMode={!!editingId}
 *     onSaveAndAddAnother={handleSaveAndAddAnother}
 *     leftContent={
 *       <DraftIndicator
 *         isSaving={draft.isSaving}
 *         lastSavedAt={draft.lastSavedAt}
 *         show={draft.hasDraft && !editingId}
 *       />
 *     }
 *   />
 * }>
 * ```
 */
export default function FormModalFooter({
  onCancel,
  formId,
  isSubmitting = false,
  submitLabel,
  submittingLabel = 'Saving...',
  isEditMode = false,
  onSaveAndAddAnother,
  leftContent,
}: FormModalFooterProps) {
  const showSaveAndAddAnother = !isEditMode && onSaveAndAddAnother;

  const buttons = (
    <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:flex-nowrap">
      <button
        type="button"
        onClick={onCancel}
        disabled={isSubmitting}
        className="btn btn-secondary flex-1 min-w-0 px-3 sm:px-6 sm:flex-none whitespace-normal sm:whitespace-nowrap"
      >
        Cancel
      </button>
      {showSaveAndAddAnother && (
        <button
          type="button"
          disabled={isSubmitting}
          onClick={onSaveAndAddAnother}
          className="btn btn-secondary text-sm whitespace-nowrap order-last w-full sm:order-none sm:w-auto"
        >
          Save & Add Another
        </button>
      )}
      <button
        type="submit"
        form={formId}
        disabled={isSubmitting}
        className="btn btn-primary disabled:opacity-50 flex-[2] min-w-0 px-3 sm:px-6 sm:flex-none whitespace-normal sm:whitespace-nowrap"
      >
        {isSubmitting ? submittingLabel : submitLabel}
      </button>
    </div>
  );

  // When there is left-side content (e.g., DraftIndicator), use the
  // two-column layout that matches the existing pattern.
  if (leftContent) {
    return (
      <div className="flex flex-col gap-3 w-full sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        {leftContent}
        {buttons}
      </div>
    );
  }

  // Without left content, render buttons directly (Fragment-style).
  // FormModal's footer slot handles the outer container.
  return buttons;
}
