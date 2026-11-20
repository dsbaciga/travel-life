import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { createPortal } from 'react-dom';
import type { WeatherData, WeatherDisplay } from '../types/weather';
import type { Activity } from '../types/activity';
import type { Transportation } from '../types/transportation';
import type { Lodging } from '../types/lodging';
import activityService from '../services/activity.service';
import transportationService from '../services/transportation.service';
import lodgingService from '../services/lodging.service';
import customItemService from '../services/customItem.service';
import type { CustomItem } from '../types/customItem';
import journalService from '../services/journalEntry.service';
import weatherService from '../services/weather.service';
import entityLinkService from '../services/entityLink.service';
import { buildEntityLocationIdsMap } from '../utils/entityLocations';
import locationService from '../services/location.service';
import { getWeatherIcon } from '../utils/weatherIcons';
import { parseDateOnlyAsLocal } from '../utils/timezone';
import toast from 'react-hot-toast';
import { debugLogger } from '../utils/debugLogger';
import { useDayJournalComposer, DayJournalActions } from './journal/DayJournalComposer';
import { displayDayKeyToIso } from '../utils/displayDayKey';

// New timeline components
import {
  TimelineDaySection,
  TimelineFilters,
  MobileTimezoneToggle,
  PrintableItinerary,
  getDateStringInTimezone,
} from './timeline/index';
import type { PrintOption } from './timeline/TimelineFilters';
import { listTripDays, dayKeyForDateOnly } from './timeline/tripDays';
import type { TimelineItem, TimelineItemType, DayGroup, DayStats, UnscheduledActivityWithLocation } from './timeline/types';
import { useTripLinkSummary } from '../hooks/useTripLinkSummary';
import { getEntityKey } from '../types/entityLink';
import type { TripLinkSummary } from '../types/entityLink';
import EmptyState from './EmptyState';

/**
 * Timeline component displays a chronological view of all trip events including
 * activities, transportation, lodging, and journal entries. Supports dual timezone
 * display (trip timezone vs user's home timezone), weather data integration,
 * filtering by event type, and printable itinerary export.
 *
 * @param props - Component props
 * @param props.tripId - The ID of the trip to display timeline for
 * @param props.tripTitle - Optional title of the trip (used in print view)
 * @param props.tripTimezone - The timezone of the trip destination (e.g., "America/New_York")
 * @param props.userTimezone - The user's home timezone for dual timezone display
 * @param props.tripStartDate - ISO date string for trip start (used to generate day numbers)
 * @param props.tripEndDate - ISO date string for trip end (used to show all trip days)
 * @param props.tripStatus - Current status of the trip (kept for API compatibility)
 * @param props.onNavigateToTab - Callback to navigate to specific tab with item (kept for API compatibility)
 * @param props.onRefresh - Callback triggered after deleting an item to refresh parent data
 *
 * @example
 * ```tsx
 * <Timeline
 *   tripId={123}
 *   tripTitle="Paris Vacation"
 *   tripTimezone="Europe/Paris"
 *   userTimezone="America/Los_Angeles"
 *   tripStartDate="2024-06-01"
 *   tripEndDate="2024-06-07"
 *   onRefresh={() => refetchTrip()}
 * />
 * ```
 */
/**
 * Human-readable labels for toast messages.
 *
 * Explicit rather than capitalising the union member, which would render the
 * camelCase 'customItem' as "CustomItem".
 */
const TIMELINE_TYPE_LABELS: Record<TimelineItemType, string> = {
  activity: 'Activity',
  transportation: 'Transportation',
  lodging: 'Lodging',
  journal: 'Journal',
  customItem: 'Custom item',
};

interface TimelineProps {
  tripId: number;
  tripTitle?: string;
  tripTimezone?: string;
  userTimezone?: string;
  tripStartDate?: string;
  tripEndDate?: string;
  tripStatus?: string;
  tripType?: string;
  tripTypeEmoji?: string;
  onNavigateToTab?: (
    tab: 'activities' | 'transportation' | 'lodging' | 'journal',
    itemId?: number
  ) => void;
  onRefresh?: () => void;
}

const Timeline = ({
  tripId,
  tripTitle,
  tripTimezone,
  userTimezone,
  tripStartDate,
  tripEndDate,
  // These props are kept for API compatibility but not currently used
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  tripStatus: _tripStatus,
  tripType,
  tripTypeEmoji,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onNavigateToTab: _onNavigateToTab,
  onRefresh,
}: TimelineProps) => {
  // Create scoped logger for this component - memoized to prevent unnecessary re-renders
  const logger = useMemo(() => debugLogger.createScopedLogger('Timeline'), []);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const [weatherData, setWeatherData] = useState<Record<string, WeatherData>>({});
  const [loading, setLoading] = useState(true);
  const [mobileActiveTimezone, setMobileActiveTimezone] = useState<'trip' | 'user'>('trip');
  const [visibleTypes, setVisibleTypes] = useState<Set<TimelineItemType>>(
    new Set(['activity', 'transportation', 'lodging', 'journal', 'customItem'])
  );
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());

  // View mode state
  const [viewMode, setViewMode] = useState<'standard' | 'compact'>(() => {
    const saved = localStorage.getItem('timeline-view-mode');
    return saved === 'compact' || saved === 'standard' ? saved : 'standard';
  });

  const [refreshingWeather, setRefreshingWeather] = useState(false);

  // Unscheduled activities state
  const [unscheduledActivities, setUnscheduledActivities] = useState<Activity[]>([]);
  const [activityLocationMap, setActivityLocationMap] = useState<Record<number, number[]>>({});
  // Entity-to-location links map for all entities (used to match unscheduled activities)
  // Key format: "ENTITY_TYPE:ID", Value: array of linked location IDs
  const [entityLocationLinksMap, setEntityLocationLinksMap] = useState<Record<string, number[]>>({});
  // Location lookup map for displaying location names
  const [locationLookup, setLocationLookup] = useState<Record<number, { id: number; name: string }>>({});

  // Print state
  const [printWithMaps, setPrintWithMaps] = useState(false);
  const [unscheduledData, setUnscheduledData] = useState<{
    activities: Activity[];
    transportation: Transportation[];
    lodging: Lodging[];
    customItems: CustomItem[];
  }>({ activities: [], transportation: [], lodging: [], customItems: [] });
  const printRef = useRef<HTMLDivElement>(null);

  // Entity link summary hook
  const { summaryMap, invalidate: invalidateLinkSummary } = useTripLinkSummary(tripId);

  // Check if we should show dual timezones
  const showDualTimezone = tripTimezone && userTimezone && tripTimezone !== userTimezone;

  // Toggle filter type
  const toggleType = (type: TimelineItemType) => {
    setVisibleTypes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(type)) {
        newSet.delete(type);
      } else {
        newSet.add(type);
      }
      return newSet;
    });
  };

  // Toggle view mode
  const toggleViewMode = (mode: 'standard' | 'compact') => {
    setViewMode(mode);
    localStorage.setItem('timeline-view-mode', mode);
  };

  // Toggle day collapse
  const toggleDay = (dateKey: string) => {
    setCollapsedDays((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(dateKey)) {
        newSet.delete(dateKey);
      } else {
        newSet.add(dateKey);
      }
      return newSet;
    });
  };

  // Expand all days
  const expandAllDays = () => {
    setCollapsedDays(new Set());
  };

  // Collapse all days
  const collapseAllDays = () => {
    if (!allGroupedItems) return;
    const allDateKeys = Object.keys(allGroupedItems);
    setCollapsedDays(new Set(allDateKeys));
  };

  // Handle edit - navigate to the appropriate tab with edit parameter
  const handleEdit = (item: TimelineItem) => {
    const itemId = item.data.id;
    const tabMap: Record<TimelineItemType, string> = {
      activity: 'activities',
      transportation: 'transportation',
      lodging: 'lodging',
      journal: 'journal',
      customItem: 'custom',
    };
    const tab = tabMap[item.type];
    navigate(`/trips/${tripId}?tab=${tab}&edit=${itemId}`);
  };

  // Handle delete
  const handleDelete = async (item: TimelineItem) => {
    const itemId = item.data.id;

    if (!window.confirm(`Are you sure you want to delete "${item.title}"?`)) {
      return;
    }

    try {
      switch (item.type) {
        case 'activity':
          await activityService.deleteActivity(itemId);
          break;
        case 'transportation':
          await transportationService.deleteTransportation(itemId);
          break;
        case 'lodging':
          await lodgingService.deleteLodging(itemId);
          break;
        case 'journal':
          await journalService.deleteJournalEntry(itemId);
          break;
        case 'customItem':
          await customItemService.deleteCustomItem(itemId);
          break;
      }

      toast.success(`${TIMELINE_TYPE_LABELS[item.type]} deleted`);
      loadTimelineData();
      onRefresh?.();
    } catch (error) {
      console.error('Error deleting item:', error);
      toast.error(`Failed to delete ${TIMELINE_TYPE_LABELS[item.type].toLowerCase()}`);
    }
  };

  // Handle link update
  const handleLinkUpdate = () => {
    invalidateLinkSummary();
  };

  // "Add journal entry" per day. Reloads the timeline once the form has closed.
  const dayJournal = useDayJournalComposer({
    tripId,
    tripStartDate,
    tripEndDate,
    onSaved: () => {
      loadTimelineData();
      onRefresh?.();
    },
  });

  useEffect(() => {
    loadTimelineData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  /**
   * Loads all timeline data from the API including activities, transportation,
   * lodging, journal entries, weather, entity links, and locations. Processes
   * the data into TimelineItem objects and groups them by date.
   */
  const loadTimelineData = async () => {
    logger.log('🔄 Starting loadTimelineData', { operation: 'loadTimelineData', data: { tripId } });
    setLoading(true);
    try {
      logger.log('📡 Fetching timeline data from API...', { operation: 'loadTimelineData.fetch' });

      const [activities, transportation, lodging, journal, customItems, weather, locationLinks, locations, linkSummary] = await Promise.all([
        activityService.getActivitiesByTrip(tripId),
        transportationService.getTransportationByTrip(tripId),
        lodgingService.getLodgingByTrip(tripId),
        journalService.getJournalEntriesByTrip(tripId),
        customItemService.getCustomItemsByTrip(tripId).catch(() => []),
        weatherService.getWeatherForTrip(tripId).catch(() => []),
        entityLinkService.getLinksByTargetType(tripId, 'LOCATION').catch(() => []),
        locationService.getLocationsByTrip(tripId).catch(() => []),
        entityLinkService.getTripLinkSummary(tripId).catch(() => ({} as TripLinkSummary)),
      ]);

      logger.log('✅ API data received', {
        operation: 'loadTimelineData.received',
        data: {
          activitiesCount: activities?.length ?? 'null/undefined',
          transportationCount: transportation?.length ?? 'null/undefined',
          lodgingCount: lodging?.length ?? 'null/undefined',
          journalCount: journal?.length ?? 'null/undefined',
          weatherCount: weather?.length ?? 'null/undefined',
        }
      });

      // Log data structures
      logger.logDataStructure('activities', activities, 'loadTimelineData.validate');
      logger.logDataStructure('transportation', transportation, 'loadTimelineData.validate');
      logger.logDataStructure('lodging', lodging, 'loadTimelineData.validate');
      logger.logDataStructure('journal', journal, 'loadTimelineData.validate');
      logger.logDataStructure('weather', weather, 'loadTimelineData.validate');

      const items: TimelineItem[] = [];
      logger.log('📝 Starting timeline items processing', { operation: 'loadTimelineData.process' });

      // Build entity-to-location links map FIRST from the bulk fetch
      // This map is used for:
      // 1. Finding linked locations for unscheduled activities (avoids N+1 API calls)
      // 2. Finding linked locations for scheduled entities when matching unscheduled activities to days
      // An activity's or lodging's own place (locationId) leads; loose location links follow.
      const entityLinksMap: Record<string, number[]> = buildEntityLocationIdsMap(
        Array.isArray(locationLinks) ? locationLinks : [],
        Array.isArray(activities) ? activities : [],
        Array.isArray(lodging) ? lodging : []
      );
      setEntityLocationLinksMap(entityLinksMap);
      logger.log(`Built entity-location links map with ${Object.keys(entityLinksMap).length} entities`, {
        operation: 'loadTimelineData.entityLinks',
        data: {
          entityLinksMapKeys: Object.keys(entityLinksMap),
          entityLinksMap: entityLinksMap,
        }
      });

      // Build location lookup map for displaying location names
      const locLookup: Record<number, { id: number; name: string }> = {};
      if (Array.isArray(locations)) {
        for (const loc of locations) {
          locLookup[loc.id] = { id: loc.id, name: loc.name };
        }
      }
      setLocationLookup(locLookup);
      logger.log(`Built location lookup with ${Object.keys(locLookup).length} locations`, { operation: 'loadTimelineData.locations' });

      // Separate unscheduled activities and build location mapping using the already-fetched links
      const unscheduled: Activity[] = [];
      const locationMap: Record<number, number[]> = {};

      if (Array.isArray(activities)) {
        // Identify unscheduled activities
        for (const activity of activities) {
          if (!activity) continue;
          // An activity is unscheduled if it has no startTime and is not allDay
          if (!activity.startTime && !activity.allDay) {
            unscheduled.push(activity);
          }
        }

        // Build activity location map from the already-fetched entityLinksMap (no extra API calls needed)
        for (const activity of unscheduled) {
          const linkedLocs = entityLinksMap[`ACTIVITY:${activity.id}`];
          if (linkedLocs && linkedLocs.length > 0) {
            locationMap[activity.id] = linkedLocs;
          }
        }
      }
      setUnscheduledActivities(unscheduled);
      setActivityLocationMap(locationMap);

      // Populate the printable itinerary's unscheduled section from the data we
      // just fetched (no extra API calls). Doing this eagerly means the paper
      // version is fully populated in the DOM at all times, so a native browser
      // print (Ctrl+P / mobile "Save as PDF") produces a complete document — not
      // just the app's Print button. See the always-mounted portal below.
      setUnscheduledData({
        activities: unscheduled,
        transportation: Array.isArray(transportation)
          ? transportation.filter((t) => t && !t.departureTime)
          : [],
        lodging: Array.isArray(lodging)
          ? lodging.filter((l) => l && !l.checkInDate)
          : [],
        customItems: Array.isArray(customItems)
          ? customItems.filter((c) => c && !c.startTime)
          : [],
      });
      logger.log(`Found ${unscheduled.length} unscheduled activities`, {
        operation: 'loadTimelineData.unscheduled',
        data: {
          unscheduledIds: unscheduled.map(a => a.id),
          activityLocationMap: locationMap,
        }
      });

      // Note: Lodging locations are already included in entityLocationLinksMap (fetched via bulk query)

      // Add activities
      logger.log('Processing activities array', {
        operation: 'loadTimelineData.activities',
        data: { count: activities?.length, isArray: Array.isArray(activities) }
      });
      if (Array.isArray(activities)) {
        activities.forEach((activity, index) => {
          if (!activity) {
            logger.log(`⚠️ Skipping null/undefined activity at index ${index}`, { operation: 'loadTimelineData.activities' });
            return;
          }
        if (activity.startTime) {
          let durationMinutes: number | undefined;
          if (activity.startTime && activity.endTime) {
            const start = new Date(activity.startTime);
            const end = new Date(activity.endTime);
            durationMinutes = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
          }

          items.push({
            id: activity.id,
            type: 'activity',
            dateTime: new Date(activity.startTime),
            endDateTime: activity.endTime ? new Date(activity.endTime) : undefined,
            title: activity.name,
            subtitle: activity.category || undefined,
            description: activity.description || undefined,
            cost: activity.cost || undefined,
            currency: activity.currency || undefined,
            confirmationNumber: activity.bookingReference || undefined,
            durationMinutes,
            data: activity,
          });
        }
        });
        logger.log(`✅ Processed ${items.length} activities`, { operation: 'loadTimelineData.activities.complete' });
      } else {
        logger.log('⚠️ Activities is not an array', {
          operation: 'loadTimelineData.activities.invalid',
          data: { type: typeof activities, value: activities }
        });
      }

      // Add transportation
      logger.log('Processing transportation array', {
        operation: 'loadTimelineData.transportation',
        data: { count: transportation?.length, isArray: Array.isArray(transportation) }
      });
      if (Array.isArray(transportation)) {
        transportation.forEach((trans, index) => {
          if (!trans) {
            logger.log(`⚠️ Skipping null/undefined transportation at index ${index}`, { operation: 'loadTimelineData.transportation' });
            return;
          }
        if (trans.departureTime) {
          // For flights, only show airport names (not full addresses)
          // For other transportation types, include address for context
          const getLocationDisplay = (
            location: typeof trans.fromLocation,
            locationId: number | null,
            locationName: string | null,
            transportType: string
          ): string => {
            if (location?.name) {
              // Flights should only show airport name, not address
              if (transportType === 'flight') {
                return location.name;
              }
              if (location.address) {
                return `${location.name} (${location.address})`;
              }
              return location.name;
            }
            if (locationName) {
              // For flights, extract just the first part (name) from text field
              // This handles cases where users entered full addresses like "JFK Airport, Queens, NY"
              if (transportType === 'flight') {
                return locationName.split(',')[0].trim();
              }
              return locationName;
            }
            if (locationId) return `Location #${locationId} (deleted?)`;
            return 'Unknown';
          };

          let durationMinutes = trans.durationMinutes || undefined;
          if (!durationMinutes && trans.departureTime && trans.arrivalTime) {
            const start = new Date(trans.departureTime);
            const end = new Date(trans.arrivalTime);
            durationMinutes = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
          }

          items.push({
            id: trans.id,
            type: 'transportation',
            dateTime: new Date(trans.departureTime),
            endDateTime: trans.arrivalTime ? new Date(trans.arrivalTime) : undefined,
            title: `${trans.type.charAt(0).toUpperCase() + trans.type.slice(1)}`,
            subtitle: trans.carrier || undefined,
            description: `${getLocationDisplay(
              trans.fromLocation,
              trans.fromLocationId,
              trans.fromLocationName,
              trans.type
            )} → ${getLocationDisplay(trans.toLocation, trans.toLocationId, trans.toLocationName, trans.type)}`,
            cost: trans.cost || undefined,
            currency: trans.currency || undefined,
            startTimezone: trans.startTimezone || undefined,
            endTimezone: trans.endTimezone || undefined,
            transportationType: trans.type as TimelineItem['transportationType'],
            vehicleNumber: trans.vehicleNumber || undefined,
            confirmationNumber: trans.confirmationNumber || undefined,
            durationMinutes,
            distanceKm: trans.calculatedDistance || undefined,
            fromCoords:
              trans.fromLocation?.latitude && trans.fromLocation?.longitude
                ? {
                    latitude: Number(trans.fromLocation.latitude),
                    longitude: Number(trans.fromLocation.longitude),
                  }
                : undefined,
            toCoords:
              trans.toLocation?.latitude && trans.toLocation?.longitude
                ? {
                    latitude: Number(trans.toLocation.latitude),
                    longitude: Number(trans.toLocation.longitude),
                  }
                : undefined,
            connectionGroupId: trans.connectionGroupId || undefined,
            data: trans,
          });
        }
        });
        logger.log(`✅ Processed transportation, total items now: ${items.length}`, { operation: 'loadTimelineData.transportation.complete' });
      } else {
        logger.log('⚠️ Transportation is not an array', {
          operation: 'loadTimelineData.transportation.invalid',
          data: { type: typeof transportation, value: transportation }
        });
      }

      // Add lodging - create an entry for each day
      logger.log('Processing lodging array', {
        operation: 'loadTimelineData.lodging',
        data: { count: lodging?.length, isArray: Array.isArray(lodging) }
      });
      if (Array.isArray(lodging)) {
        lodging.forEach((lodge, index) => {
          if (!lodge) {
            logger.log(`⚠️ Skipping null/undefined lodging at index ${index}`, { operation: 'loadTimelineData.lodging' });
            return;
          }
        if (lodge.checkInDate && lodge.checkOutDate) {
          const checkInStr =
            typeof lodge.checkInDate === 'string'
              ? lodge.checkInDate.split('T')[0]
              : new Date(lodge.checkInDate).toISOString().split('T')[0];
          const checkOutStr =
            typeof lodge.checkOutDate === 'string'
              ? lodge.checkOutDate.split('T')[0]
              : new Date(lodge.checkOutDate).toISOString().split('T')[0];

          const [checkInYear, checkInMonth, checkInDay] = checkInStr.split('-').map(Number);
          const [checkOutYear, checkOutMonth, checkOutDay] = checkOutStr.split('-').map(Number);

          const checkInDateOnly = new Date(checkInYear, checkInMonth - 1, checkInDay);
          const checkOutDateOnly = new Date(checkOutYear, checkOutMonth - 1, checkOutDay);

          const checkIn = new Date(lodge.checkInDate);
          const checkOut = new Date(lodge.checkOutDate);

          const totalNights = Math.round(
            (checkOutDateOnly.getTime() - checkInDateOnly.getTime()) / (1000 * 60 * 60 * 24)
          );

          const currentDate = new Date(checkInDateOnly);
          let nightNumber = 1;

          while (currentDate <= checkOutDateOnly) {
            const isCheckInDay = currentDate.getTime() === checkInDateOnly.getTime();
            const isCheckOutDay = currentDate.getTime() === checkOutDateOnly.getTime();

            let itemDateTime: Date;
            if (isCheckInDay) {
              itemDateTime = new Date(checkIn);
            } else if (isCheckOutDay) {
              itemDateTime = new Date(checkOut);
            } else {
              itemDateTime = new Date(currentDate);
              itemDateTime.setHours(12, 0, 0, 0);
            }

            let subtitle =
              lodge.type.charAt(0).toUpperCase() + lodge.type.slice(1).replace(/_/g, ' ');

            if (isCheckInDay) {
              subtitle += ' (Check-in)';
            } else if (isCheckOutDay) {
              subtitle += ' (Check-out)';
            }

            const multiDayInfo =
              totalNights > 1 && !isCheckOutDay
                ? {
                    originalId: lodge.id,
                    nightNumber: nightNumber,
                    totalNights: totalNights,
                  }
                : undefined;

            items.push({
              id: lodge.id + currentDate.getTime(),
              type: 'lodging',
              dateTime: itemDateTime,
              endDateTime: isCheckOutDay ? new Date(checkOut) : undefined,
              title: lodge.name,
              subtitle: subtitle,
              description: lodge.address || undefined,
              // Note: Location is now via EntityLink system (not pre-loaded for lodging yet)
              location: undefined,
              locationCoords: undefined,
              cost: isCheckInDay ? lodge.cost || undefined : undefined,
              currency: isCheckInDay ? lodge.currency || undefined : undefined,
              isAllDay: !isCheckInDay && !isCheckOutDay,
              showCheckInTime: isCheckInDay,
              showCheckOutTime: isCheckOutDay,
              confirmationNumber: isCheckInDay ? lodge.confirmationNumber || undefined : undefined,
              multiDayInfo,
              data: lodge,
            });

            if (!isCheckOutDay) {
              nightNumber++;
            }
            currentDate.setDate(currentDate.getDate() + 1);
          }
        } else if (lodge.checkInDate) {
          items.push({
            id: lodge.id,
            type: 'lodging',
            dateTime: new Date(lodge.checkInDate),
            endDateTime: lodge.checkOutDate ? new Date(lodge.checkOutDate) : undefined,
            title: lodge.name,
            subtitle: lodge.type.charAt(0).toUpperCase() + lodge.type.slice(1).replace(/_/g, ' '),
            description: lodge.address || undefined,
            // Note: Location is now via EntityLink system (not pre-loaded for lodging yet)
            location: undefined,
            locationCoords: undefined,
            cost: lodge.cost || undefined,
            currency: lodge.currency || undefined,
            confirmationNumber: lodge.confirmationNumber || undefined,
            data: lodge,
          });
        }
        });
        logger.log(`✅ Processed lodging, total items now: ${items.length}`, { operation: 'loadTimelineData.lodging.complete' });
      } else {
        logger.log('⚠️ Lodging is not an array', {
          operation: 'loadTimelineData.lodging.invalid',
          data: { type: typeof lodging, value: lodging }
        });
      }

      // Add journal entries (only standalone ones)
      logger.log('Processing journal array', {
        operation: 'loadTimelineData.journal',
        data: { count: journal?.length, isArray: Array.isArray(journal) }
      });
      if (Array.isArray(journal)) {
        journal.forEach((entry, index) => {
          if (!entry) {
            logger.log(`⚠️ Skipping null/undefined journal entry at index ${index}`, { operation: 'loadTimelineData.journal' });
            return;
          }
          if (entry && entry.date) {
            // Linkage lives in the unified EntityLink system (the old journal_*
            // assignment tables were dropped in 20260118_remove_old_journal_linkage_tables),
            // so read it from the trip link summary rather than from the entry.
            const journalLinkCounts =
              linkSummary?.[getEntityKey('JOURNAL_ENTRY', entry.id)]?.linkCounts;
            const hasActivityLinks = (journalLinkCounts?.ACTIVITY ?? 0) > 0;
            const hasLodgingLinks = (journalLinkCounts?.LODGING ?? 0) > 0;
            const hasTransportationLinks = (journalLinkCounts?.TRANSPORTATION ?? 0) > 0;

            logger.log(`Processing journal entry ${index}`, {
              operation: 'loadTimelineData.journal.item',
              data: { hasActivityLinks, hasLodgingLinks, hasTransportationLinks }
            });

            if (!hasActivityLinks && !hasLodgingLinks && !hasTransportationLinks) {
              const content = (entry.content != null && typeof entry.content === 'string') ? entry.content : '';
              // Use parseDateOnlyAsLocal to avoid UTC timezone shift issues.
              // Journal entry dates are stored as date-only in the database (e.g., "2025-01-15").
              // When parsed with new Date(), JavaScript interprets this as midnight UTC,
              // which shifts to the previous day in timezones west of UTC.
              items.push({
                id: entry.id,
                type: 'journal',
                dateTime: parseDateOnlyAsLocal(entry.date),
                title: entry.title || 'Untitled Entry',
                description:
                  content.substring(0, 150) + (content.length > 150 ? '...' : ''),
                location: locLookup[entityLinksMap[getEntityKey('JOURNAL_ENTRY', entry.id)]?.[0]]?.name,
                data: entry,
              });
            }
          }
        });
        logger.log(`✅ Processed journal, total items now: ${items.length}`, { operation: 'loadTimelineData.journal.complete' });
      } else {
        logger.log('⚠️ Journal is not an array', {
          operation: 'loadTimelineData.journal.invalid',
          data: { type: typeof journal, value: journal }
        });
      }

      // Custom items. Only scheduled ones appear on the timeline — an undated
      // item has no day to sit on, and it stays visible in the Custom tab.
      if (Array.isArray(customItems)) {
        for (const item of customItems) {
          if (!item.startTime) continue;
          items.push({
            id: item.id,
            type: 'customItem',
            dateTime: new Date(item.startTime),
            endDateTime: item.endTime ? new Date(item.endTime) : undefined,
            title: item.name,
            subtitle: item.type?.name || undefined,
            description: item.notes || undefined,
            location: item.location?.name,
            locationCoords:
              item.location?.latitude != null && item.location?.longitude != null
                ? { latitude: item.location.latitude, longitude: item.location.longitude }
                : undefined,
            cost: item.cost ?? undefined,
            currency: item.currency ?? undefined,
            isAllDay: item.allDay,
            startTimezone: item.timezone ?? undefined,
            endTimezone: item.timezone ?? undefined,
            confirmationNumber: item.confirmationNumber ?? undefined,
            data: item,
          });
        }
        logger.log(`✅ Processed custom items, total items now: ${items.length}`, {
          operation: 'loadTimelineData.customItems.complete',
        });
      }

      // Sort by date/time
      logger.log(`Sorting ${items.length} timeline items`, { operation: 'loadTimelineData.sort' });
      try {
        items.sort((a, b) => {
          if (!a || !a.dateTime) {
            logger.log('⚠️ Found item without dateTime in sort (a)', { operation: 'loadTimelineData.sort', data: { item: a } });
            return 1;
          }
          if (!b || !b.dateTime) {
            logger.log('⚠️ Found item without dateTime in sort (b)', { operation: 'loadTimelineData.sort', data: { item: b } });
            return -1;
          }
          return a.dateTime.getTime() - b.dateTime.getTime();
        });
        logger.log('✅ Sorting complete', { operation: 'loadTimelineData.sort.complete' });
      } catch (sortError) {
        logger.error('❌ Error during sort', sortError, { operation: 'loadTimelineData.sort' });
        throw sortError;
      }

      logger.log(`Setting timeline items state with ${items.length} items`, { operation: 'loadTimelineData.setState' });
      setTimelineItems(items);

      // Process weather data
      logger.log('Processing weather data', {
        operation: 'loadTimelineData.weather',
        data: { count: weather?.length, isArray: Array.isArray(weather) }
      });
      const weatherByDate: Record<string, WeatherData> = {};
      if (Array.isArray(weather)) {
        weather.forEach((w, index) => {
          if (!w) {
            logger.log(`⚠️ Skipping null/undefined weather at index ${index}`, { operation: 'loadTimelineData.weather' });
            return;
          }
          if (w && w.date) {
            // Weather dates are calendar days; key them by that day, not by an instant.
            const dateKey = dayKeyForDateOnly(typeof w.date === 'string' ? w.date : new Date(w.date).toISOString());
            if (!dateKey) return;
            weatherByDate[dateKey] = w;
          }
        });
        logger.log(`✅ Processed ${Object.keys(weatherByDate).length} weather entries`, { operation: 'loadTimelineData.weather.complete' });
      } else {
        logger.log('⚠️ Weather is not an array', {
          operation: 'loadTimelineData.weather.invalid',
          data: { type: typeof weather, value: weather }
        });
      }

      logger.log('Setting weather data state', { operation: 'loadTimelineData.setWeatherState', data: { count: Object.keys(weatherByDate).length } });
      setWeatherData(weatherByDate);

      logger.log('✅ loadTimelineData completed successfully', {
        operation: 'loadTimelineData.complete',
        data: { itemsCount: items.length, weatherCount: Object.keys(weatherByDate).length }
      });
    } catch (error) {
      logger.error('❌ Error in loadTimelineData', error, {
        operation: 'loadTimelineData.error',
        data: { tripId, errorMessage: error instanceof Error ? error.message : String(error) }
      });
      toast.error('Failed to load timeline data');
      console.error('Error loading timeline:', error);
    } finally {
      setLoading(false);
      logger.log('Loading state set to false', { operation: 'loadTimelineData.finally' });
    }
  };

  // Filter items by visible types
  const filteredItems = useMemo(() => {
    logger.log('useMemo: filteredItems calculation started', {
      operation: 'useMemo.filteredItems',
      data: {
        timelineItemsCount: timelineItems?.length ?? 'null/undefined',
        timelineItemsIsArray: Array.isArray(timelineItems),
        visibleTypesSize: visibleTypes?.size ?? 'null/undefined'
      }
    });

    try {
      if (!Array.isArray(timelineItems)) {
        logger.log('⚠️ timelineItems is not an array in filteredItems', {
          operation: 'useMemo.filteredItems',
          data: { type: typeof timelineItems, value: timelineItems }
        });
        return [];
      }

      const filtered = timelineItems.filter((item, index) => {
        if (!item) {
          logger.log(`⚠️ Null/undefined item at index ${index} in filteredItems`, { operation: 'useMemo.filteredItems' });
          return false;
        }

        return visibleTypes.has(item.type);
      });

      logger.log(`useMemo: filteredItems complete`, {
        operation: 'useMemo.filteredItems.complete',
        data: { filteredCount: filtered.length, originalCount: timelineItems.length }
      });

      return filtered;
    } catch (error) {
      logger.error('❌ Error in filteredItems useMemo', error, { operation: 'useMemo.filteredItems.error' });
      return [];
    }
  }, [timelineItems, visibleTypes, logger]);

  // Generate all dates from trip start to end
  const generateAllTripDates = (): string[] => {
    if (!tripStartDate || !tripEndDate || !tripTimezone) return [];

    return listTripDays(tripStartDate, tripEndDate).map((day) => day.dateKey);
  };

  const allTripDates = generateAllTripDates();

  // Group items by date
  const groupedItems = useMemo(() => {
    logger.log('useMemo: groupedItems calculation started', {
      operation: 'useMemo.groupedItems',
      data: {
        filteredItemsCount: filteredItems?.length ?? 'null/undefined',
        filteredItemsIsArray: Array.isArray(filteredItems),
        tripTimezone
      }
    });

    try {
      if (!Array.isArray(filteredItems)) {
        logger.log('⚠️ filteredItems is not an array in groupedItems', {
          operation: 'useMemo.groupedItems',
          data: { type: typeof filteredItems, value: filteredItems }
        });
        return {};
      }

      const grouped = filteredItems.reduce((acc, item, index) => {
        if (!item) {
          logger.log(`⚠️ Null/undefined item at index ${index} in groupedItems`, { operation: 'useMemo.groupedItems' });
          return acc;
        }

        if (!item.dateTime) {
          logger.log(`⚠️ Item at index ${index} has no dateTime`, {
            operation: 'useMemo.groupedItems',
            data: { item }
          });
          return acc;
        }

        try {
          const itemTimezone =
            item.type === 'transportation' && item.startTimezone ? item.startTimezone : tripTimezone;

          const dateKey = getDateStringInTimezone(item.dateTime, itemTimezone);
          if (!acc[dateKey]) {
            acc[dateKey] = [];
          }
          acc[dateKey].push(item);
        } catch (itemError) {
          logger.error(`❌ Error processing item at index ${index}`, itemError, {
            operation: 'useMemo.groupedItems.item',
            data: { item, index }
          });
        }

        return acc;
      }, {} as Record<string, TimelineItem[]>);

      logger.log('useMemo: groupedItems complete', {
        operation: 'useMemo.groupedItems.complete',
        data: { groupCount: Object.keys(grouped).length, itemsProcessed: filteredItems.length }
      });

      return grouped;
    } catch (error) {
      logger.error('❌ Error in groupedItems useMemo', error, { operation: 'useMemo.groupedItems.error' });
      return {};
    }
  }, [filteredItems, tripTimezone, logger]);

  // Merge all trip dates with grouped items
  const allGroupedItems: Record<string, TimelineItem[]> = useMemo(() => {
    logger.log('useMemo: allGroupedItems calculation started', {
      operation: 'useMemo.allGroupedItems',
      data: {
        allTripDatesCount: allTripDates?.length ?? 'null/undefined',
        allTripDatesIsArray: Array.isArray(allTripDates),
        groupedItemsKeys: Object.keys(groupedItems || {}).length
      }
    });

    try {
      const result: Record<string, TimelineItem[]> = {};

      if (allTripDates && Array.isArray(allTripDates) && allTripDates.length > 0) {
        allTripDates.forEach((dateKey, index) => {
          if (!dateKey) {
            logger.log(`⚠️ Null/undefined dateKey at index ${index} in allTripDates`, { operation: 'useMemo.allGroupedItems' });
            return;
          }
          result[dateKey] = groupedItems[dateKey] || [];
        });
        Object.keys(groupedItems).forEach((dateKey) => {
          if (!result[dateKey]) {
            result[dateKey] = groupedItems[dateKey];
          }
        });
      } else {
        Object.assign(result, groupedItems);
      }

      logger.log('useMemo: allGroupedItems complete', {
        operation: 'useMemo.allGroupedItems.complete',
        data: { resultKeys: Object.keys(result).length }
      });

      return result;
    } catch (error) {
      logger.error('❌ Error in allGroupedItems useMemo', error, { operation: 'useMemo.allGroupedItems.error' });
      return {};
    }
  }, [allTripDates, groupedItems, logger]);

  // Sort dates chronologically
  const sortedDateKeys = useMemo(() => {
    logger.log('useMemo: sortedDateKeys calculation started', {
      operation: 'useMemo.sortedDateKeys',
      data: {
        allGroupedItemsKeys: allGroupedItems ? Object.keys(allGroupedItems).length : 'null/undefined'
      }
    });

    try {
      if (!allGroupedItems) {
        logger.log('⚠️ allGroupedItems is null/undefined', { operation: 'useMemo.sortedDateKeys' });
        return [];
      }

      const keys = Object.keys(allGroupedItems);
      const sorted = keys.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

      logger.log('useMemo: sortedDateKeys complete', {
        operation: 'useMemo.sortedDateKeys.complete',
        data: { keysCount: sorted.length }
      });

      return sorted;
    } catch (error) {
      logger.error('❌ Error in sortedDateKeys useMemo', error, { operation: 'useMemo.sortedDateKeys.error' });
      return [];
    }
  }, [allGroupedItems, logger]);

  // Get day number from trip start date
  const getDayNumber = (dateString: string): number | null => {
    if (!tripStartDate) return null;

    const match = tripStartDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    let startDate: Date;
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      startDate = new Date(year, month, day, 0, 0, 0, 0);
    } else {
      startDate = new Date(tripStartDate);
      startDate.setHours(0, 0, 0, 0);
    }

    const itemDate = new Date(dateString);
    itemDate.setHours(0, 0, 0, 0);

    const diffTime = itemDate.getTime() - startDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    return diffDays + 1;
  };

  // Transform weather data
  const transformWeatherData = (weather: WeatherData): WeatherDisplay => {
    return {
      date: weather.date,
      high: weather.temperatureHigh,
      low: weather.temperatureLow,
      conditions: weather.conditions,
      icon: getWeatherIcon(weather.conditions),
      precipitation: weather.precipitation,
      humidity: weather.humidity,
      windSpeed: weather.windSpeed,
      locationName: weather.locationName,
      sunrise: weather.sunrise,
      sunset: weather.sunset,
    };
  };

  /**
   * Calculates aggregate statistics for a single day's timeline items.
   * Counts items by type and tallies linked photos from the summary map.
   * @param items - Array of timeline items for the day
   * @returns DayStats object with counts by type and total linked photos
   */
  const calculateDayStats = (items: TimelineItem[]): DayStats => {
    const stats: DayStats = {
      activities: 0,
      transportation: 0,
      lodging: 0,
      journal: 0,
      customItems: 0,
      totalPhotosLinked: 0,
    };

    // Defensive check: ensure items is an array
    if (!Array.isArray(items)) {
      logger.log('⚠️ calculateDayStats received non-array items', {
        operation: 'calculateDayStats',
        data: { itemsType: typeof items, items }
      });
      return stats;
    }

    items.forEach((item) => {
      switch (item.type) {
        case 'activity':
          stats.activities++;
          break;
        case 'transportation':
          stats.transportation++;
          break;
        case 'lodging':
          stats.lodging++;
          break;
        case 'journal':
          stats.journal++;
          break;
        case 'customItem':
          stats.customItems++;
          break;
      }

      // Count linked photos from summary
      if (summaryMap) {
        const entityType =
          item.type === 'activity'
            ? 'ACTIVITY'
            : item.type === 'transportation'
            ? 'TRANSPORTATION'
            : item.type === 'lodging'
            ? 'LODGING'
            : 'JOURNAL_ENTRY';
        const key = `${entityType}:${item.data.id}`;
        const summary = summaryMap[key];
        if (summary?.linkCounts.PHOTO) {
          stats.totalPhotosLinked += summary.linkCounts.PHOTO;
        }
      }
    });

    return stats;
  };

  // Helper to extract location IDs from timeline items
  // Note: Activity and Lodging locations are now handled via EntityLink system (no direct FKs)
  // Transportation still has direct FKs for start/end locations
  const getLocationIdsFromItems = (items: TimelineItem[]): Set<number> => {
    const locationIds = new Set<number>();
    items.forEach((item) => {
      // Get location ID from the data object based on item type
      if (item.type === 'activity') {
        const activity = item.data as Activity;
        // Activity locations are via EntityLink system
        const linkedLocs = entityLocationLinksMap[`ACTIVITY:${activity.id}`];
        if (linkedLocs) {
          linkedLocs.forEach(locId => locationIds.add(locId));
        }
      } else if (item.type === 'lodging') {
        const lodging = item.data as Lodging;
        // Lodging locations are via EntityLink system
        const linkedLocs = entityLocationLinksMap[`LODGING:${lodging.id}`];
        if (linkedLocs) {
          linkedLocs.forEach(locId => locationIds.add(locId));
        }
      } else if (item.type === 'transportation') {
        const trans = item.data as Transportation;
        // Transportation still has direct FK references
        if (trans.fromLocationId) {
          locationIds.add(trans.fromLocationId);
        }
        if (trans.toLocationId) {
          locationIds.add(trans.toLocationId);
        }
        // Also check entity links for transportation
        const linkedLocs = entityLocationLinksMap[`TRANSPORTATION:${trans.id}`];
        if (linkedLocs) {
          linkedLocs.forEach(locId => locationIds.add(locId));
        }
      } else if (item.type === 'journal') {
        // Journal entries can also be linked to locations
        const journal = item.data as { id: number };
        const linkedLocs = entityLocationLinksMap[`JOURNAL_ENTRY:${journal.id}`];
        if (linkedLocs) {
          linkedLocs.forEach(locId => locationIds.add(locId));
        }
      }
    });
    return locationIds;
  };

  /**
   * Finds unscheduled activities that should appear on a specific day based on
   * location matching. An unscheduled activity appears on a day if it is linked
   * to a location that is also associated with a scheduled item on that day.
   * @param items - Array of scheduled timeline items for the day
   * @returns Array of unscheduled activities with their linked location info
   */
  const getUnscheduledActivitiesForDay = (items: TimelineItem[]): UnscheduledActivityWithLocation[] => {
    const dayLocationIds = getLocationIdsFromItems(items);

    // Debug logging for unscheduled activities matching
    logger.log('getUnscheduledActivitiesForDay', {
      operation: 'unscheduled.matching',
      data: {
        scheduledItemsCount: items.length,
        dayLocationIds: Array.from(dayLocationIds),
        unscheduledCount: unscheduledActivities.length,
        activityLocationMapKeys: Object.keys(activityLocationMap),
      }
    });

    if (dayLocationIds.size === 0) {
      logger.log('No location IDs found for day - skipping unscheduled matching', { operation: 'unscheduled.matching' });
      return [];
    }

    const matched = unscheduledActivities
      .filter((activity) => {
        const linkedLocationIds = activityLocationMap[activity.id] || [];
        const hasMatch = linkedLocationIds.some((locId) => dayLocationIds.has(locId));
        if (linkedLocationIds.length > 0) {
          logger.log(`Checking activity ${activity.id} (${activity.name})`, {
            operation: 'unscheduled.matching.activity',
            data: { linkedLocationIds, hasMatch }
          });
        }
        return hasMatch;
      })
      .map((activity): UnscheduledActivityWithLocation => {
        // Add linked location info to the activity
        const linkedLocationIds = activityLocationMap[activity.id] || [];
        const linkedLocations = linkedLocationIds
          .map((locId) => locationLookup[locId])
          .filter(Boolean);
        return {
          ...activity,
          linkedLocations: linkedLocations.length > 0 ? linkedLocations : undefined,
        };
      });

    logger.log(`Matched ${matched.length} unscheduled activities for day`, { operation: 'unscheduled.matching.result' });
    return matched;
  };

  // Build day groups
  const dayGroups: DayGroup[] = useMemo(() => {
    logger.log('useMemo: dayGroups calculation started', {
      operation: 'useMemo.dayGroups',
      data: {
        sortedDateKeysCount: sortedDateKeys?.length ?? 'null/undefined',
        sortedDateKeysIsArray: Array.isArray(sortedDateKeys),
        allGroupedItemsKeys: allGroupedItems ? Object.keys(allGroupedItems).length : 'null/undefined',
        weatherDataKeys: weatherData ? Object.keys(weatherData).length : 'null/undefined',
      }
    });

    try {
      if (!sortedDateKeys || !Array.isArray(sortedDateKeys)) {
        logger.log('⚠️ sortedDateKeys is not valid', {
          operation: 'useMemo.dayGroups',
          data: { sortedDateKeys, isArray: Array.isArray(sortedDateKeys) }
        });
        return [];
      }

      const groups = sortedDateKeys.map((dateKey, index) => {
        try {
          if (!dateKey) {
            logger.log(`⚠️ Null/undefined dateKey at index ${index}`, { operation: 'useMemo.dayGroups.map' });
            return null;
          }

          const items = allGroupedItems[dateKey] || [];
          const dayWeather = weatherData[dateKey];

          if (!Array.isArray(items)) {
            logger.log(`⚠️ Items for dateKey ${dateKey} is not an array`, {
              operation: 'useMemo.dayGroups.map',
              data: { dateKey, itemsType: typeof items, items }
            });
          }

          // Get unscheduled activities linked to locations present on this day
          const dayUnscheduled = getUnscheduledActivitiesForDay(items);

          const group = {
            dateKey,
            dayNumber: getDayNumber(dateKey),
            items,
            weather: dayWeather ? transformWeatherData(dayWeather) : undefined,
            stats: calculateDayStats(items),
            unscheduledActivities: dayUnscheduled.length > 0 ? dayUnscheduled : undefined,
          };

          return group;
        } catch (itemError) {
          logger.error(`❌ Error processing dateKey ${dateKey} at index ${index}`, itemError, {
            operation: 'useMemo.dayGroups.map.item',
            data: { dateKey, index }
          });
          return null;
        }
      }).filter(group => group !== null) as DayGroup[];

      logger.log('useMemo: dayGroups complete', {
        operation: 'useMemo.dayGroups.complete',
        data: { groupsCount: groups.length, dateKeysProcessed: sortedDateKeys.length }
      });

      return groups;
    } catch (error) {
      logger.error('❌ Error in dayGroups useMemo', error, { operation: 'useMemo.dayGroups.error' });
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedDateKeys, allGroupedItems, weatherData, summaryMap, tripStartDate, unscheduledActivities, activityLocationMap, entityLocationLinksMap, locationLookup, logger]);

  // Weather refresh handler
  const handleRefreshWeather = async () => {
    setRefreshingWeather(true);
    try {
      const weather = await weatherService.refreshAllWeather(tripId);

      const weatherByDate: Record<string, WeatherData> = {};
      if (weather && Array.isArray(weather)) {
        weather.forEach((w) => {
          const dateKey = dayKeyForDateOnly(typeof w.date === 'string' ? w.date : new Date(w.date).toISOString());
          if (!dateKey) return;
          weatherByDate[dateKey] = w;
        });
      }
      setWeatherData(weatherByDate);

      toast.success(`Weather data refreshed successfully (${weather?.length || 0} days)`);
    } catch (error) {
      console.error('Error refreshing weather:', error);
      toast.error('Failed to refresh weather data');
    } finally {
      setRefreshingWeather(false);
    }
  };

  // Print handler.
  //
  // The printable itinerary is always mounted (see the portal at the bottom of
  // render) and its data is loaded up front in loadTimelineData, so all this
  // needs to do is opt maps in/out and open the print dialog. Maps are static
  // images that load asynchronously, so give them a moment to paint before
  // printing; the plain document needs no such wait.
  const handlePrint = useCallback((option: PrintOption) => {
    const withMaps = option === 'with-maps';
    setPrintWithMaps(withMaps);

    setTimeout(() => {
      window.print();
      // Reset the maps flag after the dialog closes.
      setTimeout(() => setPrintWithMaps(false), 500);
    }, withMaps ? 400 : 50);
  }, []);

  // Check for print action in URL params (triggered from dashboard's Print Itinerary button)
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'print' && !loading && timelineItems.length > 0) {
      // Clear the action param to prevent re-triggering on subsequent renders
      setSearchParams((prev) => {
        const newParams = new URLSearchParams(prev);
        newParams.delete('action');
        return newParams;
      }, { replace: true });

      // Trigger print with standard option (no maps)
      handlePrint('standard');
    }
  }, [searchParams, setSearchParams, loading, timelineItems.length, handlePrint]);

  if (loading) {
    return (
      <div className="text-center py-8 text-gray-900 dark:text-white">Loading timeline...</div>
    );
  }

  if (timelineItems.length === 0) {
    return (
      <EmptyState.Compact
        icon="📅"
        message="No timeline items yet. Add activities, transportation, lodging, or journal entries to see them here."
      />
    );
  }

  // Defensive check: ensure dayGroups is an array before rendering
  if (!Array.isArray(dayGroups)) {
    logger.error('❌ dayGroups is not an array', new Error('Invalid dayGroups'), {
      operation: 'render',
      data: { dayGroupsType: typeof dayGroups, dayGroups }
    });
    return (
      <div className="text-center py-8 text-red-500">
        Error loading timeline. Please refresh the page.
      </div>
    );
  }

  return (
    <div className="timeline-container">
      {/* Filter Bar */}
      <div className="timeline-filter-bar mb-4 print:hidden">
        <TimelineFilters
          visibleTypes={visibleTypes}
          onToggleType={toggleType}
          viewMode={viewMode}
          onToggleViewMode={toggleViewMode}
          onExpandAll={expandAllDays}
          onCollapseAll={collapseAllDays}
          onRefreshWeather={handleRefreshWeather}
          onPrint={handlePrint}
          refreshingWeather={refreshingWeather}
        />
      </div>

      {/* Mobile timezone toggle */}
      {showDualTimezone && (
        <div className="lg:hidden mb-4 print:hidden">
          <MobileTimezoneToggle
            activeTimezone={mobileActiveTimezone}
            tripTimezone={tripTimezone}
            userTimezone={userTimezone}
            onToggle={setMobileActiveTimezone}
          />
        </div>
      )}

      {/* Timeline Content */}
      <div className="timeline-content space-y-4">
        {dayGroups.map((dayGroup) => (
          <TimelineDaySection
            key={dayGroup.dateKey}
            dayGroup={dayGroup}
            tripId={tripId}
            tripTimezone={tripTimezone}
            userTimezone={userTimezone}
            viewMode={viewMode}
            isCollapsed={collapsedDays.has(dayGroup.dateKey)}
            showDualTimezone={!!showDualTimezone}
            mobileActiveTimezone={mobileActiveTimezone}
            linkSummaryMap={summaryMap}
            onToggleCollapse={() => toggleDay(dayGroup.dateKey)}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onLinkUpdate={handleLinkUpdate}
            headerActions={(() => {
              // The group's key is the trip-local day as text; read the calendar day from it.
              const day = displayDayKeyToIso(dayGroup.dateKey);
              return day ? (
                <DayJournalActions
                  day={day}
                  canEdit={dayJournal.canEdit}
                  canDraftOn={dayJournal.canDraftOn}
                  onOpen={dayJournal.open}
                />
              ) : null;
            })()}
          />
        ))}
      </div>
      {dayJournal.composer}

      {/* Printable Itinerary — always mounted (hidden on screen via
          `.print-itinerary-wrapper`, revealed only under `@media print`).
          Mounting it permanently means a native browser print (Ctrl+P, mobile
          "Save as PDF") produces the full itinerary, not a blank page; the
          `@media print` rules hide #root regardless of how print was invoked,
          so the paper version has to already be in the DOM. */}
      {createPortal(
        <div className="print-itinerary-wrapper">
          <PrintableItinerary
            ref={printRef}
            tripTitle={tripTitle || 'Trip Itinerary'}
            tripStartDate={tripStartDate}
            tripEndDate={tripEndDate}
            tripTimezone={tripTimezone}
            tripType={tripType}
            tripTypeEmoji={tripTypeEmoji}
            dayGroups={dayGroups}
            unscheduled={unscheduledData}
            showMaps={printWithMaps}
          />
        </div>,
        document.body
      )}
    </div>
  );
};

export default Timeline;
