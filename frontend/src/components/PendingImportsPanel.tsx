import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import pdfImportService from '../services/pdfImport.service';
import PdfReviewModal from './PdfReviewModal';
import type { PendingEntity } from '../types/pdfImport';

const TYPE_LABELS: Record<string, [singular: string, plural: string]> = {
  TRANSPORTATION: ['transport booking', 'transport bookings'],
  LODGING: ['stay', 'stays'],
  ACTIVITY: ['activity', 'activities'],
  LOCATION: ['place', 'places'],
};

function summarise(entities: PendingEntity[]): string {
  const counts = new Map<string, number>();
  for (const entity of entities) {
    counts.set(entity.entityType, (counts.get(entity.entityType) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([type, count]) => {
      const [singular, plural] = TYPE_LABELS[type] ?? ['item', 'items'];
      return `${count} ${count === 1 ? singular : plural}`;
    })
    .join(', ');
}

/**
 * Bookings parsed out of uploaded PDFs that have not been accepted or
 * rejected yet. They are counted in the Inbox badge, so the Inbox is where
 * they are reviewed. Renders nothing when there is nothing waiting.
 */
export default function PendingImportsPanel() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedImportId, setSelectedImportId] = useState<number | null>(null);
  // `?reviewImport=<id>` deep link, written by the "PDF is ready" banner.
  const reviewParam = searchParams.get('reviewImport');
  const linkedImportId = reviewParam && /^\d+$/.test(reviewParam) ? Number(reviewParam) : null;
  const reviewingImportId = selectedImportId ?? linkedImportId;

  const { data: pending = [] } = useQuery({
    queryKey: ['pendingEntities', 'inbox'],
    queryFn: () => pdfImportService.getPendingEntities({ status: 'PENDING' }),
    staleTime: 0,
  });

  const { data: imports = [] } = useQuery({
    queryKey: ['pdfImports'],
    queryFn: () => pdfImportService.getPdfImports(),
    enabled: pending.length > 0,
  });

  const groups = useMemo(() => {
    const byImport = new Map<number, PendingEntity[]>();
    for (const entity of pending) {
      if (entity.pdfImportId == null) continue;
      const list = byImport.get(entity.pdfImportId) ?? [];
      list.push(entity);
      byImport.set(entity.pdfImportId, list);
    }
    return [...byImport.entries()];
  }, [pending]);

  const closeReview = () => {
    setSelectedImportId(null);
    if (linkedImportId !== null) {
      const next = new URLSearchParams(searchParams);
      next.delete('reviewImport');
      setSearchParams(next, { replace: true });
    }
    queryClient.invalidateQueries({ queryKey: ['pendingEntities'] });
    queryClient.invalidateQueries({ queryKey: ['pendingCount'] });
  };

  const reviewModal =
    reviewingImportId !== null ? (
      <PdfReviewModal
        isOpen
        importId={reviewingImportId}
        onClose={closeReview}
        onComplete={closeReview}
      />
    ) : null;

  // Nothing waiting, but a banner link may still have asked for one import
  // (a failed parse offering "Try again", or one already reviewed).
  if (groups.length === 0) return reviewModal;

  return (
    <section className="card mb-8" aria-labelledby="pending-imports-heading">
      <h2
        id="pending-imports-heading"
        className="text-lg font-display font-bold text-charcoal dark:text-white mb-1"
      >
        Imported bookings to review
      </h2>
      <p className="text-sm text-slate dark:text-dusk-400 mb-4">
        Read from PDFs you uploaded. Nothing is added to a trip until you accept it.
      </p>
      <ul className="divide-y divide-primary-500/10 dark:divide-navy-700">
        {groups.map(([importId, entities]) => {
          const name =
            imports.find((item) => item.id === importId)?.originalName ?? `Import ${importId}`;
          return (
            <li key={importId} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="font-medium text-charcoal dark:text-warm-gray truncate">{name}</p>
                <p className="text-sm text-slate dark:text-dusk-400">{summarise(entities)}</p>
              </div>
              <button
                type="button"
                className="btn btn-secondary flex-none"
                onClick={() => setSelectedImportId(importId)}
              >
                Review
              </button>
            </li>
          );
        })}
      </ul>

      {reviewModal}
    </section>
  );
}
