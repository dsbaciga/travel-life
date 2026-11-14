import { useState, useEffect, useRef, useCallback } from "react";
import type { PhotoAlbum } from "../types/photo";
import LinkButton from "./LinkButton";
import { useTripLinkSummary } from "../hooks/useTripLinkSummary";
import MarkdownEditor from "./MarkdownEditor";

/** Selector for all focusable elements within a modal */
const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface AlbumModalProps {
  album?: PhotoAlbum; // If provided, we're editing; otherwise creating
  tripId: number;
  onSave: (data: {
    name: string;
    description: string;
  }) => Promise<void>;
  onClose: () => void;
  onUpdate?: () => void; // Callback to refresh data after linking
}

export default function AlbumModal({
  album,
  tripId,
  onSave,
  onClose,
  onUpdate,
}: AlbumModalProps) {
  const [name, setName] = useState(album?.name || "");
  const [description, setDescription] = useState(album?.description || "");
  const [saving, setSaving] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const triggerElementRef = useRef<HTMLElement | null>(null);

  // Fetch link summary for this album
  const { getLinkSummary, invalidate: invalidateLinkSummary } = useTripLinkSummary(tripId);

  const isEdit = !!album;

  // Handle keyboard events including focus trap
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Escape to close
    if (e.key === 'Escape') {
      onClose();
      return;
    }

    // Focus trap - keep Tab navigation within the modal
    if (e.key === 'Tab' && modalRef.current) {
      const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  }, [onClose]);

  // Focus management and keyboard handling
  useEffect(() => {
    // Store the currently focused element to restore later
    triggerElementRef.current = document.activeElement as HTMLElement;

    // Focus the first input (the name input has autoFocus, but this ensures it)
    setTimeout(() => {
      const firstInput = modalRef.current?.querySelector<HTMLElement>('input, select, textarea');
      firstInput?.focus();
    }, 0);

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      // Return focus to the trigger element
      triggerElementRef.current?.focus();
    };
  }, [handleKeyDown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setSaving(true);
      await onSave({
        name: name.trim(),
        description: description.trim() || "",
      });
      onClose();
    } catch (error) {
      console.error("Failed to save album:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[80] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="album-modal-title"
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="bg-white dark:bg-dusk-800 rounded-lg shadow-xl max-w-md w-full"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-dusk-700">
          <h2 id="album-modal-title" className="text-xl font-bold text-gray-900 dark:text-white">
            {isEdit ? "Edit Album" : "Create Album"}
          </h2>
          <button
            onClick={onClose}
            type="button"
            aria-label="Close"
            className="text-gray-400 hover:text-gray-600 dark:hover:text-dusk-200 min-w-[44px] min-h-[44px] p-2 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-dusk-700"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label
              htmlFor="album-name"
              className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
            >
              Album Name *
            </label>
            <input
              type="text"
              id="album-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="e.g., Beach Photos, Food Tour, Sunset Views"
              required
              autoFocus
            />
          </div>

          <MarkdownEditor
            value={description}
            onChange={(val) => setDescription(val)}
            rows={3}
            placeholder="Add a description for this album..."
            label="Description (Optional)"
            compact
          />

          {/* Entity Linking Section */}
          {isEdit ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-2">
                Links
              </label>
              <div className="flex items-center gap-2">
                <LinkButton
                  tripId={tripId}
                  entityType="PHOTO_ALBUM"
                  entityId={album.id}
                  linkSummary={getLinkSummary('PHOTO_ALBUM', album.id)}
                  onUpdate={() => {
                    invalidateLinkSummary();
                    onUpdate?.();
                  }}
                  size="md"
                />
                <span className="text-sm text-gray-600 dark:text-dusk-400">
                  Link this album to locations, activities, photos, and more
                </span>
              </div>
            </div>
          ) : (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                💡 After creating this album, you'll be able to link it to locations, activities, and other trip entities.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving || !name.trim()}
            >
              {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Album"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
