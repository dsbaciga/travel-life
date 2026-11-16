import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { EllipsisVerticalIcon } from './icons';
import PdfImportButton from './PdfImportButton';
import PdfUploadModal from './PdfUploadModal';

interface TripHeaderActionsProps {
  tripId: number;
  tagsCount: number;
  onManageTags: () => void;
  onShare?: () => void;
  onDuplicate: () => void;
  /** `overlay` styles the trigger for use on top of a cover photo. */
  variant?: 'overlay' | 'plain';
}

/**
 * Secondary actions for the trip header.
 *
 * On phones these collapse into a single overflow menu: rendered inline they
 * stacked vertically (four full-width buttons) and pushed the trip's own
 * content below the fold, while none of them is something a mid-trip user
 * reaches for often. From `sm` up they render inline as before.
 */
export default function TripHeaderActions({
  tripId,
  tagsCount,
  onManageTags,
  onShare,
  onDuplicate,
  variant = 'plain',
}: TripHeaderActionsProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isPdfImportOpen, setIsPdfImportOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMenuOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMenuOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen]);

  const triggerClasses =
    variant === 'overlay'
      ? 'bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/40 text-white'
      : 'bg-white/80 hover:bg-white dark:bg-navy-800/80 dark:hover:bg-navy-700 border border-primary-100 dark:border-gold/20 text-charcoal dark:text-warm-gray';

  const menuItemClasses =
    'flex w-full items-center gap-3 px-4 py-3 text-sm font-medium text-left text-charcoal dark:text-warm-gray hover:bg-parchment dark:hover:bg-navy-700 transition-colors';

  return (
    <>
      {/* Mobile: single overflow menu */}
      <div className="sm:hidden relative flex-none" ref={menuRef}>
        <button
          type="button"
          onClick={() => setIsMenuOpen((open) => !open)}
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          aria-label="Trip actions"
          className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${triggerClasses}`}
        >
          <EllipsisVerticalIcon className="h-5 w-5" />
        </button>

        {isMenuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-12 z-40 w-56 overflow-hidden rounded-xl border border-primary-100 bg-white shadow-xl dark:border-gold/20 dark:bg-navy-800"
          >
            <button type="button" role="menuitem" className={menuItemClasses} onClick={() => { setIsMenuOpen(false); onManageTags(); }}>
              Manage tags ({tagsCount})
            </button>
            {onShare && (
              <button type="button" role="menuitem" className={menuItemClasses} onClick={() => { setIsMenuOpen(false); onShare(); }}>
                Share
              </button>
            )}
            <Link role="menuitem" to={`/trips/${tripId}/edit`} className={menuItemClasses} onClick={() => setIsMenuOpen(false)}>
              Edit trip
            </Link>
            <button type="button" role="menuitem" className={menuItemClasses} onClick={() => { setIsMenuOpen(false); setIsPdfImportOpen(true); }}>
              Import PDF
            </button>
            <button type="button" role="menuitem" className={menuItemClasses} onClick={() => { setIsMenuOpen(false); onDuplicate(); }}>
              Duplicate trip
            </button>
          </div>
        )}
      </div>

      {/* Tablet and up: inline buttons */}
      <div className="hidden sm:flex flex-row gap-2 flex-shrink-0">
        <button
          onClick={onManageTags}
          className="btn btn-secondary flex items-center justify-center gap-2 text-sm sm:text-base px-3 sm:px-4 py-2 whitespace-nowrap"
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
            />
          </svg>
          Manage Tags ({tagsCount})
        </button>

        {onShare && (
          <button
            onClick={onShare}
            className="btn btn-secondary flex items-center justify-center gap-2 text-sm sm:text-base px-3 sm:px-4 py-2 whitespace-nowrap"
            aria-label="Share trip"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
              />
            </svg>
            Share
          </button>
        )}

        <Link
          to={`/trips/${tripId}/edit`}
          className="btn btn-secondary text-sm sm:text-base px-3 sm:px-4 py-2 whitespace-nowrap"
        >
          Edit Trip
        </Link>

        <PdfImportButton tripId={tripId} />
      </div>

      {/* Launched from the phone menu, but rendered outside it: the menu's
          contents unmount when it closes, and choosing an item closes it. A
          dialog owned by something inside the menu was unmounted by the same
          tap that opened it, so Import PDF did nothing on a phone. */}
      {isPdfImportOpen && (
        <PdfUploadModal
          tripId={tripId}
          isOpen={isPdfImportOpen}
          onClose={() => setIsPdfImportOpen(false)}
          onComplete={() => setIsPdfImportOpen(false)}
        />
      )}
    </>
  );
}
