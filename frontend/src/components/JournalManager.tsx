import { useState, useId, useMemo, useCallback, useEffect, useRef } from "react";
import { useSaveAndAddAnother } from "../hooks/useSaveAndAddAnother";
import type { JournalEntry, CreateJournalEntryInput, UpdateJournalEntryInput } from "../types/journalEntry";
import journalEntryService from "../services/journalEntry.service";
import toast from "react-hot-toast";
import { Link } from "react-router";
import { isAxiosError } from "axios";
import EmptyState, { EmptyIllustrations } from "./EmptyState";
import LinkButton from "./LinkButton";
import Icon from "./ui/Icon";
import LinkedEntitiesDisplay from "./LinkedEntitiesDisplay";
import FormModal from "./FormModal";
import FormModalFooter from "./shared/FormModalFooter";
import DraftIndicator from "./DraftIndicator";
import DraftRestorePrompt from "./DraftRestorePrompt";
import { useFormFields } from "../hooks/useFormFields";
import { useSubmitLock } from "../hooks/useSubmitLock";
import { useFieldErrors } from "../hooks/useFieldErrors";
import { useFormReset } from "../hooks/useFormReset";
import { useManagerCRUD } from "../hooks/useManagerCRUD";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { useTripLinkSummary } from "../hooks/useTripLinkSummary";
import { useEditFromUrlParam } from "../hooks/useEditFromUrlParam";
import { useCreateFromUrlParam } from "../hooks/useCreateFromUrlParam";
import { useAutoSaveDraft } from "../hooks/useAutoSaveDraft";
import { useUnsavedChangesWarning } from "../hooks/useUnsavedChangesWarning";
import MarkdownRenderer from "./MarkdownRenderer";
import MarkdownEditor from "./MarkdownEditor";
import { stripMarkdown } from "../utils/stripMarkdown";
import { formatDate } from "../utils/dateFormat";
import { extractDatePortion, formatDateOnly } from "../utils/timezone";
import { draftDateWindow, isDateInDraftWindow } from "../utils/journalDraftWindow";

/**
 * JournalManager handles CRUD operations for trip journal entries.
 * Provides a simple text-based journaling experience with expandable entries
 * and entity linking support.
 *
 * Features:
 * - Title, date, and content fields
 * - Expandable/collapsible entry content
 * - Entity linking to locations, activities, photos, albums, etc.
 * - Character count display
 * - Creation and edit timestamps
 * - "Save & Add Another" for quick successive entries
 *
 * @param props - Component props
 * @param props.tripId - The ID of the trip
 * @param props.tripStartDate - Trip start date used as default entry date (noon)
 * @param props.onUpdate - Callback triggered after CRUD operations to refresh parent data
 *
 * @example
 * ```tsx
 * <JournalManager
 *   tripId={123}
 *   tripStartDate="2024-06-01"
 *   onUpdate={() => refetchTrip()}
 * />
 * ```
 */
/** Ask a mounted JournalManager to open its create form on a given day. */
export interface JournalOpenRequest {
  /** Changes with every request, so asking for the same day twice still opens it. */
  id: number;
  /** The day (YYYY-MM-DD) the new entry is for. */
  date: string;
  /** Also fetch an AI draft for that day straight away (nothing is saved). */
  draftWithAi?: boolean;
}

interface JournalManagerProps {
  tripId: number;
  tripStartDate?: string | null;
  /** Bounds the days "Draft with AI" accepts (with the start date). */
  tripEndDate?: string | null;
  onUpdate?: () => void;
  /**
   * Render only the create/edit form, with no heading, list or New Entry button.
   * Used to add an entry from a day view; the form is the same one.
   */
  formOnly?: boolean;
  /** Open the create form on this day (see JournalOpenRequest). */
  openRequest?: JournalOpenRequest | null;
  /** The form was closed, by saving or cancelling. */
  onFormClosed?: () => void;
}

export default function JournalManager({
  tripId,
  tripStartDate,
  tripEndDate,
  onUpdate,
  formOnly = false,
  openRequest,
  onFormClosed,
}: JournalManagerProps) {
  // A journal entry's date is a calendar day (`@db.Date`), not an instant, so
  // the form works in plain YYYY-MM-DD. Default to the trip's start day.
  const defaultEntryDate = useMemo(() => {
    if (!tripStartDate) return "";
    return tripStartDate.slice(0, 10);
  }, [tripStartDate]);

  // Service adapter for useManagerCRUD hook (memoized to prevent infinite loops)
  const journalServiceAdapter = useMemo(() => ({
    getByTrip: journalEntryService.getJournalEntriesByTrip,
    create: journalEntryService.createJournalEntry,
    update: journalEntryService.updateJournalEntry,
    delete: journalEntryService.deleteJournalEntry,
  }), []);

  // Initialize CRUD hook
  const manager = useManagerCRUD<JournalEntry, CreateJournalEntryInput, UpdateJournalEntryInput>(journalServiceAdapter, tripId, {
    itemName: "journal entry",
    onUpdate,
  });

  const { confirm, ConfirmDialogComponent } = useConfirmDialog();

  // Link summary hook for displaying link counts
  const { getLinkSummary, invalidate: invalidateLinkSummary } = useTripLinkSummary(tripId);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  // Not React state: the submit handler runs before a state change would be visible.
  const addAnother = useSaveAndAddAnother();
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);

  // Use the new useFormFields hook to manage all form state
  // Memoize initial form values to include trip start date as default
  const initialFormValues = useMemo(() => ({
    title: "",
    content: "",
    entryDate: defaultEntryDate,
  }), [defaultEntryDate]);

  const { values: formValues, setField, setAllFields } = useFormFields(initialFormValues);

  const journalFieldErrors = useFieldErrors({
    title: { validate: (v) => v.trim() ? null : 'Title is required' },
  });

  // Track unsaved changes for browser close/refresh warning
  const { captureInitialValues, isDirty: isFormDirty, markSaved } = useUnsavedChangesWarning(formValues, manager.showForm);

  // "Draft with AI": the title/body the model wrote, kept so we can tell whether the
  // fields still hold exactly that. Cleared on save, close, and reset.
  const [aiDraft, setAiDraft] = useState<{ title: string; content: string } | null>(null);
  const [aiDrafting, setAiDrafting] = useState(false);
  const [aiError, setAiError] = useState<{ kind: 'not-configured' | 'failed'; message: string } | null>(null);

  // While the fields are still the untouched AI text they are not the user's words, so
  // they are not auto-saved: an abandoned AI draft must not come back later as a
  // "draft you were writing". The first edit adopts the text and auto-save resumes.
  const isUntouchedAiDraft =
    aiDraft !== null &&
    formValues.title === aiDraft.title &&
    formValues.content === aiDraft.content;

  // Auto-save draft for form data
  const draftKey = manager.editingId ? manager.editingId : tripId;
  const draft = useAutoSaveDraft(formValues, {
    entityType: 'journal',
    id: draftKey,
    isEditMode: !!manager.editingId,
    tripId,
    defaultValues: initialFormValues,
    enabled: manager.showForm && !isUntouchedAiDraft,
  });

  // Check for existing draft when form opens in create mode
  // Use initialDraftExists to only show prompt for drafts from previous sessions
  // TODO: Replace with useDraftRestore hook
  useEffect(() => {
    if (manager.showForm && !manager.editingId && draft.initialDraftExists) {
      setShowDraftPrompt(true);
    }
  }, [manager.showForm, manager.editingId, draft.initialDraftExists]);

  // Handle draft restore
  const handleRestoreDraft = useCallback(() => {
    const restoredData = draft.restoreDraft();
    if (restoredData) {
      setAllFields(restoredData);
    }
    setShowDraftPrompt(false);
  }, [draft, setAllFields]);

  // Handle draft discard
  const handleDiscardDraft = useCallback(() => {
    draft.clearDraft();
    setShowDraftPrompt(false);
  }, [draft]);

  // Create wrappers for useFormReset hook
  // TODO: Replace with useManagerFormWrapper hook
  const setShowForm = useCallback((show: boolean) => {
    if (show) {
      if (!manager.showForm) manager.toggleForm();
    } else {
      manager.closeForm();
    }
  }, [manager]);

  // Use useFormReset for consistent form state management
  const { resetForm: baseResetForm, openCreateForm: baseOpenCreateForm } = useFormReset({
    initialState: initialFormValues,
    setFormData: setAllFields,
    setEditingId: manager.setEditingId,
    setShowForm,
  });

  // Generate IDs for accessibility
  const titleFieldId = useId();
  const entryDateFieldId = useId();
  const draftHintId = useId();

  // Capture initial form values for dirty tracking when form opens or switches mode.
  // Uses a microtask delay so handleChange calls from populate effects have settled.
  const prevFormOpenRef = useRef(false);
  const prevEditingIdRef = useRef<number | null>(null);
  useEffect(() => {
    const justOpened = manager.showForm && !prevFormOpenRef.current;
    const editingChanged = manager.editingId !== prevEditingIdRef.current;
    prevFormOpenRef.current = manager.showForm;
    prevEditingIdRef.current = manager.editingId;

    if (manager.showForm && (justOpened || editingChanged)) {
      const timer = setTimeout(() => captureInitialValues(formValues), 0);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manager.showForm, manager.editingId, captureInitialValues]);

  // handleEdit must be defined before handleEditFromUrl since it's used as a dependency
  const handleEdit = useCallback((entry: JournalEntry) => {
    setAllFields({
      title: entry.title || "",
      content: entry.content,
      // Date-only field: take the calendar day as-is rather than routing it
      // through a UTC datetime, which would shift the day for western viewers.
      entryDate: entry.date ? extractDatePortion(entry.date) : "",
    });
    manager.openEditForm(entry.id);
    setExpandedId(null);
  }, [setAllFields, manager]);

  // Stable callback for URL-based edit navigation
  const handleEditFromUrl = useCallback((entry: JournalEntry) => {
    handleEdit(entry);
  }, [handleEdit]);

  // Handle URL-based edit navigation (e.g., from EntityDetailModal)
  // (A form-only host listens on a param nothing writes, so ?edit= stays for its tab.)
  useEditFromUrlParam(manager.items, handleEditFromUrl, {
    loading: manager.loading,
    paramName: formOnly ? 'journalFormOnlyEdit' : 'edit',
  });

  // Extended reset that also clears additional local state
  const resetForm = useCallback(() => {
    baseResetForm();
    setShowDraftPrompt(false);
    setAiDraft(null);
    setAiError(null);
    draft.clearDraft();
  }, [baseResetForm, draft]);

  // Open create form with clean state
  const openCreateForm = useCallback(() => {
    baseOpenCreateForm();
  }, [baseOpenCreateForm]);

  // A day view that hosts only the form must not swallow the Journal tab's ?action=new.
  useCreateFromUrlParam(openCreateForm, { enabled: !formOnly });

  // A second click while the first submit is still running (the request, then a list
  // reload, happen before the modal closes) would add the same thing twice.
  const { isSubmitting, run } = useSubmitLock();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Synchronously, before anything else: records whether this submit came
    // from "Save & Add Another".
    addAnother.beginSubmit();
    return run(() => performSubmit(e));
  };

  const performSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formValues.title.trim() || !formValues.content.trim()) {
      toast.error("Title and content are required");
      return;
    }

    if (manager.editingId) {
      // For updates
      const updateData = {
        title: formValues.title,
        content: formValues.content,
        entryDate: formValues.entryDate || null,
      };
      const success = await manager.handleUpdate(manager.editingId, updateData);
      if (success) {
        markSaved();
        invalidateLinkSummary(); // Refresh link counts
        resetForm();
        manager.closeForm();
      }
    } else {
      // For creates
      const createData = {
        tripId,
        title: formValues.title,
        content: formValues.content,
        entryDate: formValues.entryDate || undefined,
      };
      const success = await manager.handleCreate(createData);
      if (success) {
        markSaved();
        invalidateLinkSummary(); // Refresh link counts
        if (addAnother.keepOpen()) {
          // Reset form but keep modal open for quick successive entries
          // The same starting values a newly opened form gets. They also become
          // the "nothing changed yet" state, and the entry just saved must not
          // come back as a draft.
          setAllFields(initialFormValues);
          setAiDraft(null);
          setAiError(null);
          captureInitialValues(initialFormValues);
          journalFieldErrors.resetErrors();
          draft.clearDraft();
          // Focus first input for quick data entry
          setTimeout(() => {
            const firstInput = document.querySelector<HTMLInputElement>(`#${titleFieldId}`);
            firstInput?.focus();
          }, 50);
        } else {
          // Standard flow: reset and close
          resetForm();
          manager.closeForm();
        }
      }
    }
  };

  // Ask the AI for a first draft of the day in the Entry Date field. Nothing is
  // saved: the text only lands in the form, and the user still has to press Create.
  const startAiDraft = async (date: string, { confirmReplace }: { confirmReplace: boolean }) => {
    if (!date || aiDrafting) return;

    if (confirmReplace && (formValues.title.trim() || formValues.content.trim())) {
      // Same native prompt the close button uses: this form is already a modal, and a
      // second stacked modal fights it for focus.
      const replace = window.confirm(
        "The form already has text. Drafting with AI will replace the title and content. Continue?"
      );
      if (!replace) return;
    }

    setAiDrafting(true);
    setAiError(null);
    try {
      const result = await journalEntryService.generateDayDraft(tripId, date);
      setAllFields({ title: result.title, content: result.body, entryDate: date });
      setAiDraft({ title: result.title, content: result.body });
      if (result.truncated) {
        toast("This day had a lot in it, so the draft may leave some things out.");
      }
    } catch (error) {
      const status = isAxiosError(error) ? error.response?.status : undefined;
      const serverMessage = isAxiosError(error) ? error.response?.data?.message : undefined;
      if (status === 503) {
        setAiError({ kind: 'not-configured', message: "AI isn't set up yet." });
      } else if (status === 429) {
        setAiError({ kind: 'failed', message: "You've used all your AI requests for now. Try again later." });
      } else {
        setAiError({
          kind: 'failed',
          message: typeof serverMessage === 'string' && serverMessage
            ? serverMessage
            : "Couldn't generate a draft. Please try again.",
        });
      }
    } finally {
      setAiDrafting(false);
    }
  };

  const handleDraftWithAi = () => startAiDraft(formValues.entryDate, { confirmReplace: true });

  // Open the create form on a given day, as asked by a day view. Each request id is
  // acted on once, so a re-render (or React's double effect run) cannot open it twice.
  const handledRequestId = useRef<number | null>(null);
  useEffect(() => {
    if (!openRequest || handledRequestId.current === openRequest.id) return;
    handledRequestId.current = openRequest.id;
    setAllFields({ title: "", content: "", entryDate: openRequest.date });
    manager.setEditingId(null);
    setShowForm(true);
    if (openRequest.draftWithAi) {
      // The form was just emptied, so there is no text to confirm replacing.
      void startAiDraft(openRequest.date, { confirmReplace: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest]);

  // Tell the host when the form closes (saved or cancelled) so it can unmount us.
  const wasFormOpen = useRef(false);
  useEffect(() => {
    if (wasFormOpen.current && !manager.showForm) onFormClosed?.();
    wasFormOpen.current = manager.showForm;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manager.showForm]);

  const draftWindow = useMemo(
    () => draftDateWindow(tripStartDate, tripEndDate),
    [tripStartDate, tripEndDate]
  );
  const entryDateDraftable =
    !formValues.entryDate || isDateInDraftWindow(formValues.entryDate, draftWindow);
  const draftWindowHint = (() => {
    const { from, to } = draftWindow;
    const fmt = (d: string) =>
      formatDateOnly(d, { month: "short", day: "numeric", year: "numeric" });
    if (from && to) return `AI drafts cover ${fmt(from)} to ${fmt(to)}, the trip plus a day either side.`;
    if (from) return `AI drafts start on ${fmt(from)}, a day before the trip.`;
    if (to) return `AI drafts end on ${fmt(to)}, a day after the trip.`;
    return null;
  })();

  const handleDelete = async (id: number) => {
    const confirmed = await confirm({
      title: "Delete Journal Entry",
      message: "Delete this journal entry? This action cannot be undone.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) return;
    await manager.handleDelete(id);
  };

  const truncateContent = (text: string, maxLength: number = 200) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "\u2026";
  };

  // Wrap close handler with unsaved changes confirmation
  const handleCloseForm = useCallback(() => {
    if (isFormDirty && !window.confirm('You have unsaved changes. Are you sure you want to close?')) {
      return;
    }
    resetForm();
  }, [isFormDirty, resetForm]);

  return (
    <div className="space-y-6">
      <ConfirmDialogComponent />
      {!formOnly && (
      <div className="flex flex-col-reverse items-start gap-3 sm:flex-row sm:justify-between sm:items-center">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
          Journal
        </h2>
        <button
          type="button"
          onClick={openCreateForm}
          className="btn btn-primary text-sm sm:text-base whitespace-nowrap"
        >
          <span className="sm:hidden">+ Add</span>
          <span className="hidden sm:inline">+ New Entry</span>
        </button>
      </div>
      )}

      {/* Form Modal */}
      <FormModal
        isOpen={manager.showForm}
        onClose={handleCloseForm}
        title={manager.editingId ? "Edit Entry" : "New Journal Entry"}
        icon="journal"
        formId="journal-form"
        footer={
          <FormModalFooter
            onCancel={handleCloseForm}
            formId="journal-form"
            isSubmitting={isSubmitting}
            submitLabel={`${manager.editingId ? "Update" : "Create"} Entry`}
            isEditMode={!!manager.editingId}
            onSaveAndAddAnother={() => addAnother.submit(document.getElementById('journal-form'))}
            leftContent={
              <DraftIndicator
                isSaving={draft.isSaving}
                lastSavedAt={draft.lastSavedAt}
                show={draft.hasDraft && !manager.editingId}
              />
            }
          />
        }
      >
        {/* Draft Restore Prompt */}
        <DraftRestorePrompt
          isOpen={showDraftPrompt && !manager.editingId}
          savedAt={draft.lastSavedAt}
          onRestore={handleRestoreDraft}
          onDiscard={handleDiscardDraft}
          entityType="journal entry"
        />

        <form id="journal-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor={titleFieldId}
              className="block text-sm font-medium text-charcoal dark:text-warm-gray mb-1"
            >
              Title *
            </label>
            <input
              type="text"
              id={titleFieldId}
              name="title"
              autoComplete="off"
              value={formValues.title}
              onChange={(e) => setField('title', e.target.value)}
              onBlur={(e) => journalFieldErrors.handleBlur('title', e.target.value)}
              className={`input ${journalFieldErrors.inputErrorClass('title')}`}
              aria-invalid={journalFieldErrors.touched.title && !!journalFieldErrors.errors.title}
              aria-describedby={journalFieldErrors.errors.title ? "journal-title-error" : undefined}
              placeholder="Day 1 in Paris"
              required
            />
            {journalFieldErrors.touched.title && journalFieldErrors.errors.title && (
              <p id="journal-title-error" className="text-red-600 dark:text-red-400 text-xs mt-1">
                {journalFieldErrors.errors.title}
              </p>
            )}
          </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor={entryDateFieldId}
                  className="block text-sm font-medium text-charcoal dark:text-warm-gray mb-1"
                >
                  Entry Date
                </label>
                <input
                  type="date"
                  id={entryDateFieldId}
                  name="entry-date"
                  autoComplete="off"
                  value={formValues.entryDate}
                  onChange={(e) => setField('entryDate', e.target.value)}
                  className="input"
                />
                {/* Not min/max on the input: those would also block saving a manual entry
                    on a day outside the trip, and only the AI draft is scoped. */}
                {!manager.editingId && draftWindowHint && (
                  <p
                    id={draftHintId}
                    className={`text-xs mt-1 ${
                      entryDateDraftable
                        ? "text-gray-500 dark:text-dusk-400"
                        : "text-amber-700 dark:text-amber-300"
                    }`}
                  >
                    {entryDateDraftable
                      ? draftWindowHint
                      : `Draft with AI is off for this date. ${draftWindowHint}`}
                  </p>
                )}
              </div>
              {!manager.editingId && (
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleDraftWithAi}
                    disabled={!formValues.entryDate || !entryDateDraftable || aiDrafting || isSubmitting}
                    aria-describedby={draftWindowHint ? draftHintId : undefined}
                    title={
                      !formValues.entryDate
                        ? "Pick an entry date first"
                        : !entryDateDraftable
                          ? "That date is outside the trip"
                          : undefined
                    }
                    className="btn btn-secondary text-sm disabled:opacity-50"
                  >
                    {aiDrafting ? "Drafting…" : (
                      <>
                        <Icon name="sparkle" size={16} className="align-text-bottom mr-1" />
                        Draft with AI
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {aiError && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200"
              >
                {aiError.message}
                {aiError.kind === 'not-configured' && (
                  <>
                    {" "}Add an API key under{" "}
                    <Link to="/settings?tab=integrations" className="underline font-medium">
                      Settings &rarr; Integrations
                    </Link>{" "}
                    to use AI drafts.
                  </>
                )}
              </div>
            )}

            {aiDraft && !manager.editingId && (
              <div
                role="status"
                data-testid="ai-draft-banner"
                className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm text-purple-900 dark:border-purple-800 dark:bg-purple-900/20 dark:text-purple-100"
              >
                <strong>AI draft.</strong> Written only from what is recorded for this day, so check it
                over and add your own voice. Nothing is saved until you press Create Entry.
              </div>
            )}

            <div>
              <MarkdownEditor
                value={formValues.content}
                onChange={(val) => setField('content', val)}
                rows={12}
                placeholder="Write your journal entry here…"
                label="Content"
                required={true}
              />
              <p className="text-xs text-gray-500 dark:text-dusk-400 mt-1">
                {formValues.content.length} characters
              </p>
            </div>

            {/* Link to other entities note */}
            <div className="border-t border-gray-200 dark:border-dusk-700 pt-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <Icon name="lightbulb" size={16} className="align-text-bottom" /> <strong>Tip:</strong> After creating your journal entry, use the link button (<Icon name="link" size={16} className="align-text-bottom" />) to connect it to locations, activities, lodging, transportation, photos, or albums.
                </p>
              </div>
            </div>
          </form>
        </FormModal>

      {formOnly ? null : manager.items.length === 0 ? (
        <EmptyState
          icon={<EmptyIllustrations.NoJournalEntries />}
          message="Tell Your Story"
          subMessage="Every journey has a story worth telling. Write about your experiences, capture the emotions, and preserve the small moments that make travel unforgettable. Your future self will thank you."
          actionLabel="Write Your First Entry"
          onAction={openCreateForm}
        />
      ) : (
        <div className="space-y-4">
          {manager.items.map((entry) => {
            const isExpanded = expandedId === entry.id;

            return (
              <div
                key={entry.id}
                data-entity-id={`journal_entry-${entry.id}`}
                className="bg-white dark:bg-dusk-800 border border-gray-200 dark:border-dusk-700 rounded-lg shadow hover:shadow-lg transition-shadow"
              >
                <div className="p-6">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-1 break-words">
                        {entry.title || "Untitled Entry"}
                      </h3>
                      <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-dusk-400">
                        {entry.date && (
                          <span className="inline-flex items-center gap-1">
                            <Icon name="calendar" size={16} /> {formatDate(entry.date, 'full')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 self-start">
                      <LinkButton
                        tripId={tripId}
                        entityType="JOURNAL_ENTRY"
                        entityId={entry.id}
                        linkSummary={getLinkSummary('JOURNAL_ENTRY', entry.id)}
                        onUpdate={invalidateLinkSummary}
                        size="sm"
                        hideWhenLinked
                      />
                      <button
                        type="button"
                        onClick={() => handleEdit(entry)}
                        className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 whitespace-nowrap text-sm sm:text-base"
                        aria-label={`Edit journal entry ${entry.title || 'Untitled Entry'}`}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(entry.id)}
                        className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 whitespace-nowrap text-sm sm:text-base"
                        aria-label={`Delete journal entry ${entry.title || 'Untitled Entry'}`}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {isExpanded ? (
                    <MarkdownRenderer content={entry.content} />
                  ) : (
                    <p className="journal-prose text-gray-700 dark:text-dusk-300">
                      {stripMarkdown(truncateContent(entry.content))}
                    </p>
                  )}

                  {entry.content.length > 200 && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId(isExpanded ? null : entry.id)
                      }
                      className="mt-3 text-blue-600 dark:text-blue-400 hover:text-blue-800 text-sm font-medium"
                      {...{ 'aria-expanded': isExpanded }}
                      aria-label={isExpanded ? `Collapse ${entry.title || 'entry'} content` : `Expand ${entry.title || 'entry'} content`}
                    >
                      {isExpanded ? "Show less" : (
                        <>
                          Read more <Icon name="forward" size={16} className="align-text-bottom" />
                        </>
                      )}
                    </button>
                  )}

                  {/* Entity Links (from EntityLink system) */}
                  <LinkedEntitiesDisplay
                    tripId={tripId}
                    entityType="JOURNAL_ENTRY"
                    entityId={entry.id}
                    compact
                    manageable
                    onLinksUpdate={invalidateLinkSummary}
                  />
                </div>

                <div className="px-6 py-3 bg-gray-50 dark:bg-dusk-700 border-t border-gray-100 dark:border-dusk-600 text-xs text-gray-500 dark:text-dusk-400">
                  {entry.updatedAt !== entry.createdAt
                    ? `Last edited ${new Date(
                        entry.updatedAt
                      ).toLocaleDateString()}`
                    : `Created ${new Date(
                        entry.createdAt
                      ).toLocaleDateString()}`}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
