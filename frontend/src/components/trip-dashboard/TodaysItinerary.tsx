import { useEffect, useRef, useMemo } from 'react';
import type { Activity } from '../../types/activity';
import type { Transportation } from '../../types/transportation';
import type { Lodging } from '../../types/lodging';
import {
  getTodaysEvents,
  getCurrentTimePosition,
  getNextEvent,
  formatEventTime,
  formatEventDuration,
  calculateTimeSpan,
  getCurrentTimeInTimezone,
  getTodayInTimezone,
  type ItineraryEvent,
} from '../../utils/tripDashboardUtils';

/**
 * Props for the TodaysItinerary component
 */
interface TodaysItineraryProps {
  activities: Activity[];
  transportation: Transportation[];
  lodging: Lodging[];
  tripTimezone: string;
  weatherData?: { icon: string; temp: number } | null;
  onEventClick: (eventType: string, eventId: string) => void;
  /** Navigate to timeline for a specific date (YYYY-MM-DD format) */
  onNavigateToTimeline?: (date: string) => void;
}

/**
 * Icon components for each event type
 */
function ActivityIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
      />
    </svg>
  );
}

function TransportIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
      />
    </svg>
  );
}

function LodgingIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
      />
    </svg>
  );
}

function CheckIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function LocationPinIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function ClockIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

/**
 * Get the appropriate icon for an event type
 */
function getEventIcon(type: string, className?: string) {
  switch (type) {
    case 'activity':
      return <ActivityIcon className={className} />;
    case 'transportation':
      return <TransportIcon className={className} />;
    case 'lodging':
      return <LodgingIcon className={className} />;
    default:
      return <ActivityIcon className={className} />;
  }
}

/**
 * Get colors for an event type following the style guide
 */
function getEventColors(type: string, isCompleted: boolean, isNext: boolean) {
  const baseColors = {
    activity: {
      bg: 'bg-emerald-500',
      bgLight: 'bg-emerald-100 dark:bg-emerald-900/30',
      border: 'border-emerald-500',
      text: 'text-emerald-600 dark:text-emerald-400',
      ring: 'ring-emerald-500',
    },
    transportation: {
      bg: 'bg-amber-500',
      bgLight: 'bg-amber-100 dark:bg-amber-900/30',
      border: 'border-amber-500',
      text: 'text-amber-600 dark:text-amber-400',
      ring: 'ring-amber-500',
    },
    lodging: {
      bg: 'bg-rose-500',
      bgLight: 'bg-rose-100 dark:bg-rose-900/30',
      border: 'border-rose-500',
      text: 'text-rose-600 dark:text-rose-400',
      ring: 'ring-rose-500',
    },
  };

  const colors = baseColors[type as keyof typeof baseColors] || baseColors.activity;

  if (isCompleted) {
    return {
      ...colors,
      opacity: 'opacity-60',
      bgIcon: 'bg-gray-400 dark:bg-dusk-600',
    };
  }

  if (isNext) {
    return {
      ...colors,
      opacity: '',
      bgIcon: colors.bg,
      highlight: 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-navy-800 ' + colors.ring,
    };
  }

  return {
    ...colors,
    opacity: '',
    bgIcon: colors.bg,
  };
}

/**
 * Format today's date for the header
 */
function formatTodayHeader(timezone: string): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  return formatter.format(now);
}

/**
 * Individual event item in the timeline
 */
function EventItem({
  event,
  isNext,
  timezone,
  onClick,
}: {
  event: ItineraryEvent;
  isNext: boolean;
  timezone: string;
  onClick: () => void;
}) {
  const colors = getEventColors(event.type, event.isCompleted, isNext);
  const duration = formatEventDuration(event.startTime, event.endTime);

  return (
    <div
      className={`relative flex items-start gap-3 py-3 px-3 rounded-lg cursor-pointer transition-all duration-200
        ${colors.opacity}
        ${colors.bgLight}
        ${isNext && 'highlight' in colors ? colors.highlight : 'hover:bg-opacity-80'}
        group
      `}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {/* Event icon with completion indicator */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center
          ${event.isCompleted ? 'bg-gray-400 dark:bg-dusk-600' : colors.bgIcon}
          text-white shadow-sm
        `}
      >
        {event.isCompleted ? (
          <CheckIcon className="w-4 h-4" />
        ) : (
          getEventIcon(event.type, 'w-4 h-4')
        )}
      </div>

      {/* Event content */}
      <div className="flex-1 min-w-0">
        {/* Time */}
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-dusk-400">
          <span className={`font-medium ${event.isCompleted ? '' : colors.text}`}>
            {formatEventTime(event.startTime, timezone)}
          </span>
          {event.endTime && (
            <>
              <span>-</span>
              <span>{formatEventTime(event.endTime, timezone)}</span>
            </>
          )}
          {duration && (
            <span className="text-gray-400 dark:text-dusk-400">({duration})</span>
          )}
        </div>

        {/* Event name */}
        <h4
          className={`font-semibold text-sm mt-0.5 truncate
            ${event.isCompleted
              ? 'text-gray-500 dark:text-dusk-400 line-through'
              : 'text-gray-900 dark:text-white'
            }
          `}
        >
          {event.name}
        </h4>

        {/* Subtitle */}
        {event.subtitle && (
          <p className="text-xs text-gray-500 dark:text-dusk-400 truncate mt-0.5">
            {event.subtitle}
          </p>
        )}

        {/* Location */}
        {event.location && (
          <div className="flex items-center gap-1 mt-1 text-xs text-gray-500 dark:text-dusk-400">
            <LocationPinIcon className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{event.location}</span>
          </div>
        )}
      </div>

      {/* Next indicator */}
      {isNext && (
        <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-6 bg-accent-500 rounded-full" />
      )}
    </div>
  );
}

/**
 * Current time indicator line
 */
function CurrentTimeIndicator({ timezone }: { timezone: string }) {
  const now = getCurrentTimeInTimezone(timezone);
  const timeStr = formatEventTime(now, timezone);

  return (
    <div className="relative flex items-center gap-2 py-2">
      {/* Line */}
      <div className="flex-1 h-0.5 bg-accent-500 rounded-full" />

      {/* "Now" label */}
      <div className="flex items-center gap-1.5 px-2 py-1 bg-accent-500 text-white text-xs font-medium rounded-full shadow-sm">
        <ClockIcon className="w-3 h-3" />
        <span>Now</span>
        <span className="opacity-75">{timeStr}</span>
      </div>

      {/* Line continuation */}
      <div className="flex-1 h-0.5 bg-accent-500 rounded-full" />
    </div>
  );
}

/**
 * Empty state when no events are scheduled
 */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-navy-700 flex items-center justify-center mb-3">
        <svg
          className="w-6 h-6 text-gray-400 dark:text-dusk-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>
      <p className="text-sm font-medium text-gray-600 dark:text-dusk-400">
        No events scheduled for today
      </p>
      <p className="text-xs text-gray-500 dark:text-dusk-400 mt-1">
        Add activities, transportation, or lodging to see them here
      </p>
    </div>
  );
}

/**
 * TodaysItinerary component
 *
 * Displays today's schedule for in-progress trips with a vertical timeline,
 * current time indicator, and color-coded events by type.
 */
export default function TodaysItinerary({
  activities,
  transportation,
  lodging,
  tripTimezone,
  weatherData,
  onEventClick,
  onNavigateToTimeline,
}: TodaysItineraryProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const currentTimeRef = useRef<HTMLDivElement>(null);

  // Get today's events
  const events = useMemo(
    () => getTodaysEvents(activities, transportation, lodging, tripTimezone),
    [activities, transportation, lodging, tripTimezone]
  );

  // Find the next upcoming event
  const nextEvent = useMemo(() => getNextEvent(events), [events]);

  // Calculate time span for the timeline
  const { startHour, endHour } = useMemo(() => calculateTimeSpan(events), [events]);

  // Get current time position
  const currentTimePosition = useMemo(
    () => getCurrentTimePosition(tripTimezone, startHour, endHour),
    [tripTimezone, startHour, endHour]
  );

  // Scroll to current time on mount
  useEffect(() => {
    if (currentTimeRef.current && scrollContainerRef.current) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        currentTimeRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [events]);

  // Split events into completed and upcoming
  const pastEvents = events.filter(e => e.isCompleted);
  const upcomingEvents = events.filter(e => !e.isCompleted);

  // Handle event click
  const handleEventClick = (event: ItineraryEvent) => {
    // Get the actual ID from the data object (handle lodging ID offsets)
    const actualId = event.data.id;
    onEventClick(event.type, actualId.toString());
  };

  return (
    <div className="card animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Today's Itinerary
          </h3>
          <p className="text-sm text-gray-500 dark:text-dusk-400">
            {formatTodayHeader(tripTimezone)}
          </p>
        </div>

        {/* Weather (if available) */}
        {weatherData && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-navy-700 rounded-full">
            <span className="text-lg">{weatherData.icon}</span>
            <span className="text-sm font-medium text-gray-700 dark:text-dusk-300">
              {weatherData.temp}°
            </span>
          </div>
        )}

        {/* Placeholder weather icon if no data */}
        {!weatherData && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-navy-700 rounded-full">
            <span className="text-lg">☀️</span>
            <span className="text-xs text-gray-400 dark:text-dusk-400">--</span>
          </div>
        )}
      </div>

      {/* Event count summary */}
      {events.length > 0 && (
        <div className="flex items-center gap-3 mb-4 text-xs text-gray-500 dark:text-dusk-400">
          <span>{events.length} event{events.length !== 1 ? 's' : ''}</span>
          {pastEvents.length > 0 && (
            <span className="flex items-center gap-1">
              <CheckIcon className="w-3 h-3 text-green-500" />
              {pastEvents.length} completed
            </span>
          )}
          {upcomingEvents.length > 0 && (
            <span>{upcomingEvents.length} upcoming</span>
          )}
        </div>
      )}

      {/* Timeline content */}
      <div
        ref={scrollContainerRef}
        className="relative max-h-80 overflow-y-auto pr-1 -mr-1 scrollbar-hide"
      >
        {events.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-2">
            {/* Past events */}
            {pastEvents.map((event, index) => (
              <EventItem
                key={`past-${event.id}-${index}`}
                event={event}
                isNext={false}
                timezone={tripTimezone}
                onClick={() => handleEventClick(event)}
              />
            ))}

            {/* Current time indicator */}
            {currentTimePosition !== null && (
              <div ref={currentTimeRef}>
                <CurrentTimeIndicator timezone={tripTimezone} />
              </div>
            )}

            {/* Upcoming events */}
            {upcomingEvents.map((event, index) => (
              <EventItem
                key={`upcoming-${event.id}-${index}`}
                event={event}
                isNext={nextEvent?.id === event.id}
                timezone={tripTimezone}
                onClick={() => handleEventClick(event)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Show more link if many events */}
      {events.length > 5 && onNavigateToTimeline && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-dusk-700">
          <button
            type="button"
            onClick={() => {
              // Navigate to today's date on the timeline
              const todayStr = getTodayInTimezone(tripTimezone);
              onNavigateToTimeline(todayStr);
            }}
            className="text-sm text-primary-600 dark:text-gold hover:text-primary-700 dark:hover:text-gold/80 font-medium"
          >
            View today on timeline
          </button>
        </div>
      )}
    </div>
  );
}
