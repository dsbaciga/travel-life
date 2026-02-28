import { useState, useId, useMemo, useCallback, useEffect, useRef } from "react";
import type { JournalEntry, CreateJournalEntryInput, UpdateJournalEntryInput } from "../types/journalEntry";
import journalEntryService from "../services/journalEntry.service";
import toast from "react-hot-toast";
import EmptyState, { EmptyIllustrations } from "./EmptyState";
import LinkButton from "./LinkButton";
import LinkedEntitiesDisplay from "./LinkedEntitiesDisplay";
import FormModal from "./FormModal";
import DraftIndicator from "./DraftIndicator";
import DraftRestorePrompt from "./DraftRestorePrompt";
import { useFormFields } from "../hooks/useFormFields";
import { useFormReset } from "../hooks/useFormReset";
import { useManagerCRUD } from "../hooks/useManagerCRUD";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { useTripLinkSummary } from "../hooks/useTripLinkSummary";
import { useEditFromUrlParam } from "../hooks/useEditFromUrlParam";
import { useAutoSaveDraft } from "../hooks/useAutoSaveDraft";
import { useUnsavedChangesWarning } from "../hooks/useUnsavedChangesWarning";
import MarkdownRenderer from "./MarkdownRenderer";
import MarkdownEditor from "./MarkdownEditor";
import { stripMarkdown } from "../utils/stripMarkdown";

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
interface JournalManagerProps {
  tripId: number;
  tripStartDate?: string | null;
  onUpdate?: () => void;
}

export default function JournalManager({
  tripId,
  tripStartDate,
  onUpdate,
}: JournalManagerProps) {
  // Compute default entry date from trip start date (set to noon)
  const defaultEntryDate = useMemo(() => {
    if (!tripStartDate) return "";
    // Extract just the date portion (YYYY-MM-DD) and append time of noon (12:00)
    const dateOnly = tripStartDate.slice(0, 10);
    return `${dateOnly}T12:00`;
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
  const [keepFormOpenAfterSave, setKeepFormOpenAfterSave] = useState(false);
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);

  // Use the new useFormFields hook to manage all form state
  // Memoize initial form values to include trip start date as default
  const initialFormValues = useMemo(() => ({
    title: "",
    content: "",
    entryDate: defaultEntryDate,
  }), [defaultEntryDate]);

  const { values: formValues, setField, resetFields, setAllFields } = useFormFields(initialFormValues);

  // Track unsaved changes for browser close/refresh warning
  const { captureInitialValues, isDirty: isFormDirty, markSaved } = useUnsavedChangesWarning(formValues, manager.showForm);

  // Auto-save draft for form data
  const draftKey = manager.editingId ? manager.editingId : tripId;
  const draft = useAutoSaveDraft(formValues, {
    entityType: 'journal',
    id: draftKey,
    isEditMode: !!manager.editingId,
    tripId,
    defaultValues: initialFormValues,
    enabled: manager.showForm,
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
      entryDate: entry.date
        ? new Date(entry.date).toISOString().slice(0, 16)
        : "",
    });
    manager.openEditForm(entry.id);
    setExpandedId(null);
  }, [setAllFields, manager]);

  // Stable callback for URL-based edit navigation
  const handleEditFromUrl = useCallback((entry: JournalEntry) => {
    handleEdit(entry);
  }, [handleEdit]);

  // Handle URL-based edit navigation (e.g., from EntityDetailModal)
  useEditFromUrlParam(manager.items, handleEditFromUrl, {
    loading: manager.loading,
  });

  // Extended reset that also clears additional local state
  const resetForm = useCallback(() => {
    baseResetForm();
    setKeepFormOpenAfterSave(false);
    setShowDraftPrompt(false);
    draft.clearDraft();
  }, [baseResetForm, draft]);

  // Open create form with clean state
  const openCreateForm = useCallback(() => {
    baseOpenCreateForm();
    setKeepFormOpenAfterSave(false);
  }, [baseOpenCreateForm]);

  const handleSubmit = async (e: React.FormEvent) => {
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
        if (keepFormOpenAfterSave) {
          // Reset form but keep modal open for quick successive entries
          resetFields();
          setKeepFormOpenAfterSave(false);
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

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
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

      {/* Form Modal */}
      <FormModal
        isOpen={manager.showForm}
        onClose={handleCloseForm}
        title={manager.editingId ? "Edit Entry" : "New Journal Entry"}
        icon="📔"
        formId="journal-form"
        footer={
          <div className="flex items-center justify-between w-full gap-4">
            <DraftIndicator
              isSaving={draft.isSaving}
              lastSavedAt={draft.lastSavedAt}
              show={draft.hasDraft && !manager.editingId}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCloseForm}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              {!manager.editingId && (
                <button
                  type="button"
                  onClick={() => {
                    setKeepFormOpenAfterSave(true);
                    (document.getElementById('journal-form') as HTMLFormElement)?.requestSubmit();
                  }}
                  className="btn btn-secondary text-sm whitespace-nowrap hidden sm:block"
                >
                  Save & Add Another
                </button>
              )}
              <button
                type="submit"
                form="journal-form"
                className="btn btn-primary"
              >
                {manager.editingId ? "Update" : "Create"} Entry
              </button>
            </div>
          </div>
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
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
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
              className="input"
              placeholder="Day 1 in Paris"
              required
            />
          </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor={entryDateFieldId}
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Entry Date
                </label>
                <input
                  type="datetime-local"
                  id={entryDateFieldId}
                  name="entry-date"
                  autoComplete="off"
                  value={formValues.entryDate}
                  onChange={(e) => setField('entryDate', e.target.value)}
                  className="input"
                />
              </div>
            </div>

            <div>
              <MarkdownEditor
                value={formValues.content}
                onChange={(val) => setField('content', val)}
                rows={12}
                placeholder="Write your journal entry here\u2026"
                label="Content"
                required={true}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {formValues.content.length} characters
              </p>
            </div>

            {/* Link to other entities note */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  💡 <strong>Tip:</strong> After creating your journal entry, use the link button (🔗) to connect it to locations, activities, lodging, transportation, photos, or albums.
                </p>
              </div>
            </div>
          </form>
        </FormModal>

      {manager.items.length === 0 ? (
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
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow hover:shadow-lg transition-shadow"
              >
                <div className="p-6">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-3">
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">
                        {entry.title || "Untitled Entry"}
                      </h3>
                      <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                        {entry.date && <span>📅 {formatDate(entry.date)}</span>}
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
                    <p className="text-gray-700 dark:text-gray-300">
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
                      {isExpanded ? "Show less" : "Read more →"}
                    </button>
                  )}

                  {/* Entity Links (from EntityLink system) */}
                  <LinkedEntitiesDisplay
                    tripId={tripId}
                    entityType="JOURNAL_ENTRY"
                    entityId={entry.id}
                    compact
                  />
                </div>

                <div className="px-6 py-3 bg-gray-50 dark:bg-gray-700 border-t border-gray-100 dark:border-gray-600 text-xs text-gray-500 dark:text-gray-400">
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
