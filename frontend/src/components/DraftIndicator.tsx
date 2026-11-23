import { formatDraftTime } from '../utils/draftStorage';

interface DraftIndicatorProps {
  /** Whether a save is currently in progress */
  isSaving?: boolean;
  /** Timestamp when the draft was last saved */
  lastSavedAt?: Date | null;
  /** Whether to show the indicator */
  show?: boolean;
}

/**
 * DraftIndicator displays a subtle status indicator for draft auto-saves.
 *
 * Shows "Saving..." during active saves and "Draft saved" with timestamp
 * after successful saves. Fades in/out smoothly.
 *
 * @example
 * ```tsx
 * <DraftIndicator
 *   isSaving={draft.isSaving}
 *   lastSavedAt={draft.lastSavedAt}
 *   show={draft.hasDraft}
 * />
 * ```
 */
export default function DraftIndicator({
  isSaving = false,
  lastSavedAt = null,
  show = false,
}: DraftIndicatorProps) {
  if (!show && !isSaving) return null;

  return (
    <div
      className={`
        inline-flex items-center gap-1.5 text-xs font-body
        transition-opacity duration-300
        ${isSaving ? 'text-primary-600 dark:text-gold' : 'text-slate dark:text-warm-gray'}
      `}
      role="status"
      aria-live="polite"
    >
      {isSaving ? (
        <>
          {/* Pulsing dot for saving state */}
          <span className="w-2 h-2 bg-primary-500 dark:bg-gold rounded-full animate-pulse-subtle" />
          <span>Saving…</span>
        </>
      ) : lastSavedAt ? (
        <>
          {/* Static dot for saved state */}
          <span className="w-2 h-2 bg-emerald-500 dark:bg-emerald-400 rounded-full" />
          <span>Draft saved {formatDraftTime(lastSavedAt.getTime())}</span>
        </>
      ) : null}
    </div>
  );
}
