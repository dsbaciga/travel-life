import { useEffect, useRef, useState } from "react";
import immichService from "../services/immich.service";
import type {
  ImmichBulkPreview,
  ImmichBulkSummary,
  ImmichFilters,
} from "../types/immich";

interface ImmichBulkImportDialogProps {
  tripId: number;
  /** The filters the browser is showing; everything matching them is linked. */
  filters: ImmichFilters;
  /** Called once when the import ends (finished or stopped), with what happened. */
  onFinished: (summary: ImmichBulkSummary) => void;
  onClose: () => void;
}

type Phase = "counting" | "confirm" | "running" | "done" | "error";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

function plural(count: number, noun: string): string {
  return `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Links everything an Immich filter matches to a trip: counts first, asks the
 * user to confirm the number, then links page by page so progress is real.
 * The server re-reads Immich for every page and skips assets the trip already
 * has, so running it again never creates duplicates.
 */
export default function ImmichBulkImportDialog({
  tripId,
  filters,
  onFinished,
  onClose,
}: ImmichBulkImportDialogProps) {
  const [phase, setPhase] = useState<Phase>("counting");
  const [preview, setPreview] = useState<ImmichBulkPreview | null>(null);
  const [pagesDone, setPagesDone] = useState(0);
  const [summary, setSummary] = useState<ImmichBulkSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set synchronously on the first click so a second click (or Enter) before
  // React re-renders cannot start a second run.
  const startedRef = useRef(false);
  const stopRef = useRef(false);
  const filtersRef = useRef(filters);

  useEffect(() => {
    let cancelled = false;
    immichService
      .previewBulkLink(tripId, filtersRef.current)
      .then((result) => {
        if (cancelled) return;
        setPreview(result);
        setPhase("confirm");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(errorMessage(err));
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  const handleStart = async () => {
    if (startedRef.current || !preview) return;
    startedRef.current = true;
    setPhase("running");

    const result: ImmichBulkSummary = {
      linked: 0,
      alreadyLinked: 0,
      failed: 0,
      errors: [],
      stopped: false,
    };
    let page: number | null = 1;
    let done = 0;
    try {
      while (page !== null) {
        if (stopRef.current) {
          result.stopped = true;
          break;
        }
        const pageResult = await immichService.linkBulkPage(
          tripId,
          filtersRef.current,
          page
        );
        result.linked += pageResult.linked;
        result.alreadyLinked += pageResult.alreadyLinked;
        result.failed += pageResult.failed;
        result.errors.push(...pageResult.errors);
        done += 1;
        setPagesDone(done);
        page = pageResult.nextPage;
      }
    } catch (err) {
      result.stopped = true;
      result.errors.push(`Stopped early: ${errorMessage(err)}`);
    }
    setSummary(result);
    setPhase("done");
    onFinished(result);
  };

  const progress =
    preview && preview.pages > 0
      ? Math.min(100, Math.round((pagesDone / preview.pages) * 100))
      : 0;
  const running = phase === "running";

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[95] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="immich-bulk-title"
    >
      <div className="bg-white dark:bg-dusk-800 rounded-lg shadow-xl w-full max-w-md p-6">
        <h3
          id="immich-bulk-title"
          className="text-lg font-bold text-gray-900 dark:text-white mb-3"
        >
          Link all matching photos
        </h3>

        {phase === "counting" && (
          <p className="text-gray-600 dark:text-dusk-400">
            Counting matching photos in Immich
          </p>
        )}

        {phase === "error" && (
          <p role="alert" className="text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        {phase === "confirm" && preview && (
          <div className="space-y-2 text-sm text-gray-700 dark:text-dusk-300">
            {preview.toLink === 0 ? (
              <p>
                {preview.matching === 0
                  ? "No photos match the current filters."
                  : `All ${plural(preview.matching, "matching photo")} are already linked to this trip.`}
              </p>
            ) : (
              <>
                <p className="text-base text-gray-900 dark:text-white">
                  Link {plural(preview.toLink, "photo")} to this trip?
                </p>
                <p>
                  {plural(preview.matching, "photo")} match the current filters
                  {preview.alreadyLinked > 0 &&
                    `; ${preview.alreadyLinked.toLocaleString()} already linked will be skipped`}
                  .
                </p>
              </>
            )}
            {preview.capped && (
              <p className="text-amber-700 dark:text-amber-400">
                More than {preview.cap.toLocaleString()} photos match. Only the
                newest {preview.cap.toLocaleString()} will be linked; narrow the
                filters to import the rest.
              </p>
            )}
          </div>
        )}

        {running && (
          <div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              aria-label="Linking photos"
              className="h-2 w-full rounded bg-gray-200 dark:bg-dusk-700 overflow-hidden"
            >
              <div
                className="h-full bg-blue-600 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-gray-600 dark:text-dusk-400">
              Linking photos ({pagesDone} of {preview?.pages ?? 0} batches)
            </p>
          </div>
        )}

        {phase === "done" && summary && (
          <div className="space-y-2 text-sm text-gray-700 dark:text-dusk-300">
            <p className="text-base text-gray-900 dark:text-white">
              {summary.stopped ? "Import stopped" : "Import complete"}
            </p>
            <ul className="list-disc pl-5">
              <li>{plural(summary.linked, "photo")} linked</li>
              <li>{summary.alreadyLinked.toLocaleString()} already linked</li>
              <li>{summary.failed.toLocaleString()} failed</li>
            </ul>
            {summary.errors.length > 0 && (
              <p role="alert" className="text-red-600 dark:text-red-400">
                {summary.errors[0]}
                {summary.errors.length > 1 &&
                  ` (and ${summary.errors.length - 1} more)`}
              </p>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          {running ? (
            <button
              type="button"
              onClick={() => {
                stopRef.current = true;
              }}
              className="btn btn-secondary"
            >
              Stop after this batch
            </button>
          ) : phase === "done" || phase === "error" ? (
            <button type="button" onClick={onClose} className="btn btn-primary">
              Close
            </button>
          ) : (
            <>
              <button type="button" onClick={onClose} className="btn btn-secondary">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStart}
                disabled={phase !== "confirm" || !preview || preview.toLink === 0}
                className="btn btn-primary"
              >
                {preview && preview.toLink > 0
                  ? `Link ${preview.toLink.toLocaleString()} photos`
                  : "Link"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
