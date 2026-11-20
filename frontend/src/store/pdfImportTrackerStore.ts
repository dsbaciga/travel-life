import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** A PDF upload whose parsing is still running on the server. */
export interface TrackedPdfImport {
  id: number;
  /** Original filename, shown in the banner when parsing finishes. */
  name: string;
  /** Epoch ms when the upload finished; drives the polling backoff and give-up. */
  startedAt: number;
}

interface PdfImportTrackerState {
  tracked: TrackedPdfImport[];
  track: (id: number, name: string) => void;
  untrack: (id: number) => void;
  clear: () => void;
}

/**
 * Uploads waiting on the LLM. `PdfImportWatcher` polls each one and pops a
 * banner when it finishes, so the user can keep working instead of watching a
 * spinner. Persisted so a reload mid-parse still gets its banner.
 */
export const usePdfImportTrackerStore = create<PdfImportTrackerState>()(
  persist(
    (set) => ({
      tracked: [],
      track: (id, name) =>
        set((state) =>
          state.tracked.some((item) => item.id === id)
            ? state
            : { tracked: [...state.tracked, { id, name, startedAt: Date.now() }] }
        ),
      untrack: (id) =>
        set((state) => ({ tracked: state.tracked.filter((item) => item.id !== id) })),
      clear: () => set({ tracked: [] }),
    }),
    {
      name: 'pdf-import-tracker',
      // Persisted-shape version. Bump this when the persisted fields change
      // and branch on `version` in migrate() to convert older payloads.
      version: 1,
      migrate: (persistedState) => persistedState as PdfImportTrackerState,
    }
  )
);
