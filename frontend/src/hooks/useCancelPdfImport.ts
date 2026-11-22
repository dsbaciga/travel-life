import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import pdfImportService from '../services/pdfImport.service';
import { getApiErrorMessage } from '../lib/errors';
import {
  usePdfImportTrackerStore,
  type TrackedPdfImport,
} from '../store/pdfImportTrackerStore';

/**
 * Stops a PDF that is waiting or being read. Deleting the import takes it out
 * of the server's queue, aborting the LLM request if it is being read so the
 * next PDF in line can start. Resolves to whether the cancel went through.
 *
 * Used by the "Reading…" banner and the Inbox's "Reading PDFs" list.
 */
export function useCancelPdfImport() {
  const untrack = usePdfImportTrackerStore((state) => state.untrack);
  const queryClient = useQueryClient();

  return useCallback(
    async (item: TrackedPdfImport): Promise<boolean> => {
      try {
        await pdfImportService.deletePdfImport(item.id);
        untrack(item.id);
        queryClient.removeQueries({ queryKey: ['pdfImport', item.id] });
        toast.dismiss(`pdf-import-${item.id}`);
        toast.success(`Stopped reading ${item.name}`);
        return true;
      } catch (err) {
        toast.error(getApiErrorMessage(err, `Couldn't cancel ${item.name}`));
        return false;
      }
    },
    [untrack, queryClient]
  );
}
