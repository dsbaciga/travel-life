import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import pdfImportService from '../services/pdfImport.service';
import { useCancelPdfImport } from '../hooks/useCancelPdfImport';
import { usePdfImportTrackerStore } from '../store/pdfImportTrackerStore';

/**
 * PDFs uploaded but not read yet, each with its place in line and a Cancel
 * button. `PdfImportWatcher` polls the same `['pdfImport', id]` queries, so this
 * only reads what it already fetched. Renders nothing when nothing is running.
 */
export default function ImportsInProgressPanel() {
  const tracked = usePdfImportTrackerStore((state) => state.tracked);
  const cancelImport = useCancelPdfImport();
  const [cancelling, setCancelling] = useState<Set<number>>(new Set());

  const results = useQueries({
    queries: tracked.map((item) => ({
      queryKey: ['pdfImport', item.id],
      queryFn: () => pdfImportService.getPdfImportById(item.id),
      retry: false,
    })),
  });

  if (tracked.length === 0) return null;

  return (
    <section className="card mb-8" aria-labelledby="imports-in-progress-heading">
      <h2
        id="imports-in-progress-heading"
        className="text-lg font-display font-bold text-charcoal dark:text-white mb-1"
      >
        Reading PDFs
      </h2>
      <p className="text-sm text-slate dark:text-dusk-400 mb-4">
        Bookings found in them will appear here to review.
      </p>
      <ul className="divide-y divide-primary-500/10 dark:divide-navy-700">
        {tracked.map((item, index) => {
          const ahead = results[index]?.data?.queuePosition ?? 0;
          const busy = cancelling.has(item.id);
          return (
            <li key={item.id} className="flex items-center justify-between gap-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  aria-hidden="true"
                  className="flex-none w-4 h-4 rounded-full border-2 border-primary-600 dark:border-gold border-t-transparent animate-spin motion-reduce:animate-none"
                />
                <div className="min-w-0">
                  <p className="font-medium text-charcoal dark:text-warm-gray truncate">
                    {item.name}
                  </p>
                  <p className="text-sm text-slate dark:text-dusk-400">
                    {ahead > 0
                      ? `Waiting: ${ahead} ${ahead === 1 ? 'PDF' : 'PDFs'} ahead of it`
                      : 'Reading…'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary flex-none"
                disabled={busy}
                onClick={async () => {
                  setCancelling((prev) => new Set(prev).add(item.id));
                  await cancelImport(item);
                  setCancelling((prev) => {
                    const next = new Set(prev);
                    next.delete(item.id);
                    return next;
                  });
                }}
              >
                {busy ? 'Cancelling…' : 'Cancel'}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
