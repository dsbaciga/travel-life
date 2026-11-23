import Icon from './ui/Icon';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import tripService from '../services/trip.service';
import { EllipsisVerticalIcon } from './icons';
import PdfImportButton from './PdfImportButton';
import PdfUploadModal from './PdfUploadModal';
import BulkImportModal from './BulkImportModal';

interface TripHeaderActionsProps {
  tripId: number;
  tagsCount: number;
  onManageTags: () => void;
  onShare?: () => void;
  onDuplicate: () => void;
  /** Current archived state; enables the Archive / Unarchive item in the phone menu. */
  archived?: boolean;
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
  archived,
  variant = 'plain',
}: TripHeaderActionsProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // Which edge of the trigger the menu hangs from. The header wraps on
  // phones, so the trigger can sit at the left edge of the screen (below the
  // title) or at the right (beside it); a right-anchored menu opened from the
  // left edge ran off screen.
  const [menuAlign, setMenuAlign] = useState<'left' | 'right'>('right');
  const [isPdfImportOpen, setIsPdfImportOpen] = useState(false);
  const [isCsvImportOpen, setIsCsvImportOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const archiveMutation = useMutation({
    mutationFn: (nextArchived: boolean) => tripService.updateTrip(tripId, { archived: nextArchived }),
    onSuccess: (_data, nextArchived) => {
      toast.success(nextArchived ? 'Trip archived.' : 'Trip unarchived.');
    },
    onError: () => {
      toast.error('Failed to update trip.');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
      queryClient.invalidateQueries({ queryKey: ['trips'] });
    },
  });

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
          onClick={(event) => {
            if (!isMenuOpen) {
              const rect = event.currentTarget.getBoundingClientRect();
              setMenuAlign(rect.left + rect.width / 2 < window.innerWidth / 2 ? 'left' : 'right');
            }
            setIsMenuOpen((open) => !open);
          }}
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
            className={`absolute ${menuAlign === 'left' ? 'left-0' : 'right-0'} top-12 z-40 w-56 overflow-hidden rounded-xl border border-primary-100 bg-white shadow-xl dark:border-gold/20 dark:bg-navy-800`}
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
            <button type="button" role="menuitem" className={menuItemClasses} onClick={() => { setIsMenuOpen(false); setIsCsvImportOpen(true); }}>
              Import CSV
            </button>
            <button type="button" role="menuitem" className={menuItemClasses} onClick={() => { setIsMenuOpen(false); onDuplicate(); }}>
              Duplicate trip
            </button>
            {archived !== undefined && (
              <button type="button" role="menuitem" className={menuItemClasses} onClick={() => { setIsMenuOpen(false); archiveMutation.mutate(!archived); }}>
                {archived ? 'Unarchive trip' : 'Archive trip'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tablet and up: inline buttons */}
      <div className="hidden sm:flex flex-row gap-2 flex-shrink-0">
        <button
          onClick={onManageTags}
          className="btn btn-secondary flex items-center justify-center gap-2 text-sm sm:text-base px-3 sm:px-4 py-2 whitespace-nowrap"
        >
          <Icon name="tag" className="w-4 h-4 flex-shrink-0" />
          Manage Tags ({tagsCount})
        </button>

        {onShare && (
          <button
            onClick={onShare}
            className="btn btn-secondary flex items-center justify-center gap-2 text-sm sm:text-base px-3 sm:px-4 py-2 whitespace-nowrap"
            aria-label="Share trip"
          >
            <Icon name="share" className="w-4 h-4 flex-shrink-0" />
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

        <button
          type="button"
          onClick={() => setIsCsvImportOpen(true)}
          className="btn btn-secondary flex items-center justify-center gap-2 text-sm sm:text-base px-3 sm:px-4 py-2 whitespace-nowrap"
        >
          Import CSV
        </button>
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
        />
      )}

      {/* Same reason as the PDF dialog above: owned here, outside the phone menu. */}
      {isCsvImportOpen && (
        <BulkImportModal isOpen={isCsvImportOpen} onClose={() => setIsCsvImportOpen(false)} tripId={tripId} />
      )}
    </>
  );
}
