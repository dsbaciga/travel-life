import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import savedLinkService from "../services/savedLink.service";
import {
  hasPendingMetadata,
  savedLinkDisplayTitle,
  savedLinkHostname,
  PREVIEW_POLL_INTERVAL_MS,
  type SavedLink,
} from "../types/savedLink";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { useTripLinkSummary } from "../hooks/useTripLinkSummary";
import { useBulkSelection } from "../hooks/useBulkSelection";
import BulkActionBar from "./BulkActionBar";
import EmptyState from "./EmptyState";
import LinkButton from "./LinkButton";
import { ListItemSkeleton } from "./SkeletonLoader";

/**
 * SavedLinksManager handles the trip "Links" tab.
 *
 * Saved links are reference URLs (restaurant writeups, trail guides,
 * timetables) kept alongside a trip. They are distinct from the `bookingUrl`
 * field on activities/lodging/transportation, which means "the booking".
 *
 * Each link exposes a LinkButton so it can be attached to any entity in the
 * trip through the existing EntityLink flow — no bespoke attachment UI here.
 */
interface SavedLinksManagerProps {
  tripId: number;
  onUpdate?: () => void;
}

interface LinkFormState {
  url: string;
  title: string;
  notes: string;
}

const EMPTY_FORM: LinkFormState = { url: "", title: "", notes: "" };

function MetadataBadge({ link }: { link: SavedLink }) {
  if (link.metadataStatus === "PENDING") {
    return (
      <span className="text-xs text-slate dark:text-dusk-400 italic">
        Loading preview…
      </span>
    );
  }
  if (link.metadataStatus === "FAILED") {
    return (
      <span className="text-xs text-amber-600 dark:text-amber-400">
        No preview available
      </span>
    );
  }
  return null;
}

export default function SavedLinksManager({
  tripId,
  onUpdate,
}: SavedLinksManagerProps) {
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const { getLinkSummary } = useTripLinkSummary(tripId);

  const [form, setForm] = useState<LinkFormState>(EMPTY_FORM);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const bulkSelection = useBulkSelection<SavedLink>();
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const { data: links, isLoading } = useQuery({
    queryKey: ["savedLinks", tripId],
    queryFn: () => savedLinkService.getSavedLinksByTrip(tripId),
    enabled: !!tripId,
    // A freshly saved link renders as PENDING while its preview is scraped in
    // the background; poll until it lands, then stop.
    refetchInterval: (query) =>
      hasPendingMetadata(query.state.data) ? PREVIEW_POLL_INTERVAL_MS : false,
  });

  const refreshData = () => {
    queryClient.invalidateQueries({ queryKey: ["savedLinks", tripId] });
    queryClient.invalidateQueries({ queryKey: ["savedLinksInboxCount"] });
    queryClient.invalidateQueries({ queryKey: ["tripLinkSummary", tripId] });
    onUpdate?.();
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setIsAdding(false);
    setEditingId(null);
  };

  const handleSave = async () => {
    const url = form.url.trim();
    if (!url) {
      toast.error("A URL is required");
      return;
    }

    setSaving(true);
    try {
      if (editingId !== null) {
        await savedLinkService.updateSavedLink(editingId, {
          url,
          title: form.title.trim() || null,
          notes: form.notes.trim() || null,
        });
        toast.success("Link updated");
      } else {
        await savedLinkService.createSavedLink({
          url,
          tripId,
          title: form.title.trim() || null,
          notes: form.notes.trim() || undefined,
        });
        toast.success("Link saved — fetching preview");
      }
      resetForm();
      refreshData();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save link";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (link: SavedLink) => {
    setEditingId(link.id);
    setIsAdding(true);
    setForm({
      url: link.url,
      title: link.title ?? "",
      notes: link.notes ?? "",
    });
  };

  const handleDelete = async (link: SavedLink) => {
    const confirmed = await confirm({
      title: "Delete link?",
      message: `"${savedLinkDisplayTitle(link)}" will be removed, along with any items it is attached to.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) return;

    try {
      await savedLinkService.deleteSavedLink(link.id);
      toast.success("Link deleted");
      refreshData();
    } catch {
      toast.error("Failed to delete link");
    }
  };

  const handleBulkDelete = async () => {
    const ids = bulkSelection.getSelectedIds();
    if (ids.length === 0) return;

    const confirmed = await confirm({
      title: "Delete Links",
      message: `Delete ${ids.length} selected link${ids.length === 1 ? "" : "s"}? They will be removed along with any items they are attached to.`,
      confirmLabel: "Delete All",
      variant: "danger",
    });
    if (!confirmed) return;

    setIsBulkDeleting(true);
    try {
      const { deletedCount } = await savedLinkService.bulkDeleteSavedLinks(ids);
      toast.success(`Deleted ${deletedCount} links`);
      bulkSelection.exitSelectionMode();
      refreshData();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete links",
      );
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleUnassign = async (link: SavedLink) => {
    const confirmed = await confirm({
      title: "Move to inbox?",
      message:
        "This link will be removed from the trip and returned to your inbox. Any items it is attached to will be unlinked.",
      confirmLabel: "Move to inbox",
    });
    if (!confirmed) return;

    try {
      await savedLinkService.updateSavedLink(link.id, { tripId: null });
      toast.success("Moved to inbox");
      refreshData();
    } catch {
      toast.error("Failed to move link");
    }
  };

  const handleRefreshMetadata = async (link: SavedLink) => {
    try {
      await savedLinkService.refreshMetadata(link.id);
      toast.success("Preview refreshed");
      refreshData();
    } catch {
      toast.error("Failed to refresh preview");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-display font-semibold text-charcoal dark:text-dusk-100">
            Links
          </h2>
          <p className="text-sm text-slate dark:text-dusk-400">
            Reference pages for this trip — attach them to activities, lodging,
            or anywhere else.
          </p>
        </div>
        {!isAdding && (
          <div className="flex items-center gap-2">
            {!!links?.length && !bulkSelection.selectionMode && (
              <button
                type="button"
                className="btn btn-secondary text-sm whitespace-nowrap"
                onClick={bulkSelection.enterSelectionMode}
              >
                Select
              </button>
            )}
            <button
              type="button"
              className="btn-primary whitespace-nowrap"
              onClick={() => setIsAdding(true)}
            >
              Add Link
            </button>
          </div>
        )}
      </div>

      {isAdding && (
        <div className="card space-y-4">
          <div>
            <label className="label label-required" htmlFor="saved-link-url">
              URL
            </label>
            <input
              id="saved-link-url"
              type="url"
              className="input"
              placeholder="https://example.com/great-restaurant"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
            />
            <p className="mt-1 text-xs text-slate dark:text-dusk-400">
              Tracking parameters (utm_*, fbclid, and similar) are stripped
              automatically.
            </p>
          </div>

          <div>
            <label className="label" htmlFor="saved-link-title">
              Title
            </label>
            <input
              id="saved-link-title"
              type="text"
              className="input"
              placeholder="Leave blank to use the page title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div>
            <label className="label" htmlFor="saved-link-notes">
              Notes
            </label>
            <textarea
              id="saved-link-notes"
              className="input"
              rows={3}
              placeholder="Why is this worth keeping?"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="btn-secondary"
              onClick={resetForm}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving
                ? "Saving…"
                : editingId !== null
                  ? "Save Changes"
                  : "Save Link"}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <ListItemSkeleton count={3} />
      ) : !links || links.length === 0 ? (
        <EmptyState
          icon="🔗"
          message="No links yet"
          subMessage="Save a page you want to remember for this trip"
          actionLabel="Add Link"
          onAction={() => setIsAdding(true)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {links.map((link, index) => (
            <div key={link.id} className="card flex gap-4">
              {bulkSelection.selectionMode && (
                <input
                  type="checkbox"
                  checked={bulkSelection.isSelected(link.id)}
                  onChange={() => {}} // Selection handled by onClick to support shiftKey
                  onClick={(e) =>
                    bulkSelection.toggleItemSelection(
                      link.id,
                      index,
                      e.shiftKey,
                      links,
                    )
                  }
                  aria-label="Select link"
                  className="w-5 h-5 mt-1 flex-shrink-0 rounded border-primary-200 dark:border-gold/30 text-primary-600 dark:text-gold focus:ring-primary-500 dark:focus:ring-gold/50"
                />
              )}

              {link.imageUrl && (
                <img
                  src={link.imageUrl}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="w-24 h-24 object-cover rounded-lg flex-shrink-0"
                  onError={(e) => {
                    // Remote image went away — drop it rather than showing a
                    // broken-image icon.
                    e.currentTarget.style.display = "none";
                  }}
                />
              )}

              <div className="min-w-0 flex-1">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="font-medium text-charcoal dark:text-dusk-100 hover:text-primary-600 dark:hover:text-gold line-clamp-2"
                >
                  {savedLinkDisplayTitle(link)}
                </a>

                <p className="text-xs text-slate dark:text-dusk-400 mt-0.5 truncate">
                  {savedLinkHostname(link)}
                </p>

                {link.description && (
                  <p className="text-sm text-slate dark:text-dusk-400 mt-2 line-clamp-2">
                    {link.description}
                  </p>
                )}

                {link.notes && (
                  <p className="text-sm text-charcoal dark:text-dusk-300 mt-2 line-clamp-2 italic">
                    {link.notes}
                  </p>
                )}

                <div className="mt-2">
                  <MetadataBadge link={link} />
                </div>

                <div className="flex items-center gap-1 mt-3 flex-wrap">
                  <LinkButton
                    tripId={tripId}
                    entityType="SAVED_LINK"
                    entityId={link.id}
                    linkSummary={getLinkSummary("SAVED_LINK", link.id)}
                    onUpdate={refreshData}
                    size="sm"
                  />
                  <button
                    type="button"
                    className="text-xs px-2 py-1 text-slate dark:text-dusk-400 hover:text-primary-600 dark:hover:text-gold"
                    onClick={() => startEdit(link)}
                  >
                    Edit
                  </button>
                  {link.metadataStatus !== "FETCHED" && (
                    <button
                      type="button"
                      className="text-xs px-2 py-1 text-slate dark:text-dusk-400 hover:text-primary-600 dark:hover:text-gold"
                      onClick={() => handleRefreshMetadata(link)}
                    >
                      Retry preview
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-xs px-2 py-1 text-slate dark:text-dusk-400 hover:text-primary-600 dark:hover:text-gold"
                    onClick={() => handleUnassign(link)}
                  >
                    Move to inbox
                  </button>
                  <button
                    type="button"
                    className="text-xs px-2 py-1 text-red-600 dark:text-red-400 hover:underline"
                    onClick={() => handleDelete(link)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bulk Action Bar */}
      {bulkSelection.selectionMode && (
        <BulkActionBar
          entityType="link"
          selectedCount={bulkSelection.selectedCount}
          totalCount={links?.length ?? 0}
          onSelectAll={() => bulkSelection.selectAll(links ?? [])}
          onDeselectAll={bulkSelection.deselectAll}
          onExitSelectionMode={bulkSelection.exitSelectionMode}
          onBulkDelete={handleBulkDelete}
          isDeleting={isBulkDeleting}
        />
      )}

      <ConfirmDialogComponent />
    </div>
  );
}
