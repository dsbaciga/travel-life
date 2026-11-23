import { lazy, Suspense, useCallback, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { JournalOpenRequest } from '../JournalManager';
import Icon from '../ui/Icon';
import { useTripEditAccess } from '../../hooks/useTripEditAccess';
import { draftDateWindow, isDateInDraftWindow } from '../../utils/journalDraftWindow';

// The same journal form the Journal tab uses, loaded only when a day asks for it.
const JournalManager = lazy(() => import('../JournalManager'));

interface UseDayJournalComposerOptions {
  tripId: number;
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  /** An entry was saved and the form has closed: reload what the day view shows. */
  onSaved?: () => void;
}

/**
 * Lets a day view add a journal entry for one of its days.
 *
 * It hosts the existing JournalManager in form-only mode, so the form, its
 * validation, auto-save and the AI draft are the Journal tab's own. `open` is
 * called with the day's YYYY-MM-DD key exactly as the view knows it; nothing
 * here converts it through a `Date`.
 *
 * Render `composer` once at the top level of the view, never inside a menu or
 * popover: it holds a modal and must not unmount when a menu closes.
 */
// The hook lives beside the actions it renders, so the two stay together.
// eslint-disable-next-line react-refresh/only-export-components
export function useDayJournalComposer({
  tripId,
  tripStartDate,
  tripEndDate,
  onSaved,
}: UseDayJournalComposerOptions) {
  const { canEdit } = useTripEditAccess(tripId);
  const queryClient = useQueryClient();
  const [request, setRequest] = useState<JournalOpenRequest | null>(null);
  const requestCount = useRef(0);
  const savedWhileOpen = useRef(false);

  const open = useCallback((day: string, draftWithAi = false) => {
    // One form at a time: a second click while it is open or opening adds nothing.
    setRequest((current) =>
      current ? current : { id: ++requestCount.current, date: day, draftWithAi }
    );
  }, []);

  const draftWindow = useMemo(
    () => draftDateWindow(tripStartDate, tripEndDate),
    [tripStartDate, tripEndDate]
  );
  const canDraftOn = useCallback(
    (day: string) => isDateInDraftWindow(day, draftWindow),
    [draftWindow]
  );

  const handleUpdate = useCallback(() => {
    savedWhileOpen.current = true;
    // What the Journal tab and the dashboard read.
    void queryClient.invalidateQueries({ queryKey: ['journal', tripId] });
  }, [queryClient, tripId]);

  const handleClosed = useCallback(() => {
    setRequest(null);
    if (savedWhileOpen.current) {
      savedWhileOpen.current = false;
      onSaved?.();
    }
  }, [onSaved]);

  const composer: ReactNode = request ? (
    <Suspense fallback={null}>
      <JournalManager
        formOnly
        tripId={tripId}
        tripStartDate={tripStartDate}
        tripEndDate={tripEndDate}
        openRequest={request}
        onUpdate={handleUpdate}
        onFormClosed={handleClosed}
      />
    </Suspense>
  ) : null;

  return { canEdit, open, canDraftOn, composer };
}

interface DayJournalActionsProps {
  /** The day, YYYY-MM-DD. */
  day: string;
  canEdit: boolean;
  canDraftOn: (day: string) => boolean;
  onOpen: (day: string, draftWithAi: boolean) => void;
  className?: string;
}

/** "Add journal entry" and "Draft with AI" for one day. Nothing for view-only users. */
export function DayJournalActions({
  day,
  canEdit,
  canDraftOn,
  onOpen,
  className = '',
}: DayJournalActionsProps) {
  if (!canEdit) return null;
  const draftable = canDraftOn(day);
  const buttonClass =
    'min-h-[36px] px-3 text-sm font-medium rounded-lg border border-primary-500/20 dark:border-navy-600 text-primary-700 dark:text-teal-300 hover:bg-primary-50 dark:hover:bg-navy-700 disabled:opacity-50 disabled:cursor-not-allowed';
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <button type="button" className={buttonClass} onClick={() => onOpen(day, false)}>
        Add journal entry
      </button>
      <button
        type="button"
        className={buttonClass}
        disabled={!draftable}
        title={draftable ? undefined : 'This day is outside the trip dates'}
        onClick={() => onOpen(day, true)}
      >
        <Icon name="sparkle" size={16} className="align-text-bottom" /> Draft with AI
      </button>
    </div>
  );
}
