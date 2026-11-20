import { useState } from 'react';
import PdfUploadModal from './PdfUploadModal';
import { usePdfImportTrackerStore } from '../store/pdfImportTrackerStore';

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
        title={busy ? 'Another PDF is still being read. You can import the next one when it finishes.' : 'Import from PDF'}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
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
