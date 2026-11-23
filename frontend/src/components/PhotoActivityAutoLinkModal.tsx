import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Modal from "./Modal";
import EmptyState from "./EmptyState";
import SkeletonLoader from "./SkeletonLoader";
import entityLinkService from "../services/entityLink.service";
import { useImmichThumbnailCache } from "../hooks/useImmichThumbnail";
import { useInvalidateEntityLinks } from "../hooks/useInvalidateEntityLinks";
import { useSubmitLock } from "../hooks/useSubmitLock";
import { useTimezoneResolver } from "../hooks/useTimezoneResolver";
import {
  formatDateInTimezone,
  formatDateTimeInTimezone,
  formatTimeInTimezone,
} from "../utils/timezone";
import type {
  PhotoActivitySuggestion,
  PhotoActivitySuggestionsResponse,
  PhotoMatchKind,
} from "../types/photoAutoLink";

interface PhotoActivityAutoLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  tripId: number;
  tripTimezone?: string | null;
  /** Called after links were created, so the caller can refresh what it shows. */
  onLinked?: () => void;
}

/** Wording for each way a photo can match, in the order they are listed. */
const MATCH_LABELS: Array<{ kind: PhotoMatchKind; label: string }> = [
  { kind: "during", label: "during" },
  { kind: "same_day", label: "same day" },
];

const pluralPhotos = (count: number) => `${count} photo${count === 1 ? "" : "s"}`;

/** "Jun 10, 9:00 AM – 11:00 AM", or just the date for an all-day activity. */
function describeActivityTime(
  activity: PhotoActivitySuggestion["activity"],
  timezone: string
): string {
  if (!activity.startTime) return "";
  if (activity.allDay) {
    const start = formatDateInTimezone(activity.startTime, timezone);
    const end = activity.endTime ? formatDateInTimezone(activity.endTime, timezone) : start;
    return end === start ? `${start} · all day` : `${start} – ${end} · all day`;
  }
  const start = formatDateTimeInTimezone(activity.startTime, timezone, null, {
    includeTimezone: false,
  });
  if (!activity.endTime) return start;
  return `${start} – ${formatTimeInTimezone(activity.endTime, timezone, null, false)}`;
}

/** "9:12 AM – 10:48 AM", on the same clock the activity is shown in. */
function describePhotoTimes(suggestion: PhotoActivitySuggestion, timezone: string): string {
  const first = formatTimeInTimezone(suggestion.firstTakenAt, timezone, null, false);
  const last = formatTimeInTimezone(suggestion.lastTakenAt, timezone, null, false);
  return first === last ? first : `${first} – ${last}`;
}

/** The reasons photos were left out, so an empty or short list explains itself. */
function describeSkipped(summary: PhotoActivitySuggestionsResponse["summary"]): string[] {
  const notes: string[] = [];
  if (summary.alreadyLinkedPhotos > 0) {
    notes.push(`${pluralPhotos(summary.alreadyLinkedPhotos)} already linked to an activity`);
  }
  if (summary.unmatchedPhotos > 0) {
    notes.push(`${pluralPhotos(summary.unmatchedPhotos)} not taken around any activity`);
  }
  if (summary.photosWithoutTime > 0) {
    notes.push(`${pluralPhotos(summary.photosWithoutTime)} with no capture time`);
  }
  if (summary.activitiesWithoutTime > 0) {
    notes.push(
      `${summary.activitiesWithoutTime} ${
        summary.activitiesWithoutTime === 1 ? "activity" : "activities"
      } with no start time`
    );
  }
  return notes;
}

/**
 * Review dialog for auto-linking photos to activities by when they were taken.
 *
 * Opening it asks the server which activity each unlinked photo fits; every
 * suggestion starts ticked and nothing is linked until the user confirms.
 */
export default function PhotoActivityAutoLinkModal({
  isOpen,
  onClose,
  tripId,
  tripTimezone,
  onLinked,
}: PhotoActivityAutoLinkModalProps) {
  const resolveTz = useTimezoneResolver();
  const invalidateEntityLinks = useInvalidateEntityLinks();
  const { isSubmitting, run } = useSubmitLock();
  const { loadThumbnails, getThumbnailUrl } = useImmichThumbnailCache();
  // Activities the user unticked. Tracking exclusions keeps "everything ticked"
  // as the default without syncing state to the query result.
  const [excludedActivityIds, setExcludedActivityIds] = useState<Set<number>>(new Set());

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["photoActivitySuggestions", tripId],
    queryFn: () => entityLinkService.getPhotoActivitySuggestions(tripId),
    enabled: isOpen,
    // Photos and activities change elsewhere; always match against the current trip.
    staleTime: 0,
    gcTime: 0,
  });

  const suggestions = useMemo(() => data?.suggestions ?? [], [data]);

  useEffect(() => {
    if (isOpen) setExcludedActivityIds(new Set());
  }, [isOpen]);

  useEffect(() => {
    if (suggestions.length > 0) {
      void loadThumbnails(suggestions.flatMap((s) => s.previewPhotos));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions]);

  const selected = suggestions.filter((s) => !excludedActivityIds.has(s.activity.id));
  const selectedPhotoCount = selected.reduce((sum, s) => sum + s.photoIds.length, 0);
  const allSelected = selected.length === suggestions.length;
  const skippedNotes = data ? describeSkipped(data.summary) : [];

  const toggleActivity = (activityId: number) =>
    setExcludedActivityIds((prev) => {
      const next = new Set(prev);
      if (next.has(activityId)) next.delete(activityId);
      else next.add(activityId);
      return next;
    });

  const toggleAll = () =>
    setExcludedActivityIds(
      allSelected ? new Set(suggestions.map((s) => s.activity.id)) : new Set()
    );

  const handleApply = () =>
    run(async () => {
      try {
        const result = await entityLinkService.applyPhotoActivityLinks(tripId, {
          links: selected.map((s) => ({ activityId: s.activity.id, photoIds: s.photoIds })),
        });
        toast.success(
          result.created > 0
            ? `Linked ${pluralPhotos(result.created)} to ${selected.length} ${
                selected.length === 1 ? "activity" : "activities"
              }`
            : "Those photos were already linked"
        );
        invalidateEntityLinks(tripId);
        onLinked?.();
        onClose();
      } catch {
        toast.error("Failed to link photos");
      }
    });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Link photos to activities"
      icon="link"
      maxWidth="2xl"
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={isSubmitting || selectedPhotoCount === 0}
            className="btn btn-primary"
          >
            {isSubmitting
              ? "Linking..."
              : selectedPhotoCount > 0
              ? `Link ${pluralPhotos(selectedPhotoCount)}`
              : "Link photos"}
          </button>
        </div>
      }
    >
      {isLoading ? (
        <SkeletonLoader variant="list" count={3} />
      ) : isError ? (
        <EmptyState
          icon="alert"
          message="Could not match photos to activities"
          actionLabel="Try again"
          onAction={() => void refetch()}
        />
      ) : suggestions.length === 0 ? (
        <EmptyState
          icon="link"
          message="No photos to link"
          subMessage={
            skippedNotes.length > 0
              ? `${skippedNotes.join(" · ")}.`
              : "Photos are matched to activities by the time they were taken."
          }
        />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate dark:text-warm-gray/80">
            A photo is matched only to an activity it was taken during. Activities
            with no end time are assumed to last 2 hours. Untick anything that looks
            wrong.
          </p>

          <label className="flex items-center gap-3 min-h-[44px] text-sm font-medium text-charcoal dark:text-warm-gray cursor-pointer">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="w-5 h-5 rounded border-primary-300 dark:border-gold/40 text-primary-600 dark:text-gold focus:ring-primary-500 dark:focus:ring-gold"
            />
            Select all ({suggestions.length})
          </label>

          <ul className="space-y-2">
            {suggestions.map((suggestion) => {
              const { activity } = suggestion;
              const timezone = resolveTz(activity.timezone, tripTimezone);
              const checked = !excludedActivityIds.has(activity.id);
              const matchSummary = MATCH_LABELS.filter(
                ({ kind }) => suggestion.matchCounts[kind] > 0
              )
                .map(({ kind, label }) => `${suggestion.matchCounts[kind]} ${label}`)
                .join(" · ");
              const hiddenCount = suggestion.photoIds.length - suggestion.previewPhotos.length;

              return (
                <li
                  key={activity.id}
                  className={`rounded-lg border p-3 transition-colors ${
                    checked
                      ? "bg-primary-50 dark:bg-navy-700/60 border-primary-200 dark:border-gold/30"
                      : "bg-white dark:bg-navy-800 border-primary-100 dark:border-gold/15 opacity-70"
                  }`}
                >
                  <label className="flex items-start gap-3 cursor-pointer min-h-[44px]">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleActivity(activity.id)}
                      aria-label={`Link ${pluralPhotos(suggestion.photoIds.length)} to ${activity.name}`}
                      className="mt-1 w-5 h-5 flex-shrink-0 rounded border-primary-300 dark:border-gold/40 text-primary-600 dark:text-gold focus:ring-primary-500 dark:focus:ring-gold"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium text-charcoal dark:text-warm-gray break-words">
                        {activity.name}
                      </span>
                      <span className="block text-xs text-slate dark:text-warm-gray/70">
                        {describeActivityTime(activity, timezone)}
                      </span>
                      <span className="block text-xs text-slate dark:text-warm-gray/70 mt-1">
                        {pluralPhotos(suggestion.photoIds.length)} taken{" "}
                        {describePhotoTimes(suggestion, timezone)}
                        {matchSummary && ` (${matchSummary})`}
                      </span>
                    </span>
                  </label>

                  <div className="mt-2 ml-8 flex flex-wrap items-center gap-1">
                    {suggestion.previewPhotos.map((photo) => {
                      const url = getThumbnailUrl(photo.id);
                      return (
                        <div
                          key={photo.id}
                          title={photo.caption ?? undefined}
                          className="w-12 h-12 rounded overflow-hidden bg-primary-100 dark:bg-navy-700"
                        >
                          {url && (
                            <img
                              src={url}
                              alt={photo.caption ?? ""}
                              loading="lazy"
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                      );
                    })}
                    {hiddenCount > 0 && (
                      <span className="text-xs text-slate dark:text-warm-gray/60 ml-1">
                        +{hiddenCount} more
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {skippedNotes.length > 0 && (
            <p className="text-xs text-slate dark:text-warm-gray/60">
              Left out: {skippedNotes.join(" · ")}.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
