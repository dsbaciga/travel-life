import { useCallback, useEffect, useMemo, useState } from 'react';
import AppTileLayer from '../components/AppTileLayer';
import { useParams } from 'react-router';
import { MapContainer, Marker, Popup } from 'react-leaflet';
import { LatLngBounds } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '../utils/mapUtils';
import shareService from '../services/share.service';
import type {
  PublicTrip,
  PublicActivity,
  PublicTransportation,
  PublicLodging,
  PublicPhoto,
} from '../services/share.service';
import MarkdownRenderer from '../components/MarkdownRenderer';
import { getFullAssetUrl } from '../lib/config';
import {
  dayKeyInTimezone,
  formatDateOnly,
  resolveTimezone,
} from '../utils/timezone';

// ---------------------------------------------------------------------------
// Date helpers.
//
// Times are shown in the zone the event actually happens in — its own, else
// the trip's — so a 7pm dinner in Tokyo reads as 7pm to every viewer. Only
// when nothing on the trip names a zone does this fall back to the viewer's
// own, which for a signed-out visitor is their browser's.
// ---------------------------------------------------------------------------

const formatDayLabel = (dateStr: string | null): string | null =>
  formatDateOnly(dateStr, {
    weekday: 'short',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

const formatTime = (
  iso: string | null,
  timezone: string | null | undefined
): string | null => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: resolveTimezone(timezone),
  });
};

// ---------------------------------------------------------------------------
// Day-by-day itinerary model
// ---------------------------------------------------------------------------

type ItineraryEvent = { timezone: string | null } & (
  | { kind: 'activity'; time: string | null; activity: PublicActivity }
  | { kind: 'transportation'; time: string | null; transport: PublicTransportation }
  | { kind: 'lodging-checkin'; time: string | null; lodging: PublicLodging }
  | { kind: 'lodging-checkout'; time: string | null; lodging: PublicLodging }
);

interface ItineraryDay {
  key: string;
  label: string;
  events: ItineraryEvent[];
}

const UNSCHEDULED_KEY = 'unscheduled';

function buildItinerary(trip: PublicTrip): ItineraryDay[] {
  const byDay = new Map<string, ItineraryEvent[]>();

  const push = (dayKey: string | null, event: ItineraryEvent) => {
    const key = dayKey ?? UNSCHEDULED_KEY;
    const list = byDay.get(key) ?? [];
    list.push(event);
    byDay.set(key, list);
  };

  for (const activity of trip.activities) {
    const timezone = resolveTimezone(activity.timezone, trip.timezone);
    push(dayKeyInTimezone(activity.startTime, timezone), {
      kind: 'activity',
      time: activity.startTime,
      activity,
      timezone,
    });
  }
  for (const transport of trip.transportation) {
    const timezone = resolveTimezone(transport.startTimezone, trip.timezone);
    push(dayKeyInTimezone(transport.scheduledStart, timezone), {
      kind: 'transportation',
      time: transport.scheduledStart,
      transport,
      timezone,
    });
  }
  for (const lodging of trip.lodging) {
    const timezone = resolveTimezone(lodging.timezone, trip.timezone);
    push(dayKeyInTimezone(lodging.checkInDate, timezone), {
      kind: 'lodging-checkin',
      time: lodging.checkInDate,
      lodging,
      timezone,
    });
    push(dayKeyInTimezone(lodging.checkOutDate, timezone), {
      kind: 'lodging-checkout',
      time: lodging.checkOutDate,
      lodging,
      timezone,
    });
  }

  const sortedKeys = [...byDay.keys()].sort((a, b) => {
    if (a === UNSCHEDULED_KEY) return 1;
    if (b === UNSCHEDULED_KEY) return -1;
    return a.localeCompare(b);
  });

  return sortedKeys.map((key) => {
    const events = (byDay.get(key) ?? []).sort((a, b) => {
      if (a.time === b.time) return 0;
      if (a.time === null) return 1;
      if (b.time === null) return -1;
      return a.time.localeCompare(b.time);
    });
    return {
      key,
      label: key === UNSCHEDULED_KEY ? 'Unscheduled' : (formatDayLabel(key) ?? key),
      events,
    };
  });
}

// ---------------------------------------------------------------------------
// Presentational bits
// ---------------------------------------------------------------------------

const EVENT_ICONS: Record<ItineraryEvent['kind'], string> = {
  activity: '🎟️',
  transportation: '🧭',
  'lodging-checkin': '🛎️',
  'lodging-checkout': '🧳',
};

function EventCard({ event }: { event: ItineraryEvent }) {
  const time = formatTime(event.time, event.timezone);

  let title = '';
  let subtitle: string | null = null;
  let notes: string | null = null;

  switch (event.kind) {
    case 'activity':
      title = event.activity.name;
      subtitle = [event.activity.category, event.activity.locationName]
        .filter(Boolean)
        .join(' · ') || null;
      notes = event.activity.notes;
      break;
    case 'transportation': {
      const route = [event.transport.from, event.transport.to].filter(Boolean).join(' → ');
      title = event.transport.type;
      subtitle = route || null;
      break;
    }
    case 'lodging-checkin':
      title = `Check in — ${event.lodging.name}`;
      subtitle = event.lodging.type;
      break;
    case 'lodging-checkout':
      title = `Check out — ${event.lodging.name}`;
      subtitle = event.lodging.type;
      break;
  }

  return (
    <div className="flex gap-3 p-3 rounded-xl bg-white dark:bg-dusk-800 border border-gray-200 dark:border-dusk-700 shadow-sm">
      <div className="text-xl leading-none pt-0.5" aria-hidden="true">
        {EVENT_ICONS[event.kind]}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          {time && (
            <span className="text-sm font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
              {time}
            </span>
          )}
          {event.kind === 'activity' && event.activity.allDay && (
            <span className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
              All day
            </span>
          )}
          <span className="font-medium text-gray-900 dark:text-dusk-100 break-words">{title}</span>
        </div>
        {subtitle && (
          <p className="text-sm text-gray-600 dark:text-dusk-400 mt-0.5 break-words">{subtitle}</p>
        )}
        {notes && (
          <p className="text-sm text-gray-600 dark:text-dusk-400 mt-1 whitespace-pre-wrap break-words">
            {notes}
          </p>
        )}
      </div>
    </div>
  );
}

function TripMap({ trip }: { trip: PublicTrip }) {
  const points = trip.locations.filter(
    (location) =>
      location.latitude !== null &&
      location.longitude !== null &&
      !location.excludeFromMap
  );

  const bounds = useMemo(() => {
    if (points.length === 0) return null;
    return new LatLngBounds(
      points.map((p) => [p.latitude as number, p.longitude as number] as [number, number])
    ).pad(0.2);
  }, [points]);

  if (points.length === 0 || !bounds) return null;

  return (
    <section aria-label="Trip map" className="rounded-2xl overflow-hidden border border-gray-200 dark:border-dusk-700 shadow-sm">
      <div className="h-[280px] sm:h-[360px] relative z-0">
        <MapContainer
          bounds={bounds}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%' }}
          className="z-0"
        >
          <AppTileLayer />
          {points.map((location) => (
            <Marker
              key={location.id}
              position={[location.latitude as number, location.longitude as number]}
            >
              <Popup>
                <div className="text-sm">
                  <strong>{location.name}</strong>
                  {location.category && (
                    <div className="text-xs text-gray-500">{location.category}</div>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </section>
  );
}

function PhotoGrid({ photos }: { photos: PublicPhoto[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const close = useCallback(() => setLightboxIndex(null), []);
  const step = useCallback(
    (delta: number) => {
      setLightboxIndex((current) => {
        if (current === null) return current;
        return (current + delta + photos.length) % photos.length;
      });
    },
    [photos.length]
  );

  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxIndex, close, step]);

  if (photos.length === 0) return null;

  const selected = lightboxIndex !== null ? photos[lightboxIndex] : null;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
        {photos.map((photo, index) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => setLightboxIndex(index)}
            className="group relative aspect-square overflow-hidden rounded-xl bg-gray-100 dark:bg-dusk-800 border border-gray-200 dark:border-dusk-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
            aria-label={photo.caption || 'View photo'}
          >
            <img
              src={getFullAssetUrl(photo.thumbnailUrl) ?? undefined}
              alt={photo.caption || ''}
              loading="lazy"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          </button>
        ))}
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={close}
        >
          <button
            type="button"
            onClick={close}
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white text-2xl leading-none"
            aria-label="Close"
          >
            ✕
          </button>
          {photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  step(-1);
                }}
                className="absolute left-2 sm:left-6 p-3 text-white/80 hover:text-white text-3xl leading-none"
                aria-label="Previous photo"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  step(1);
                }}
                className="absolute right-2 sm:right-6 p-3 text-white/80 hover:text-white text-3xl leading-none"
                aria-label="Next photo"
              >
                ›
              </button>
            </>
          )}
          <figure
            className="max-w-full max-h-full flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={getFullAssetUrl(selected.url) ?? undefined}
              alt={selected.caption || ''}
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
            />
            {selected.caption && (
              <figcaption className="text-sm text-white/90 text-center max-w-2xl">
                {selected.caption}
              </figcaption>
            )}
          </figure>
        </div>
      )}
    </>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xl font-semibold text-gray-900 dark:text-dusk-100 mb-4">{children}</h2>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PublicTripPage() {
  const { token } = useParams<{ token: string }>();
  const [trip, setTrip] = useState<PublicTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!token) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const data = await shareService.getPublicTrip(token);
        if (!cancelled) setTrip(data);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (trip) document.title = `${trip.title} — Travel Life`;
    return () => {
      document.title = 'Travel Life';
    };
  }, [trip]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dusk-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-dusk-300">Loading trip…</p>
        </div>
      </div>
    );
  }

  if (notFound || !trip) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dusk-900 px-4">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4" aria-hidden="true">
            🔗
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-dusk-100 mb-2">
            Trip not available
          </h1>
          <p className="text-gray-600 dark:text-dusk-400">
            This link is invalid or sharing was disabled.
          </p>
        </div>
      </div>
    );
  }

  const itinerary = buildItinerary(trip);
  const startDate = formatDateOnly(trip.startDate);
  const endDate = formatDateOnly(trip.endDate);
  const dateRange =
    startDate && endDate
      ? startDate === endDate
        ? startDate
        : `${startDate} – ${endDate}`
      : startDate ?? endDate;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dusk-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-10">
        {/* Header */}
        <header className="text-center space-y-3">
          {trip.tripTypeEmoji && (
            <div className="text-5xl" aria-hidden="true">
              {trip.tripTypeEmoji}
            </div>
          )}
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-dusk-100 break-words">
            {trip.title}
          </h1>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-gray-600 dark:text-dusk-400">
            {dateRange && <span>{dateRange}</span>}
            {trip.tripType && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
                {trip.tripType}
              </span>
            )}
          </div>
          {trip.description && (
            <div className="text-left max-w-2xl mx-auto pt-2">
              <MarkdownRenderer content={trip.description} compact />
            </div>
          )}
        </header>

        {/* Map */}
        <TripMap trip={trip} />

        {/* Places */}
        {trip.locations.length > 0 && (
          <section aria-label="Places">
            <SectionHeading>Places</SectionHeading>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {trip.locations.map((location) => (
                <li
                  key={location.id}
                  className="p-3 rounded-xl bg-white dark:bg-dusk-800 border border-gray-200 dark:border-dusk-700 shadow-sm"
                >
                  <div className="font-medium text-gray-900 dark:text-dusk-100 break-words">
                    {location.name}
                  </div>
                  {location.category && (
                    <div className="text-sm text-gray-600 dark:text-dusk-400">{location.category}</div>
                  )}
                  {location.notes && (
                    <p className="text-sm text-gray-600 dark:text-dusk-400 mt-1 whitespace-pre-wrap break-words">
                      {location.notes}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Day-by-day itinerary */}
        {itinerary.length > 0 && (
          <section aria-label="Itinerary">
            <SectionHeading>Itinerary</SectionHeading>
            <div className="space-y-6">
              {itinerary.map((day) => (
                <div key={day.key}>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-2">
                    {day.label}
                  </h3>
                  <div className="space-y-2">
                    {day.events.map((event, index) => (
                      <EventCard key={`${day.key}-${index}`} event={event} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Journal */}
        {trip.journalEntries.length > 0 && (
          <section aria-label="Journal">
            <SectionHeading>Journal</SectionHeading>
            <div className="space-y-4">
              {trip.journalEntries.map((entry) => (
                <article
                  key={entry.id}
                  className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-dusk-800 border border-gray-200 dark:border-dusk-700 shadow-sm"
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
                    {entry.title && (
                      <h3 className="font-semibold text-gray-900 dark:text-dusk-100 break-words">
                        {entry.title}
                      </h3>
                    )}
                    {entry.date && (
                      <span className="text-sm text-gray-500 dark:text-dusk-400">
                        {formatDateOnly(entry.date)}
                      </span>
                    )}
                    {entry.mood && (
                      <span className="text-sm text-gray-500 dark:text-dusk-400">{entry.mood}</span>
                    )}
                  </div>
                  <MarkdownRenderer content={entry.content} compact />
                </article>
              ))}
            </div>
          </section>
        )}

        {/* Photos */}
        {trip.photos.length > 0 && (
          <section aria-label="Photos">
            <SectionHeading>Photos</SectionHeading>
            <PhotoGrid photos={trip.photos} />
          </section>
        )}

        <footer className="pt-6 border-t border-gray-200 dark:border-dusk-700 text-center text-sm text-gray-500 dark:text-dusk-400">
          Shared with Travel Life
        </footer>
      </div>
    </div>
  );
}
