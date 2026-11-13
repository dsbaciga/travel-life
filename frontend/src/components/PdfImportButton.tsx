import { useState } from 'react';
import PdfUploadModal from './PdfUploadModal';

interface Props {
  tripId?: number;
  onComplete?: () => void;
  /**
   * `menuItem` renders as a full-width row for the mobile trip-header overflow
   * menu instead of a standalone bordered button.
   */
  variant?: 'button' | 'menuItem';
}

const BUTTON_CLASSES =
  'inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-stone-300 dark:border-dusk-600 bg-white dark:bg-dusk-800 text-stone-700 dark:text-dusk-300 hover:bg-stone-50 dark:hover:bg-dusk-700 transition-colors';

const MENU_ITEM_CLASSES =
  'flex w-full items-center gap-3 px-4 py-3 text-sm font-medium text-left text-charcoal dark:text-warm-gray hover:bg-parchment dark:hover:bg-navy-700 transition-colors';

export default function PdfImportButton({ tripId, onComplete, variant = 'button' }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={variant === 'menuItem' ? MENU_ITEM_CLASSES : BUTTON_CLASSES}
        title="Import from PDF"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        Import PDF
      </button>
      {isOpen && (
        <PdfUploadModal
          tripId={tripId}
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          onComplete={() => {
            setIsOpen(false);
            onComplete?.();
          }}
        />
      )}
    </>
  );
}
