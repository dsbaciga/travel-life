import { useState } from 'react';
import PdfUploadModal from './PdfUploadModal';
import { usePdfImportTrackerStore } from '../store/pdfImportTrackerStore';
import Icon from './ui/Icon';

interface Props {
  tripId?: number;
}

const BUTTON_CLASSES =
  'inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-stone-300 dark:border-dusk-600 bg-white dark:bg-dusk-800 text-stone-700 dark:text-dusk-300 hover:bg-stone-50 dark:hover:bg-dusk-700 transition-colors';

/**
 * A standalone "Import PDF" button that owns its upload dialog.
 *
 * Do not put this inside a menu or popover that unmounts when an item is
 * chosen: the dialog would unmount with it. Render `PdfUploadModal` from the
 * menu's parent instead, as `TripHeaderActions` does for the phone menu.
 */
export default function PdfImportButton({ tripId }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  // One PDF at a time: the server refuses a second while the model is busy,
  // so don't invite it. Other users' uploads are caught by the server's 409.
  const busy = usePdfImportTrackerStore((state) => state.tracked.length > 0);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        disabled={busy}
        aria-disabled={busy}
        className={`${BUTTON_CLASSES} disabled:opacity-50 disabled:cursor-not-allowed`}
        title={busy ? 'Your last PDF is still waiting or being read. You can import the next one when it finishes, or cancel it from its banner.' : 'Import from PDF'}
      >
        <Icon name="upload" size={16} />
        {busy ? 'Reading PDF…' : 'Import PDF'}
      </button>
      {isOpen && (
        <PdfUploadModal
          tripId={tripId}
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
