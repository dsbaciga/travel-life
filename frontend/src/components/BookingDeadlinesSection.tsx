import toast from 'react-hot-toast';
import FormSection from './FormSection';
import { DEADLINE_KINDS, DEADLINE_KIND_LABELS, type DeadlineKind } from '../types/bookingDeadline';
import { newDraftKey, type DeadlineDraft, type DeadlineEditor } from '../hooks/useBookingDeadlineDrafts';

interface BookingDeadlinesSectionProps {
  drafts: DeadlineDraft[];
  onChange: (next: DeadlineDraft[]) => void;
  /** The zone the times are entered in, shown so nobody has to guess. */
  timezone: string;
  /** Prefix for element ids, so two sections on a page do not collide. */
  idPrefix: string;
  /** The inline add/edit row, held by the hook so a submit can see an uncommitted one. */
  editor: DeadlineEditor | null;
  onEditorChange: (next: DeadlineEditor | null) => void;
  /** Set when the form was submitted with an incomplete row; shown on that row. */
  editorError?: string | null;
}

const NEW_EDITOR: DeadlineEditor = { key: null, kind: 'cancellation', dueLocal: '', note: '' };

const formatLocal = (dueLocal: string) => {
  const d = new Date(dueLocal);
  // A datetime-local value is a wall-clock time; reading it back in the same
  // (browser) frame shows it exactly as typed, whatever zone that frame is.
  return Number.isNaN(d.getTime())
    ? dueLocal
    : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

/**
 * The "Deadlines" part of the lodging, transportation and activity forms:
 * free-cancellation cutoffs, check-in windows and payment dates for one booking.
 *
 * It is a controlled list of drafts and sends nothing itself, so it works the
 * same for a booking that does not exist yet. It deliberately renders no
 * `<form>` (it sits inside one) and has no dialogs; its buttons are
 * `type="button"` and Enter commits the row instead of submitting the booking.
 */
export default function BookingDeadlinesSection({
  drafts,
  onChange,
  timezone,
  idPrefix,
  editor,
  onEditorChange: setEditor,
  editorError,
}: BookingDeadlinesSectionProps) {
  const commit = () => {
    if (!editor) return;
    if (!editor.dueLocal) {
      toast.error('Choose a due date');
      return;
    }
    const fields = { kind: editor.kind, dueLocal: editor.dueLocal, note: editor.note.trim() };
    onChange(
      editor.key === null
        ? [...drafts, { key: newDraftKey(), done: false, ...fields }]
        : drafts.map((d) => (d.key === editor.key ? { ...d, ...fields } : d))
    );
    setEditor(null);
  };

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    commit();
  };

  return (
    <FormSection
      title="Deadlines"
      icon="⏰"
      description={`Cancellation cutoffs, check-in windows, payment dates. Times are local to the booking (${timezone}).`}
    >
      {drafts.length > 0 && (
        <ul className="space-y-2" aria-label="Deadlines">
          {drafts.map((d) => (
            <li
              key={d.key}
              className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 dark:border-dusk-700 p-3"
            >
              <div className="min-w-0 text-sm">
                <p className="font-medium text-gray-900 dark:text-white">
                  {DEADLINE_KIND_LABELS[d.kind]}
                  {d.done && <span className="ml-2 text-gray-600 dark:text-dusk-300">Done</span>}
                </p>
                <p className="text-gray-600 dark:text-dusk-400">{formatLocal(d.dueLocal)}</p>
                {d.note && <p className="text-gray-500 dark:text-dusk-400">{d.note}</p>}
              </div>
              <div className="flex shrink-0 gap-3 text-sm">
                <button
                  type="button"
                  onClick={() => setEditor({ key: d.key, kind: d.kind, dueLocal: d.dueLocal, note: d.note })}
                  className="inline-flex items-center min-h-[44px] sm:min-h-0 px-2 rounded text-primary-600 dark:text-gold hover:underline"
                >
                  Edit
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${DEADLINE_KIND_LABELS[d.kind]}`}
                  onClick={() => {
                    onChange(drafts.filter((x) => x.key !== d.key));
                    if (editor?.key === d.key) setEditor(null);
                  }}
                  className="inline-flex items-center min-h-[44px] sm:min-h-0 px-2 rounded text-red-600 dark:text-red-400 hover:underline"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editor ? (
        <div className="space-y-3 rounded-lg border border-gray-200 dark:border-dusk-700 p-3">
          {editorError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {editorError}
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor={`${idPrefix}-deadline-kind`}>Type</label>
              <select
                id={`${idPrefix}-deadline-kind`}
                className="input w-full"
                value={editor.kind}
                onChange={(e) => setEditor({ ...editor, kind: e.target.value as DeadlineKind })}
              >
                {DEADLINE_KINDS.map((k) => (
                  <option key={k} value={k}>{DEADLINE_KIND_LABELS[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor={`${idPrefix}-deadline-due`}>Due</label>
              <input
                id={`${idPrefix}-deadline-due`}
                type="datetime-local"
                className="input w-full"
                value={editor.dueLocal}
                onChange={(e) => setEditor({ ...editor, dueLocal: e.target.value })}
                onKeyDown={onEnter}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor={`${idPrefix}-deadline-note`}>Note (optional)</label>
            <input
              id={`${idPrefix}-deadline-note`}
              className="input w-full"
              maxLength={500}
              value={editor.note}
              onChange={(e) => setEditor({ ...editor, note: e.target.value })}
              onKeyDown={onEnter}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary text-sm" onClick={() => setEditor(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary text-sm" onClick={commit}>
              {editor.key === null ? 'Add deadline' : 'Update deadline'}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary text-sm" onClick={() => setEditor(NEW_EDITOR)}>
          + Add deadline
        </button>
      )}
    </FormSection>
  );
}
