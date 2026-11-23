import Icon from '../ui/Icon';
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
  getTodayInTimezone,
  type ItineraryEvent,
} from '../../utils/tripDashboardUtils';
import RouteSegment from '../brand/RouteSegment';
import ContourBackdrop from '../brand/ContourBackdrop';
import type { RouteSegmentStyle } from '../../lib/vendored/routeProgress';
import { getTypeColor, getTypeTextColor } from '../timeline/utils';

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
    <Icon name="activity" className={className} />
  );
}

function TransportIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <Icon name="transportation" className={className} />
  );
}

function LodgingIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <Icon name="lodging" className={className} />
  );
}

function CheckIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <Icon name="check" className={className} />
  );
}

function LocationPinIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <Icon name="place" className={className} />
  );
}

function ClockIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <Icon name="schedule" className={className} />
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
  segment,
  segmentEndsAtEdge = false,
  onClick,
}: {
  event: ItineraryEvent;
  isNext: boolean;
  timezone: string;
  /** Route-line leg down to the next stop; omit for the last stop. */
  segment?: RouteSegmentStyle;
  /** The leg stops at this row's edge because the "Now" marker follows. */
  segmentEndsAtEdge?: boolean;
  onClick: () => void;
}) {
  const allDay = !!event.allDay;
  const duration = allDay ? null : formatEventDuration(event.startTime, event.endTime);
  // Same rule as the Timeline: gold for the current/next stop, muted once done,
  // else the item type's colour (`getTypeColor`).
  const markerClass = event.isCompleted
    ? 'bg-gray-300 dark:bg-dusk-600 text-white dark:text-dusk-300'
    : isNext
      ? 'bg-accent-500 dark:bg-gold text-white dark:text-dusk-900 ring-4 ring-accent-500/20 dark:ring-gold/20'
      : `${getTypeColor(event.type)} text-white`;

  return (
    <div
      className={`relative flex items-start gap-3 pb-3 cursor-pointer group ${event.isCompleted ? 'opacity-70' : ''}`}
      data-route-stop={event.isCompleted ? 'past' : isNext ? 'next' : 'future'}
      data-all-day={allDay || undefined}
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
      {/* Route rail: stop marker plus the leg down to the next stop */}
      <div className="relative flex-shrink-0 w-8 self-stretch">
        {segment && (
          <RouteSegment
            style={segment}
            className={segmentEndsAtEdge ? 'top-4 bottom-0' : 'top-4 -bottom-4'}
          />
        )}
        <div
          className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center ${markerClass}`}
        >
          {event.isCompleted ? (
            <CheckIcon className="w-4 h-4" />
          ) : (
            getEventIcon(event.type, 'w-4 h-4')
          )}
        </div>
      </div>

      {/* Event content */}
      <div className="flex-1 min-w-0 rounded-lg px-2 py-1 -mt-0.5 group-hover:bg-gray-50 dark:group-hover:bg-dusk-800/60 transition-colors">
        {/* Time */}
        <div className="flex items-center gap-2 text-xs tabular-nums text-gray-500 dark:text-dusk-400">
          {allDay ? (
            <span className="font-medium">All day</span>
          ) : (
            <span className={`font-medium ${event.isCompleted ? '' : getTypeTextColor(event.type)}`}>
              {formatEventTime(event.startTime, timezone)}
            </span>
          )}
          {!allDay && event.endTime && (
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
            <span className="truncate place-name">{event.location}</span>
          </div>
        )}
      </div>

    </div>
  );
}

/**
 * Current time indicator line
 */
function CurrentTimeIndicator({ timezone }: { timezone: string }) {
  const timeStr = formatEventTime(new Date(), timezone);

  return (
    <div className="relative flex items-center gap-3 pb-3">
      {/* The route line passes through the Now marker, solid up to here */}
      <div className="relative w-8 self-stretch flex-shrink-0">
        <RouteSegment style="solid" className="top-0 -bottom-4" />
      </div>
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
    <div className="relative overflow-hidden flex flex-col items-center justify-center py-8 text-center">
      <ContourBackdrop seed="today-empty" count={6} />
      <div className="relative w-12 h-12 rounded-full bg-gray-100 dark:bg-navy-700 flex items-center justify-center mb-3">
        <Icon name="calendar" className="w-6 h-6 text-gray-400 dark:text-dusk-400" />
      </div>
      <p className="relative text-sm font-medium text-gray-600 dark:text-dusk-400">
        No events scheduled for today
      </p>
      <p className="relative text-xs text-gray-500 dark:text-dusk-400 mt-1">
        Add activities, transport, or stays to see them here
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
  const { startHour, endHour } = useMemo(() => calculateTimeSpan(events, tripTimezone), [events, tripTimezone]);

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

  // All-day items lead the list; the rest split into completed and upcoming
  const allDayEvents = events.filter(e => e.allDay);
  const pastEvents = events.filter(e => !e.allDay && e.isCompleted);
  const upcomingEvents = events.filter(e => !e.allDay && !e.isCompleted);

  // Route line: solid once the traveller has reached the next stop, dashed ahead.
  const ordered = [...allDayEvents, ...pastEvents, ...upcomingEvents];
  const segmentAfter = (index: number): RouteSegmentStyle | undefined => {
    const following = ordered[index + 1];
    if (!following) return undefined;
    return following.isCompleted || nextEvent?.id === following.id ? 'solid' : 'dashed';
  };

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
          <div>
            {/* All-day items (a mid-stay night): no clock time, never "next" */}
            {allDayEvents.map((event, index) => (
              <EventItem
                key={`allday-${event.id}-${index}`}
                event={event}
                isNext={false}
                timezone={tripTimezone}
                segment={segmentAfter(index)}
                segmentEndsAtEdge={
                  index === allDayEvents.length - 1 &&
                  pastEvents.length === 0 &&
                  currentTimePosition !== null
                }
                onClick={() => handleEventClick(event)}
              />
            ))}

            {/* Past events */}
            {pastEvents.map((event, index) => (
              <EventItem
                key={`past-${event.id}-${index}`}
                event={event}
                isNext={false}
                timezone={tripTimezone}
                segment={segmentAfter(allDayEvents.length + index)}
                segmentEndsAtEdge={index === pastEvents.length - 1 && currentTimePosition !== null}
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
                segment={segmentAfter(allDayEvents.length + pastEvents.length + index)}
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
