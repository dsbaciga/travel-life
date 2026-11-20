import { useCallback, useEffect, useRef } from 'react';
import { useQueries, useQueryClient, type Query } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import toast from 'react-hot-toast';
import pdfImportService from '../services/pdfImport.service';
import { getApiErrorMessage } from '../lib/errors';
import { useAuthStore } from '../store/authStore';
import {
  usePdfImportTrackerStore,
  type TrackedPdfImport,
} from '../store/pdfImportTrackerStore';
import type { PdfImport } from '../types/pdfImport';
import {
  PDF_IMPORT_GIVE_UP_MS,
  isPdfImportFinished,
  pdfImportPollDelayMs,
} from '../utils/pdfImportPolling';
import {
  describeFinishedImport,
  describeImportInProgress,
  showPdfImportBanner,
} from '../utils/pdfImportNotifications';

/**
 * Watches PDF uploads that are still parsing. Each gets a "Reading…" banner
 * with a Cancel button, replaced in place by a result banner (with a Review
 * link) when the server finishes. Mounted once at the app root so it keeps
 * running while the user moves around; renders nothing itself.
 */
export default function PdfImportWatcher() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const tracked = usePdfImportTrackerStore((state) => state.tracked);
  const untrack = usePdfImportTrackerStore((state) => state.untrack);
  const queryClient = useQueryClient();
  // Imports already given their result banner (or cancelled). Guards against a
  // second banner while the untrack re-render is in flight.
  const settled = useRef(new Set<number>());
  // Imports already showing their "Reading…" banner.
  const announced = useRef(new Set<number>());

  const results = useQueries({
    queries: tracked.map((item) => ({
      queryKey: ['pdfImport', item.id],
      queryFn: () => pdfImportService.getPdfImportById(item.id),
      enabled: isAuthenticated,
      retry: false,
      refetchInterval: (query: Query<PdfImport>) =>
        isPdfImportFinished(query.state.data?.status)
          ? false
          : pdfImportPollDelayMs(Date.now() - item.startedAt),
    })),
  });

  const cancel = useCallback(
    async (item: TrackedPdfImport) => {
      if (settled.current.has(item.id)) return;
      settled.current.add(item.id);
      try {
        // Deleting an import that is being read aborts the LLM request and
        // frees the server's one-at-a-time slot.
        await pdfImportService.deletePdfImport(item.id);
        untrack(item.id);
        queryClient.removeQueries({ queryKey: ['pdfImport', item.id] });
        toast.dismiss(`pdf-import-${item.id}`);
        toast.success(`Stopped reading ${item.name}`);
      } catch (err) {
        settled.current.delete(item.id);
        toast.error(getApiErrorMessage(err, `Couldn't cancel ${item.name}`));
      }
    },
    [untrack, queryClient]
  );

  useEffect(() => {
    if (!isAuthenticated) return;

    tracked.forEach((item, index) => {
      if (settled.current.has(item.id)) return;
      const result = results[index];
      const data = result?.data;

      // The import is gone (deleted, or tracked by another account on this
      // browser): drop it quietly.
      if (result?.error && isAxiosError(result.error) && result.error.response?.status === 404) {
        settled.current.add(item.id);
        untrack(item.id);
        toast.dismiss(`pdf-import-${item.id}`);
        return;
      }

      const finished = isPdfImportFinished(data?.status);
      const gaveUp = !finished && Date.now() - item.startedAt >= PDF_IMPORT_GIVE_UP_MS;

      if (!finished && !gaveUp) {
        // Wait for the first answer, so a stale entry never flashes a banner.
        if (data && !announced.current.has(item.id)) {
          announced.current.add(item.id);
          showPdfImportBanner(item.id, describeImportInProgress(item.name, () => void cancel(item)), {
            duration: Infinity,
          });
        }
        return;
      }

      settled.current.add(item.id);
      untrack(item.id);
      // Same toast id as the "Reading…" banner, so this replaces it in place.
      showPdfImportBanner(item.id, describeFinishedImport(item.name, finished ? data! : null));

      if (data?.status === 'PARSED') {
        queryClient.invalidateQueries({ queryKey: ['pendingEntities'] });
        queryClient.invalidateQueries({ queryKey: ['pendingCount'] });
        queryClient.invalidateQueries({ queryKey: ['pdfImports'] });
      }
    });
  }, [isAuthenticated, tracked, results, untrack, queryClient, cancel]);

  return null;
}
