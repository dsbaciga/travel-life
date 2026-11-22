import toast from 'react-hot-toast';
import { PdfImportBanner } from '../components/PdfImportBanner';
import { ENTITY_TYPE_TO_TAB } from '../lib/entityConfig';
import type { PdfImport, PendingEntityType } from '../types/pdfImport';

/** Inbox URL that opens the review dialog for one import. */
export function pdfImportReviewPath(importId: number): string {
  return `/saved-links?reviewImport=${importId}`;
}

/** Trip page URL that opens the right tab and highlights a newly created entity. */
export function createdEntityPath(tripId: number, type: PendingEntityType, id: number): string {
  const tab = ENTITY_TYPE_TO_TAB[type];
  return `/trips/${tripId}?tab=${tab}#${type.toLowerCase()}-${id}`;
}

/** A banner's one action: a link to follow, or a button (e.g. Cancel). */
export type BannerAction = { label: string; to: string } | { label: string; onClick: () => void };

export interface BannerContent {
  /** `working` shows a spinner: the PDF is still being read. */
  tone: 'success' | 'neutral' | 'error' | 'working';
  title: string;
  body: string;
  action?: BannerAction;
}

/** Shown while the model reads the PDF, replaced in place by the result banner. */
export function describeImportInProgress(
  name: string,
  onCancel: () => void,
  /** PDFs ahead of this one in the server's queue; 0 or absent = being read. */
  queuePosition?: number | null
): BannerContent {
  const ahead = queuePosition ?? 0;
  if (ahead > 0) {
    return {
      tone: 'working',
      title: `Waiting to read ${name}`,
      body: `${ahead} ${ahead === 1 ? 'PDF' : 'PDFs'} ahead of it. Follow it in your Inbox; we'll let you know when it's ready.`,
      action: { label: 'Cancel', onClick: onCancel },
    };
  }
  return {
    tone: 'working',
    title: `Reading ${name}…`,
    body: "Follow it in your Inbox. We'll let you know when it's ready.",
    action: { label: 'Cancel', onClick: onCancel },
  };
}

/** What to tell the user once an import has stopped parsing (or we gave up on it). */
export function describeFinishedImport(
  name: string,
  pdfImport: Pick<PdfImport, 'id' | 'status' | 'errorMessage' | '_count'> | null
): BannerContent {
  if (!pdfImport) {
    return {
      tone: 'neutral',
      title: `Still working on ${name}`,
      body: 'This is taking longer than usual. Anything it finds will appear in your Inbox.',
      action: { label: 'Open Inbox', to: '/saved-links' },
    };
  }

  const review = { to: pdfImportReviewPath(pdfImport.id) };

  switch (pdfImport.status) {
    case 'PARSED': {
      const count = pdfImport._count?.pendingEntities ?? 0;
      return {
        tone: 'success',
        title: `${name} is ready`,
        body:
          count > 0
            ? `Found ${count} ${count === 1 ? 'booking' : 'bookings'} to review.`
            : 'Bookings are ready to review.',
        action: { label: 'Review', ...review },
      };
    }
    case 'NO_ENTITIES':
      return {
        tone: 'neutral',
        title: `Nothing found in ${name}`,
        body: 'No bookings could be read from this PDF.',
      };
    case 'PARSE_FAILED':
    default:
      return {
        tone: 'error',
        title: `Couldn't read ${name}`,
        body: pdfImport.errorMessage || 'Parsing failed.',
        action: { label: 'Details', ...review },
      };
  }
}

/**
 * Pops the banner. Actionable results stay up until dismissed or followed,
 * since the point of background parsing is that the user may be elsewhere.
 */
export function showPdfImportBanner(
  key: string | number,
  content: BannerContent,
  options: { duration?: number } = {}
): void {
  toast.custom(
    (t) => (
      <PdfImportBanner {...content} visible={t.visible} onDismiss={() => toast.dismiss(t.id)} />
    ),
    {
      id: `pdf-import-${key}`,
      duration: options.duration ?? (content.action ? Infinity : 8000),
    }
  );
}
