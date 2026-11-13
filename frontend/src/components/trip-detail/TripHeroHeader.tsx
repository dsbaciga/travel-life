import { useState, useEffect, useRef } from "react";
import { Link } from "react-router";
import type { Trip } from "../../types/trip";
import { TripStatus } from "../../types/trip";
import type { TripTag } from "../../types/tag";
import type { Checklist } from "../../types/checklist";
import { resolveTripCoverUrl } from "../../lib/tripCover";
import TripSeriesBadge from "../TripSeriesBadge";
import TripHeaderActions from "../TripHeaderActions";
import MarkdownRenderer from "../MarkdownRenderer";
import JetLagCalculator from "../JetLagCalculator";
import {
  formatTripDates,
  getTripDateStatus,
  formatTripDuration,
} from "../../utils/dateFormat";

function getStatusColor(status: string): string {
  switch (status) {
    case TripStatus.DREAM:
      return "bg-purple-100 text-purple-800";
    case TripStatus.PLANNING:
      return "bg-yellow-100 text-yellow-800";
    case TripStatus.PLANNED:
      return "bg-blue-100 text-blue-800";
    case TripStatus.IN_PROGRESS:
      return "bg-green-100 text-green-800";
    case TripStatus.COMPLETED:
      return "bg-gray-100 text-gray-800";
    case TripStatus.CANCELLED:
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

interface TripHeroHeaderProps {
  trip: Trip;
  tags: TripTag[];
  checklists: Checklist[];
  userTimezone: string;
  headerRef: React.RefObject<HTMLDivElement | null>;
  onManageTags: () => void;
  onShare: () => void;
  onDuplicate: () => void;
}

export default function TripHeroHeader({
  trip,
  tags,
  checklists,
  userTimezone,
  headerRef,
  onManageTags,
  onShare,
  onDuplicate,
}: TripHeroHeaderProps) {
  const [coverPhotoUrl, setCoverPhotoUrl] = useState<string | null>(null);
  const coverBlobUrlRef = useRef<string | null>(null);

  const coverPhoto = trip.coverPhoto;
  const coverImagePath = trip.coverImagePath;
  const coverImageThumbnailPath = trip.coverImageThumbnailPath;

  useEffect(() => {
    let cancelled = false;

    const loadCoverPhoto = async () => {
      const { url, blobUrl } = await resolveTripCoverUrl(
        { coverPhoto, coverImagePath, coverImageThumbnailPath },
        { preferThumbnail: false }
      );

      // A newer run has taken over; don't leak the blob it will never display
      if (cancelled) {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        return;
      }

      // Revoke the previous blob URL before swapping in the new source
      if (coverBlobUrlRef.current) {
        URL.revokeObjectURL(coverBlobUrlRef.current);
        coverBlobUrlRef.current = null;
      }

      coverBlobUrlRef.current = blobUrl;
      setCoverPhotoUrl(url);
    };

    loadCoverPhoto();

    // Cleanup blob URL when component unmounts or trip changes
    return () => {
      cancelled = true;
      if (coverBlobUrlRef.current) {
        URL.revokeObjectURL(coverBlobUrlRef.current);
        coverBlobUrlRef.current = null;
      }
    };
  }, [coverPhoto, coverImagePath, coverImageThumbnailPath]);

  const tagsCount = tags.length;

  return (
    <div
      ref={headerRef}
      className="bg-white dark:bg-navy-800 rounded-2xl shadow-lg border border-primary-100 dark:border-gold/20 mb-6"
    >
      {/* Cover Photo Background */}
      {coverPhotoUrl ? (
        // Dynamic background image requires CSS variable - cannot be moved to static CSS
        <div
          className="relative min-h-[200px] sm:min-h-64 bg-cover bg-center cover-photo-bg"
          style={{
            "--cover-photo-url": `url(${coverPhotoUrl})`,
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/50 to-black/70"></div>
          <div className="relative h-full p-4 sm:p-6 flex flex-col justify-between text-white">
            <div className="flex flex-wrap justify-between items-start gap-4">
              <div className="min-w-0 flex-1 pr-4">
                <h1 className="trip-title-hero text-white drop-shadow-lg break-words">
                  {trip.title}
                </h1>
                <span
                  className={`inline-block mt-2 px-3 py-1 text-sm font-medium rounded ${getStatusColor(
                    trip.status
                  )}`}
                >
                  {trip.status}
                </span>
                {trip.tripType && (
                  <span className="inline-block mt-2 ml-2 px-3 py-1 text-sm font-medium rounded bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300">
                    {trip.tripTypeEmoji && (
                      <span className="mr-1">{trip.tripTypeEmoji}</span>
                    )}
                    {trip.tripType}
                  </span>
                )}
                {trip.series && (
                  <span className="inline-block mt-2 ml-2">
                    <TripSeriesBadge
                      seriesId={trip.series.id}
                      seriesName={trip.series.name}
                      seriesOrder={trip.seriesOrder}
                    />
                  </span>
                )}
              </div>
              <TripHeaderActions
                tripId={trip.id}
                tagsCount={tagsCount}
                onManageTags={onManageTags}
                onShare={onShare}
                onDuplicate={onDuplicate}
                variant="overlay"
              />
            </div>

            {/* Duplicate button - positioned in bottom right.
                Hidden on mobile: it lives in the overflow menu there, and
                the corner it pins to is the hardest to reach one-handed. */}
            <button
              onClick={onDuplicate}
              className="hidden sm:flex absolute bottom-4 right-4 p-3 min-w-[44px] min-h-[44px] items-center justify-center bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/40 rounded-lg transition-colors hover:shadow-lg"
              title="Duplicate Trip"
              aria-label="Duplicate Trip"
            >
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </button>

            <div>
              {trip.description && (
                <div className="text-white/90 mb-4 drop-shadow-md">
                  <MarkdownRenderer
                    content={trip.description}
                    className="prose-invert"
                  />
                </div>
              )}

              {/* Trip Dates - Natural Language Format */}
              <div className="text-sm mb-4">
                <div className="text-white font-medium drop-shadow-md">
                  {formatTripDates(trip.startDate, trip.endDate)}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-white/80">
                  {formatTripDuration(trip.startDate, trip.endDate) && (
                    <span>{formatTripDuration(trip.startDate, trip.endDate)}</span>
                  )}
                  {getTripDateStatus(trip.startDate, trip.endDate) && (
                    <>
                      {formatTripDuration(trip.startDate, trip.endDate) && (
                        <span>·</span>
                      )}
                      <span
                        className={`${
                          getTripDateStatus(trip.startDate, trip.endDate)?.includes(
                            "progress"
                          ) ||
                          getTripDateStatus(trip.startDate, trip.endDate)?.includes(
                            "today"
                          )
                            ? "text-green-300 font-medium"
                            : ""
                        }`}
                      >
                        {getTripDateStatus(trip.startDate, trip.endDate)}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Tags */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 max-w-full">
                  {tags.map((tag) => (
                    // Dynamic tag colors require CSS variables - cannot be moved to static CSS
                    <span
                      key={tag.id}
                      className="px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium shadow-md tag-colored break-words"
                      style={{
                        "--tag-bg-color": tag.color || "#3B82F6",
                        "--tag-text-color": tag.textColor || "#FFFFFF",
                      }}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}

              {/* Checklists */}
              {checklists.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {checklists.map((checklist) => (
                    <Link
                      key={checklist.id}
                      to={`/checklists/${checklist.id}`}
                      className="px-3 py-1 bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/40 rounded-lg text-sm font-medium text-white shadow-md transition-all hover:shadow-lg"
                    >
                      📋 {checklist.name}
                      {checklist.stats && (
                        <span className="ml-2 opacity-80">
                          {checklist.stats.checked}/{checklist.stats.total}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              )}

              {/* Jet Lag Calculator */}
              {trip.timezone &&
                userTimezone &&
                trip.timezone !== userTimezone && (
                  <JetLagCalculator
                    homeTimezone={userTimezone}
                    tripTimezone={trip.timezone}
                    variant="overlay"
                    className="mt-3"
                  />
                )}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-6 relative bg-gradient-to-br from-primary-50/50 to-parchment dark:from-navy-800 dark:to-navy-900 rounded-2xl">
          <div className="flex flex-wrap justify-between items-start gap-4 mb-4">
            <div className="min-w-0 flex-1 pr-4">
              <h1 className="trip-title-hero text-charcoal dark:text-warm-gray break-words">
                {trip.title}
              </h1>
              <span
                className={`inline-block mt-2 px-3 py-1 text-sm font-medium rounded ${getStatusColor(
                  trip.status
                )}`}
              >
                {trip.status}
              </span>
              {trip.tripType && (
                <span className="inline-block mt-2 ml-2 px-3 py-1 text-sm font-medium rounded bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300">
                  {trip.tripTypeEmoji && (
                    <span className="mr-1">{trip.tripTypeEmoji}</span>
                  )}
                  {trip.tripType}
                </span>
              )}
            </div>
            <TripHeaderActions
              tripId={trip.id}
              tagsCount={tagsCount}
              onManageTags={onManageTags}
              onShare={onShare}
              onDuplicate={onDuplicate}
            />
          </div>

          {/* Duplicate button - positioned in bottom right.
              Hidden on mobile: it lives in the overflow menu there, and
              the corner it pins to is the hardest to reach one-handed. */}
          <button
            onClick={onDuplicate}
            className="hidden sm:flex absolute bottom-4 right-4 p-3 min-w-[44px] min-h-[44px] items-center justify-center bg-gray-100 hover:bg-gray-200 dark:bg-dusk-700 dark:hover:bg-dusk-600 border border-gray-300 dark:border-dusk-600 rounded-lg transition-colors hover:shadow-lg"
            title="Duplicate Trip"
            aria-label="Duplicate Trip"
          >
            <svg
              className="w-5 h-5 text-gray-700 dark:text-dusk-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </button>

          {trip.description && (
            <div className="text-gray-700 dark:text-dusk-300 mb-4">
              <MarkdownRenderer content={trip.description} />
            </div>
          )}

          {/* Trip Dates - Natural Language Format */}
          <div className="text-sm">
            <div className="text-gray-900 dark:text-white font-medium">
              {formatTripDates(trip.startDate, trip.endDate)}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-600 dark:text-dusk-400">
              {formatTripDuration(trip.startDate, trip.endDate) && (
                <span>{formatTripDuration(trip.startDate, trip.endDate)}</span>
              )}
              {getTripDateStatus(trip.startDate, trip.endDate) && (
                <>
                  {formatTripDuration(trip.startDate, trip.endDate) && (
                    <span>·</span>
                  )}
                  <span
                    className={`${
                      getTripDateStatus(trip.startDate, trip.endDate)?.includes(
                        "progress"
                      ) ||
                      getTripDateStatus(trip.startDate, trip.endDate)?.includes(
                        "today"
                      )
                        ? "text-green-600 dark:text-green-400 font-medium"
                        : ""
                    }`}
                  >
                    {getTripDateStatus(trip.startDate, trip.endDate)}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="mt-4">
              <div className="flex flex-wrap gap-2 max-w-full">
                {tags.map((tag) => (
                  // Dynamic tag colors require CSS variables - cannot be moved to static CSS
                  <span
                    key={tag.id}
                    className="px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium tag-colored break-words"
                    style={{
                      "--tag-bg-color": tag.color || "#3B82F6",
                      "--tag-text-color": tag.textColor || "#FFFFFF",
                    }}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Checklists */}
          {checklists.length > 0 && (
            <div className="mt-4">
              <div className="flex flex-wrap gap-2">
                {checklists.map((checklist) => (
                  <Link
                    key={checklist.id}
                    to={`/checklists/${checklist.id}`}
                    className="px-3 py-1 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg text-sm font-medium text-blue-700 dark:text-blue-300 transition-colors"
                  >
                    📋 {checklist.name}
                    {checklist.stats && (
                      <span className="ml-2 opacity-70">
                        {checklist.stats.checked}/{checklist.stats.total}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Jet Lag Calculator */}
          {trip.timezone &&
            userTimezone &&
            trip.timezone !== userTimezone && (
              <JetLagCalculator
                homeTimezone={userTimezone}
                tripTimezone={trip.timezone}
                className="mt-4"
              />
            )}
        </div>
      )}
    </div>
  );
}
