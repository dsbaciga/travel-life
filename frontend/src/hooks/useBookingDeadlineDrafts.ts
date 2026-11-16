import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import bookingDeadlineService from '../services/bookingDeadline.service';
import { DEADLINE_KIND_LABELS, type DeadlineEntityType, type DeadlineKind } from '../types/bookingDeadline';
import { useTimezoneResolver } from './useTimezoneResolver';
import { convertDateTimeLocalToISO, convertISOToDateTimeLocal } from '../utils/timezone';

/** One deadline row in a booking form. It has an `id` once it exists on the server. */
export interface DeadlineDraft {
  /** Stable React key, unrelated to the server id. */
  key: string;
  id?: number;
  kind: DeadlineKind;
  /** datetime-local value, in the booking's own timezone. */
  dueLocal: string;
  note: string;
  /** Marked done on the Deadlines tab; the form leaves it alone. */
  done: boolean;
  /** What the server had when the form opened, so an untouched row is not re-sent. */
  original?: { kind: DeadlineKind; dueLocal: string; note: string };
}

interface Options {
  tripId: number;
  entityType: DeadlineEntityType;
  /** The booking being edited, or null while creating (it has no id yet). */
  entityId: number | null;
  /** Whether the form is open. Closing it throws away anything unsaved. */
  active: boolean;
  /** The booking's own timezone, as saved. */
  entityTimezone?: string | null;
  tripTimezone?: string | null;
  onUpdate?: () => void;
}

/** The inline add/edit row of the Deadlines section, before it is committed to the list. */
export interface DeadlineEditor {
  /** Key of the row being edited, or null for a new one. */
  key: string | null;
  kind: DeadlineKind;
  dueLocal: string;
  note: string;
}

let draftCounter = 0;
export const newDraftKey = () => `draft-${++draftCounter}`;

/**
 * Deadlines edited inside a lodging / transportation / activity form.
 *
 * Nothing is sent while the user types. Changes are held here and written by
 * `apply()` once the booking itself is saved, which is also the only moment a
 * new booking has an id to attach them to. `apply` never throws: the booking is
 * already saved by then, so a deadline that fails is reported by name instead.
 *
 * The latest drafts (and the inline editor row) are kept in refs as well as state,
 * because a submit handler can run (via `requestSubmit`) before React has re-rendered.
 *
 * A row typed into the inline editor but never committed with "Add deadline" is not
 * dropped on submit: the booking form calls `flushEditor()` first, which commits a
 * complete row and refuses (returns false, with `editorError` set) an incomplete one.
 */
export function useBookingDeadlineDrafts({
  tripId,
  entityType,
  entityId,
  active,
  entityTimezone,
  tripTimezone,
  onUpdate,
}: Options) {
  const queryClient = useQueryClient();
  const resolveTz = useTimezoneResolver();
  const [drafts, setDraftsState] = useState<DeadlineDraft[]>([]);
  const draftsRef = useRef<DeadlineDraft[]>([]);
  const removedRef = useRef<DeadlineDraft[]>([]);
  const [editor, setEditorState] = useState<DeadlineEditor | null>(null);
  const editorRef = useRef<DeadlineEditor | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const entityTimezoneRef = useRef(entityTimezone);
  entityTimezoneRef.current = entityTimezone;
  const resolveRef = useRef(resolveTz);
  resolveRef.current = resolveTz;
  const tripTimezoneRef = useRef(tripTimezone);
  tripTimezoneRef.current = tripTimezone;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const setDrafts = useCallback((next: DeadlineDraft[]) => {
    draftsRef.current = next;
    setDraftsState(next);
  }, []);

  const setEditor = useCallback((next: DeadlineEditor | null) => {
    editorRef.current = next;
    setEditorState(next);
    setEditorError(null);
  }, []);

  /** Edits the list; removing a saved row remembers it so `apply` can delete it. */
  const change = useCallback(
    (next: DeadlineDraft[]) => {
      const kept = new Set(next.map((d) => d.key));
      for (const gone of draftsRef.current) {
        if (!kept.has(gone.key) && gone.id !== undefined) removedRef.current.push(gone);
      }
      setDrafts(next);
    },
    [setDrafts]
  );

  // Open the form: start empty for a new booking, or with the booking's deadlines.
  useEffect(() => {
    removedRef.current = [];
    setDrafts([]);
    setEditor(null);
    if (!active || entityId === null) return;
    let cancelled = false;
    queryClient
      .fetchQuery({
        queryKey: ['deadlines', 'trip', tripId],
        queryFn: () => bookingDeadlineService.getDeadlinesByTrip(tripId),
        staleTime: 0,
      })
      .then((all) => {
        if (cancelled) return;
        const tz = resolveRef.current(entityTimezoneRef.current, tripTimezoneRef.current);
        setDrafts(
          all
            .filter((d) => d.entityType === entityType && d.entityId === entityId)
            .map((d) => {
              const dueLocal = convertISOToDateTimeLocal(d.dueAt, tz);
              const note = d.note ?? '';
              return {
                key: newDraftKey(),
                id: d.id,
                kind: d.kind,
                dueLocal,
                note,
                done: !!d.dismissedAt,
                original: { kind: d.kind, dueLocal, note },
              };
            })
        );
      })
      .catch(() => {
        if (!cancelled) toast.error('Could not load this booking’s deadlines');
      });
    return () => {
      cancelled = true;
    };
  }, [active, entityId, entityType, tripId, queryClient, setDrafts, setEditor]);

  /**
   * Call at the start of the booking form's submit. Returns true when the submit may
   * go ahead. An untouched editor row is simply closed; a row with a due date is
   * committed to the list as if "Add deadline" had been pressed; a row with content
   * but no due date blocks the submit (false) and sets `editorError` on that row.
   */
  const flushEditor = useCallback((): boolean => {
    const current = editorRef.current;
    if (!current) return true;
    const touched = current.key !== null || current.dueLocal !== '' || current.note.trim() !== '';
    if (!touched) {
      setEditor(null);
      return true;
    }
    if (!current.dueLocal) {
      setEditorError('Choose a due date to add this deadline, or cancel it, before saving.');
      return false;
    }
    const fields = { kind: current.kind, dueLocal: current.dueLocal, note: current.note.trim() };
    change(
      current.key === null
        ? [...draftsRef.current, { key: newDraftKey(), done: false, ...fields }]
        : draftsRef.current.map((d) => (d.key === current.key ? { ...d, ...fields } : d))
    );
    setEditor(null);
    return true;
  }, [change, setEditor]);

  /**
   * Writes the pending changes for a booking that has just been saved.
   * @param savedEntityId the booking's id (the new one, when it was just created)
   * @param savedTimezone the booking's timezone as saved, which is how its
   *   deadlines are read everywhere else
   */
  const apply = useCallback(
    async (savedEntityId: number, savedTimezone?: string | null): Promise<void> => {
      const pending = draftsRef.current;
      const removed = removedRef.current;
      // Cleared first: a second apply (or "Save & Add Another") must never re-send these.
      removedRef.current = [];
      setDrafts([]);
      if (pending.length === 0 && removed.length === 0) return;

      const tz = resolveRef.current(savedTimezone ?? entityTimezoneRef.current, tripTimezoneRef.current);
      const label = (d: DeadlineDraft) => `${DEADLINE_KIND_LABELS[d.kind]} (${d.dueLocal.replace('T', ' ')})`;
      const failed: string[] = [];

      for (const d of removed) {
        try {
          await bookingDeadlineService.deleteDeadline(tripId, d.id as number);
        } catch {
          failed.push(`${label(d)}, could not be removed`);
        }
      }
      for (const d of pending) {
        try {
          if (d.id === undefined) {
            await bookingDeadlineService.createDeadline(tripId, {
              entityType,
              entityId: savedEntityId,
              kind: d.kind,
              dueAt: convertDateTimeLocalToISO(d.dueLocal, tz),
              note: d.note.trim() || null,
            });
          } else if (
            !d.original ||
            d.original.kind !== d.kind ||
            d.original.dueLocal !== d.dueLocal ||
            d.original.note !== d.note
          ) {
            await bookingDeadlineService.updateDeadline(tripId, d.id, {
              kind: d.kind,
              dueAt: convertDateTimeLocalToISO(d.dueLocal, tz),
              note: d.note.trim() || null,
            });
          }
        } catch {
          failed.push(label(d));
        }
      }

      queryClient.invalidateQueries({ queryKey: ['deadlines'] });
      queryClient.invalidateQueries({ queryKey: ['trip-validation', tripId] });
      onUpdateRef.current?.();
      if (failed.length > 0) {
        toast.error(
          `Saved, but ${failed.length === 1 ? 'this deadline was' : 'these deadlines were'} not saved: ${failed.join('; ')}. ` +
            'Check the Deadlines tab and try again there.'
        );
      }
    },
    [entityType, queryClient, setDrafts, tripId]
  );

  const timezone = resolveTz(entityTimezone, tripTimezone);

  return { drafts, change, apply, timezone, editor, setEditor, editorError, flushEditor };
}

export default useBookingDeadlineDrafts;
