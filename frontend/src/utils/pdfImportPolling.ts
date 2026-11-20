import type { PdfImportStatus } from '../types/pdfImport';

export const PDF_IMPORT_TERMINAL_STATUSES: readonly PdfImportStatus[] = [
  'PARSED',
  'PARSE_FAILED',
  'NO_ENTITIES',
];

export function isPdfImportFinished(status: PdfImportStatus | undefined): boolean {
  return status !== undefined && PDF_IMPORT_TERMINAL_STATUSES.includes(status);
}

/**
 * How long to keep polling before assuming the job died. The backend gives
 * the LLM up to 5 minutes (LLM_TIMEOUT_MS) and only resets a stuck import
 * after 10, so stop a little after that.
 */
export const PDF_IMPORT_GIVE_UP_MS = 12 * 60 * 1000;

/**
 * Upper bound on watching one import overall, including time spent waiting in
 * the server's queue behind other users' PDFs (where the give-up clock above
 * has not started yet).
 */
export const PDF_IMPORT_MAX_WATCH_MS = 60 * 60 * 1000;

const FAST_PHASE_MS = 20 * 1000;
const FAST_INTERVAL_MS = 2000;
const SLOW_INTERVAL_MS = 5000;

/** Poll quickly at first (cloud models answer in seconds), then back off. */
export function pdfImportPollDelayMs(elapsedMs: number): number {
  return elapsedMs < FAST_PHASE_MS ? FAST_INTERVAL_MS : SLOW_INTERVAL_MS;
}
