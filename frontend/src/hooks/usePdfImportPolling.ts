import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import pdfImportService from '../services/pdfImport.service';
import {
  PDF_IMPORT_GIVE_UP_MS,
  isPdfImportFinished,
  pdfImportPollDelayMs,
} from '../utils/pdfImportPolling';

/**
 * Polls one import until it reaches a terminal status. Gives up after
 * PDF_IMPORT_GIVE_UP_MS (longer than the backend's LLM timeout) so a crashed
 * background job can't poll forever.
 */
export function usePdfImportPolling(importId: number | null) {
  const startedAtRef = useRef(Date.now());
  const [timedOut, setTimedOut] = useState(false);

  // Restart the clock whenever we start polling a new import
  useEffect(() => {
    startedAtRef.current = Date.now();
    setTimedOut(false);
  }, [importId]);

  const query = useQuery({
    queryKey: ['pdfImport', importId],
    queryFn: () => pdfImportService.getPdfImportById(importId!),
    enabled: importId !== null && !timedOut,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (isPdfImportFinished(data?.status)) return false;
      // Waiting in the server's queue behind other PDFs is not a stall: the
      // give-up clock only starts once this one is actually being read.
      if (data?.status === 'UPLOADED' && (data.queuePosition ?? 0) > 0) {
        startedAtRef.current = Date.now();
      }
      const elapsed = Date.now() - startedAtRef.current;
      if (elapsed >= PDF_IMPORT_GIVE_UP_MS) {
        setTimedOut(true);
        return false;
      }
      return pdfImportPollDelayMs(elapsed);
    },
    refetchIntervalInBackground: false,
  });

  return { ...query, timedOut };
}
