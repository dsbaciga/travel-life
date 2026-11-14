import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Activity } from '../../types/activity';
import type { Location } from '../../types/location';
import type { PhotoAlbum } from '../../types/photo';
import type { WeatherData, WeatherDisplay } from '../../types/weather';
import type { EntityType, TripLinkSummary } from '../../types/entityLink';
import type { DayItem } from './DayItem';
import activityService from '../../services/activity.service';
import transportationService from '../../services/transportation.service';
import lodgingService from '../../services/lodging.service';
import journalService from '../../services/journalEntry.service';
import locationService from '../../services/location.service';
import photoService from '../../services/photo.service';
import entityLinkService from '../../services/entityLink.service';
import weatherService from '../../services/weather.service';
import { getWeatherIcon } from '../../utils/weatherIcons';
import { parseDateOnlyAsLocal } from '../../utils/timezone';
import DayNavigator from './DayNavigator';
import ActivityCard from './ActivityCard';
import TransportationCard from './TransportationCard';
import LodgingCard from './LodgingCard';
import JournalCard from './JournalCard';
import CustomItemCard from './CustomItemCard';
import EmptyDayPlaceholder from './EmptyDayPlaceholder';
import PrintableDayItinerary from './PrintableDayItinerary';
import customItemService from '../../services/customItem.service';
import {
  isActivity,
  isLodging,
  isTransportation,
  isLocation,
  isCustomItem,
  placeFromCustomItem,
} from './utils';
import {
  placeFromActivity,
  placeFromLodging,
  placeFromLocation,
  placeFromTransportation,
} from '../../lib/itineraryPlaces';
import { pickPreviousPlace, type MapsPlace } from '../../lib/mapsDeepLinks';

// Type for linked locations map: "ENTITY_TYPE:entityId" -> Location[]
type LinkedLocationsMap = Record<string, Location[]>;
// Type for linked albums map: "ENTITY_TYPE:entityId" -> PhotoAlbum[]
type LinkedAlbumsMap = Record<string, PhotoAlbum[]>;
// Type for entity-location ID map: "ENTITY_TYPE:entityId" -> locationId[]
type EntityLocationIdsMap = Record<string, number[]>;
// Type for location hierarchy maps
type LocationParentMap = Record<number, number | null>; // locationId -> parentId
type LocationChildrenMap = Record<number, number[]>; // parentId -> childIds[]

// Unscheduled activity with linked location info for display
interface UnscheduledActivityWithLocation extends Activity {
  linkedLocations?: { id: number; name: string }[];
}

interface DailyViewProps {
  tripId: number;
  tripTitle?: string;
  tripTimezone?: string;
  userTimezone?: string;
  tripStartDate?: string;
  tripEndDate?: string;
  onRefresh?: () => void;
}

interface DayData {
  dayNumber: number;
  dateKey: string;
  displayDate: string;
  items: DayItem[];
  weather?: WeatherDisplay;
  unscheduledActivities?: UnscheduledActivityWithLocation[];
}

export default function DailyView({
  tripId,
  tripTitle,
  tripTimezone,
  tripStartDate,
  tripEndDate,
}: DailyViewProps) {
  const [currentDayIndex, setCurrentDayIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allDays, setAllDays] = useState<DayData[]>([]);
  const [isPrinting, setIsPrinting] = useState(false);
  const [linkedLocationsMap, setLinkedLocationsMap] = useState<LinkedLocationsMap>({});
  const [linkedAlbumsMap, setLinkedAlbumsMap] = useState<LinkedAlbumsMap>({});
  // Note: These state variables store computed data that may be used in future features
  // The setters are called but values are currently unused (data is embedded in DayData instead)
  const [, setUnscheduledActivities] = useState<Activity[]>([]);
  const [, setActivityLocationMap] = useState<Record<number, number[]>>({});
  const [, setEntityLocationIdsMap] = useState<EntityLocationIdsMap>({});
  const [, setLocationLookup] = useState<Record<number, { id: number; name: string }>>({});

  // Generate all trip dates
  const generateAllTripDates = useCallback((): { dayNumber: number; dateKey: string; displayDate: string; date: Date }[] => {
    if (!tripStartDate || !tripEndDate) return [];

    const parseLocalDate = (dateStr: string): { year: number; month: number; day: number } => {
      const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        return {
          year: parseInt(match[1], 10),
          month: parseInt(match[2], 10) - 1,
          day: parseInt(match[3], 10),
        };
      }
      const d = new Date(dateStr);
      return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
    };

    const startParts = parseLocalDate(tripStartDate);
    const endParts = parseLocalDate(tripEndDate);

    const dates: { dayNumber: number; dateKey: string; displayDate: string; date: Date }[] = [];
    const current = new Date(startParts.year, startParts.month, startParts.day, 12, 0, 0);
    const endDate = new Date(endParts.year, endParts.month, endParts.day, 12, 0, 0);

    const dateKeyFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tripTimezone,
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    const displayFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tripTimezone,
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    let dayNumber = 1;
    while (current <= endDate) {
      dates.push({
        dayNumber,
        dateKey: dateKeyFormatter.format(current),
        displayDate: displayFormatter.format(current),
        date: new Date(current),
      });
      current.setDate(current.getDate() + 1);
      dayNumber++;
      if (dates.length > 1000) break; // Safety limit
    }

    return dates;
  }, [tripStartDate, tripEndDate, tripTimezone]);

  // Get date string for comparison
  const getDateString = useCallback((date: Date | string): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tripTimezone,
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(d);
  }, [tripTimezone]);

  // Helper to build entity key
  const getEntityKey = useCallback((entityType: EntityType, entityId: number): string => {
    return `${entityType}:${entityId}`;
  }, []);

  // Load all data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch all data including entity links and weather in parallel
        const [activities, transportation, lodging, journal, locations, customItems, albumsResult, linkSummary, weather, locationLinks] = await Promise.all([
          activityService.getActivitiesByTrip(tripId),
          transportationService.getTransportationByTrip(tripId),
          lodgingService.getLodgingByTrip(tripId),
          journalService.getJournalEntriesByTrip(tripId),
          locationService.getLocationsByTrip(tripId),
          customItemService.getCustomItemsByTrip(tripId).catch(() => []),
          photoService.getAlbumsByTrip(tripId).catch(() => ({ albums: [] as PhotoAlbum[] })),
          entityLinkService.getTripLinkSummary(tripId).catch((): TripLinkSummary => ({})),
          weatherService.getWeatherForTrip(tripId).catch(() => [] as WeatherData[]),
          entityLinkService.getLinksByTargetType(tripId, 'LOCATION').catch(() => []),
        ]);

        const albums = albumsResult.albums;

        // Build entity-to-location IDs map from the bulk fetch (for unscheduled activity matching)
        const entityLocIdsMap: EntityLocationIdsMap = {};
        if (Array.isArray(locationLinks)) {
          for (const link of locationLinks) {
            const key = `${link.sourceType}:${link.sourceId}`;
            if (!entityLocIdsMap[key]) {
              entityLocIdsMap[key] = [];
            }
            entityLocIdsMap[key].push(link.targetId);
          }
        }
        setEntityLocationIdsMap(entityLocIdsMap);

        // Build location lookup map for displaying location names
        const locLookup: Record<number, { id: number; name: string }> = {};
        // Build location hierarchy maps
        const locationParentMap: LocationParentMap = {};
        const locationChildrenMap: LocationChildrenMap = {};
        if (Array.isArray(locations)) {
          for (const loc of locations) {
            locLookup[loc.id] = { id: loc.id, name: loc.name };
            locationParentMap[loc.id] = loc.parentId;
            // Build children map
            if (loc.parentId) {
              if (!locationChildrenMap[loc.parentId]) {
                locationChildrenMap[loc.parentId] = [];
              }
              locationChildrenMap[loc.parentId].push(loc.id);
            }
          }
        }
        setLocationLookup(locLookup);

        // Helper to get all related location IDs for hierarchy matching
        // Returns: direct IDs + sibling IDs + parent IDs + children IDs
        const getRelatedLocationIds = (locationIds: Set<number>): Set<number> => {
          const related = new Set<number>();

          locationIds.forEach((locId) => {
            // Add the location itself
            related.add(locId);

            // Add parent location
            const parentId = locationParentMap[locId];
            if (parentId) {
              related.add(parentId);

              // Add siblings (other children of the same parent)
              const siblings = locationChildrenMap[parentId] || [];
              siblings.forEach((sibId) => related.add(sibId));
            }

            // Add children locations
            const children = locationChildrenMap[locId] || [];
            children.forEach((childId) => related.add(childId));
          });

          return related;
        };

        // Identify unscheduled activities and build activity-location map
        const unscheduled: Activity[] = [];
        const actLocMap: Record<number, number[]> = {};
        if (Array.isArray(activities)) {
          for (const activity of activities) {
            if (!activity) continue;
            // An activity is unscheduled if it has no startTime and is not allDay
            if (!activity.startTime && !activity.allDay) {
              unscheduled.push(activity);
              // Get linked locations for this unscheduled activity
              const linkedLocs = entityLocIdsMap[`ACTIVITY:${activity.id}`];
              if (linkedLocs && linkedLocs.length > 0) {
                actLocMap[activity.id] = linkedLocs;
              }
            }
          }
        }
        setUnscheduledActivities(unscheduled);
        setActivityLocationMap(actLocMap);

        // Process weather data into a map by date key
        const processedWeather: Record<string, WeatherDisplay> = {};
        if (Array.isArray(weather)) {
          weather.forEach((w) => {
            if (w && w.date) {
              // Parse the date as a local date to avoid timezone shifts
              const dateStr = typeof w.date === 'string'
                ? w.date.split('T')[0]
                : new Date(w.date).toISOString().split('T')[0];
              const [year, month, day] = dateStr.split('-').map(Number);
              const localDate = new Date(year, month - 1, day, 12, 0, 0);
              const dateKey = getDateString(localDate);
              processedWeather[dateKey] = {
                date: w.date,
                high: w.temperatureHigh,
                low: w.temperatureLow,
                conditions: w.conditions,
                icon: getWeatherIcon(w.conditions),
                precipitation: w.precipitation,
                humidity: w.humidity,
                windSpeed: w.windSpeed,
                locationName: w.locationName,
                sunrise: w.sunrise,
                sunset: w.sunset,
              };
            }
          });
        }

        // Build linked locations and albums maps by fetching links for entities
        const locationsMap: LinkedLocationsMap = {};
        const albumsMap: LinkedAlbumsMap = {};
        const entityTypes: EntityType[] = ['ACTIVITY', 'TRANSPORTATION', 'LODGING', 'JOURNAL_ENTRY'];

        // Get all entities that have location or album links based on link summary
        const linkFetchPromises: Promise<void>[] = [];

        for (const [, summary] of Object.entries(linkSummary)) {
          const entityType = summary.entityType;
          const entityId = summary.entityId;

          if (!entityTypes.includes(entityType)) continue;

          // Fetch location links
          if (summary.linkCounts.LOCATION && summary.linkCounts.LOCATION > 0) {
            linkFetchPromises.push(
              entityLinkService.getLinksFrom(tripId, entityType, entityId, 'LOCATION')
                .then((links) => {
                  const locationIds = links
                    .filter((link) => link.targetType === 'LOCATION')
                    .map((link) => link.targetId);
                  const linkedLocs = locations.filter((loc) => locationIds.includes(loc.id));
                  if (linkedLocs.length > 0) {
                    locationsMap[getEntityKey(entityType, entityId)] = linkedLocs;
                  }
                })
                .catch(() => {
                  // Silently ignore individual link fetch failures
                })
            );
          }

          // Fetch album links
          if (summary.linkCounts.PHOTO_ALBUM && summary.linkCounts.PHOTO_ALBUM > 0) {
            linkFetchPromises.push(
              entityLinkService.getLinksFrom(tripId, entityType, entityId, 'PHOTO_ALBUM')
                .then((links) => {
                  const albumIds = links
                    .filter((link) => link.targetType === 'PHOTO_ALBUM')
                    .map((link) => link.targetId);
                  const linkedAlbums = albums.filter((album) => albumIds.includes(album.id));
                  if (linkedAlbums.length > 0) {
                    albumsMap[getEntityKey(entityType, entityId)] = linkedAlbums;
                  }
                })
                .catch(() => {
                  // Silently ignore individual link fetch failures
                })
            );
          }
        }

        // Wait for all link fetches to complete
        await Promise.all(linkFetchPromises);
        setLinkedLocationsMap(locationsMap);
        setLinkedAlbumsMap(albumsMap);

        const tripDates = generateAllTripDates();
        const dayDataMap: Record<string, DayItem[]> = {};

        // Initialize all days
        tripDates.forEach(({ dateKey }) => {
          dayDataMap[dateKey] = [];
        });

        // Add activities
        activities.forEach((activity) => {
          if (activity.startTime || activity.allDay) {
            const dateKey = activity.startTime
              ? getDateString(activity.startTime)
              : tripDates[0]?.dateKey;
            if (dateKey && dayDataMap[dateKey]) {
              dayDataMap[dateKey].push({
                type: 'activity',
                dateTime: activity.startTime
                  ? new Date(activity.startTime)
                  : new Date(tripDates[0].date),
                data: activity,
              });
            }
          }
        });

        // Add transportation
        transportation.forEach((trans) => {
          if (trans.departureTime) {
            const dateKey = getDateString(trans.departureTime);
            if (dayDataMap[dateKey]) {
              dayDataMap[dateKey].push({
                type: 'transportation',
                dateTime: new Date(trans.departureTime),
                data: trans,
              });
            }
          }
        });

        // Add lodging - appears on each day from check-in to check-out
        lodging.forEach((lodge) => {
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

            const checkInDate = new Date(checkInYear, checkInMonth - 1, checkInDay, 12, 0, 0);
            const checkOutDate = new Date(checkOutYear, checkOutMonth - 1, checkOutDay, 12, 0, 0);

            const totalNights = Math.round(
              (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24)
            );

            const current = new Date(checkInDate);
            let nightNumber = 1;

            while (current <= checkOutDate) {
              const dateKey = getDateString(current);
              const isCheckInDay = current.getTime() === checkInDate.getTime();
              const isCheckOutDay = current.getTime() === checkOutDate.getTime();

              if (dayDataMap[dateKey]) {
                dayDataMap[dateKey].push({
                  type: 'lodging',
                  dateTime: isCheckInDay
                    ? new Date(lodge.checkInDate)
                    : isCheckOutDay
                    ? new Date(lodge.checkOutDate)
                    : new Date(current),
                  data: lodge,
                  lodgingContext: {
                    isCheckInDay,
                    isCheckOutDay,
                    nightNumber: isCheckOutDay ? undefined : nightNumber,
                    totalNights: totalNights > 1 ? totalNights : undefined,
                  },
                });
              }

              if (!isCheckOutDay) {
                nightNumber++;
              }
              current.setDate(current.getDate() + 1);
            }
          } else if (lodge.checkInDate) {
            const dateKey = getDateString(lodge.checkInDate);
            if (dayDataMap[dateKey]) {
              dayDataMap[dateKey].push({
                type: 'lodging',
                dateTime: new Date(lodge.checkInDate),
                data: lodge,
                lodgingContext: {
                  isCheckInDay: true,
                  isCheckOutDay: false,
                },
              });
            }
          }
        });

        // Add journal entries (only standalone ones without activity/lodging/transportation links)
        journal.forEach((entry) => {
          if (entry.date) {
            // Only include standalone journal entries - check entity links via link summary
            const journalKey = `JOURNAL_ENTRY:${entry.id}`;
            const journalLinkSummary = linkSummary[journalKey];
            const hasActivityLinks = (journalLinkSummary?.linkCounts?.ACTIVITY ?? 0) > 0;
            const hasLodgingLinks = (journalLinkSummary?.linkCounts?.LODGING ?? 0) > 0;
            const hasTransportationLinks = (journalLinkSummary?.linkCounts?.TRANSPORTATION ?? 0) > 0;

            if (!hasActivityLinks && !hasLodgingLinks && !hasTransportationLinks) {
              // Use parseDateOnlyAsLocal to avoid UTC timezone shift issues.
              // Journal entry dates are stored as date-only in the database (e.g., "2025-01-15").
              // When parsed with new Date(), JavaScript interprets this as midnight UTC,
              // which shifts to the previous day in timezones west of UTC.
              const journalDate = parseDateOnlyAsLocal(entry.date);
              const dateKey = getDateString(journalDate);
              if (dayDataMap[dateKey]) {
                dayDataMap[dateKey].push({
                  type: 'journal',
                  dateTime: journalDate,
                  data: entry,
                });
              }
            }
          }
        });

        // Add locations with visit dates
        locations.forEach((location) => {
          if (location.visitDatetime) {
            const dateKey = getDateString(location.visitDatetime);
            if (dayDataMap[dateKey]) {
              dayDataMap[dateKey].push({
                type: 'location',
                dateTime: new Date(location.visitDatetime),
                data: location,
              });
            }
          }
        });

        // Add custom items that have a start time. Undated ones have no day to
        // sit on and stay visible in the Custom tab instead.
        customItems.forEach((item) => {
          if (item.startTime) {
            const dateKey = getDateString(item.startTime);
            if (dayDataMap[dateKey]) {
              dayDataMap[dateKey].push({
                type: 'customItem',
                dateTime: new Date(item.startTime),
                data: item,
              });
            }
          }
        });

        // Helper to get location IDs from scheduled items on a day
        const getLocationIdsFromItems = (items: DayItem[]): Set<number> => {
          const locationIds = new Set<number>();
          items.forEach((item) => {
            if (item.type === 'activity') {
              const activity = item.data;
              const linkedLocs = entityLocIdsMap[`ACTIVITY:${activity.id}`];
              if (linkedLocs) {
                linkedLocs.forEach(locId => locationIds.add(locId));
              }
            } else if (item.type === 'lodging') {
              const lodgingItem = item.data;
              const linkedLocs = entityLocIdsMap[`LODGING:${lodgingItem.id}`];
              if (linkedLocs) {
                linkedLocs.forEach(locId => locationIds.add(locId));
              }
            } else if (item.type === 'transportation') {
              const trans = item.data;
              // Transportation has direct FK references
              if (trans.fromLocationId) {
                locationIds.add(trans.fromLocationId);
              }
              if (trans.toLocationId) {
                locationIds.add(trans.toLocationId);
              }
              // Also check entity links for transportation
              const linkedLocs = entityLocIdsMap[`TRANSPORTATION:${trans.id}`];
              if (linkedLocs) {
                linkedLocs.forEach(locId => locationIds.add(locId));
              }
            } else if (item.type === 'journal') {
              const journal = item.data;
              const linkedLocs = entityLocIdsMap[`JOURNAL_ENTRY:${journal.id}`];
              if (linkedLocs) {
                linkedLocs.forEach(locId => locationIds.add(locId));
              }
            } else if (item.type === 'location') {
              const loc = item.data;
              locationIds.add(loc.id);
            }
          });
          return locationIds;
        };

        // Helper to get unscheduled activities for a day based on linked locations
        // Uses location hierarchy matching:
        // 1. Direct match: unscheduled activity's location matches scheduled item's location
        // 2. Sibling match: both locations share the same parent
        // 3. Parent match: scheduled item is at parent location of unscheduled's location
        // 4. Child match: scheduled item is at child location of unscheduled's location
        const getUnscheduledActivitiesForDay = (items: DayItem[]): UnscheduledActivityWithLocation[] => {
          const dayLocationIds = getLocationIdsFromItems(items);

          if (dayLocationIds.size === 0) {
            return [];
          }

          // Expand day's location IDs to include related locations (parent, siblings, children)
          const expandedDayLocationIds = getRelatedLocationIds(dayLocationIds);

          const matched = unscheduled
            .filter((activity) => {
              const linkedLocationIds = actLocMap[activity.id] || [];
              if (linkedLocationIds.length === 0) return false;

              // Check if any of the activity's linked locations match the expanded set
              // This includes: direct match, sibling match, parent match, child match
              for (const actLocId of linkedLocationIds) {
                // Direct match with expanded set
                if (expandedDayLocationIds.has(actLocId)) {
                  return true;
                }

                // Also check if the activity's location's parent/children overlap with day's locations
                const activityRelatedIds = getRelatedLocationIds(new Set([actLocId]));
                for (const relatedId of activityRelatedIds) {
                  if (dayLocationIds.has(relatedId)) {
                    return true;
                  }
                }
              }
              return false;
            })
            .map((activity): UnscheduledActivityWithLocation => {
              const linkedLocationIds = actLocMap[activity.id] || [];
              const linkedLocs = linkedLocationIds
                .map((locId) => locLookup[locId])
                .filter(Boolean);
              return {
                ...activity,
                linkedLocations: linkedLocs.length > 0 ? linkedLocs : undefined,
              };
            });

          return matched;
        };

        // Build final day data array
        const daysData: DayData[] = tripDates.map(({ dayNumber, dateKey, displayDate }) => {
          const items = dayDataMap[dateKey] || [];
          // Sort items chronologically
          items.sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());

          // Get unscheduled activities linked to locations on this day
          const dayUnscheduled = getUnscheduledActivitiesForDay(items);

          return {
            dayNumber,
            dateKey,
            displayDate,
            items,
            weather: processedWeather[dateKey],
            unscheduledActivities: dayUnscheduled.length > 0 ? dayUnscheduled : undefined,
          };
        });

        setAllDays(daysData);
      } catch (err) {
        console.error('Error loading daily view data:', err);
        setError('Failed to load trip data. Please try refreshing the page.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [tripId, generateAllTripDates, getEntityKey, getDateString]);

  // Current day data
  const currentDay = allDays[currentDayIndex];

  // Handle day change
  const handleDayChange = (dayNumber: number) => {
    setCurrentDayIndex(dayNumber - 1);
  };

  // Format dates for navigator
  const navigatorDates = useMemo(
    () =>
      allDays.map((day) => ({
        dayNumber: day.dayNumber,
        dateKey: day.dateKey,
        displayDate: day.displayDate,
      })),
    [allDays]
  );

  // Helper to get linked locations for an entity
  const getLinkedLocations = useCallback((entityType: EntityType, entityId: number): Location[] => {
    const key = getEntityKey(entityType, entityId);
    return linkedLocationsMap[key] || [];
  }, [linkedLocationsMap, getEntityKey]);

  // Helper to get linked albums for an entity
  const getLinkedAlbums = useCallback((entityType: EntityType, entityId: number): PhotoAlbum[] => {
    const key = getEntityKey(entityType, entityId);
    return linkedAlbumsMap[key] || [];
  }, [linkedAlbumsMap, getEntityKey]);

  // Where each item of the day leaves the traveller. The next item's Directions
  // link starts from the nearest preceding one that has a usable place, so a
  // restaurant routes from the hotel rather than from nowhere.
  const dayEndPlaces = useMemo<Array<MapsPlace | null>>(() => {
    const items = currentDay?.items ?? [];
    return items.map((item) => {
      const data = item.data;
      if (isTransportation(data)) {
        // A leg drops you at its arrival point.
        return placeFromTransportation(data, 'to') ?? placeFromTransportation(data, 'from');
      }
      if (isLodging(data)) {
        return placeFromLodging(data, getLinkedLocations('LODGING', data.id));
      }
      if (isActivity(data)) {
        return placeFromActivity(data, getLinkedLocations('ACTIVITY', data.id));
      }
      if (isLocation(data)) {
        return placeFromLocation(data);
      }
      if (isCustomItem(data)) {
        return placeFromCustomItem(data);
      }
      // Journal entries are not places.
      return null;
    });
  }, [currentDay, getLinkedLocations]);

  // Print handler for current day
  const handlePrint = useCallback(() => {
    if (!currentDay) return;

    // Set printing state to render the printable component
    setIsPrinting(true);

    // Use requestAnimationFrame to ensure DOM is updated before printing
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
        // Reset printing state after print dialog closes
        setIsPrinting(false);
      });
    });
  }, [currentDay]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600 dark:text-dusk-400">Loading day view...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Error Loading Data</h3>
        <p className="text-gray-500 dark:text-dusk-400 max-w-md">{error}</p>
      </div>
    );
  }

  if (allDays.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-dusk-400">
        <p>No trip dates defined. Please set trip start and end dates.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Day Navigator */}
      <DayNavigator
        currentDay={currentDay?.dayNumber || 1}
        totalDays={allDays.length}
        currentDate={currentDay?.displayDate || ''}
        onDayChange={handleDayChange}
        allDates={navigatorDates}
        weather={currentDay?.weather}
        tripTimezone={tripTimezone}
        onPrint={handlePrint}
      />

      {/* Day Content */}
      <div className="space-y-4">
        {currentDay?.items.length === 0 ? (
          <div className="bg-white dark:bg-dusk-800 rounded-lg shadow-sm border border-gray-200 dark:border-dusk-700">
            <EmptyDayPlaceholder
              tripId={tripId}
              dayNumber={currentDay.dayNumber}
            />
          </div>
        ) : (
          currentDay?.items.map((item, index) => {
            // Origin = the nearest earlier item of the day with a real place.
            const originPlace = pickPreviousPlace(dayEndPlaces, index);
            switch (item.type) {
              case 'activity': {
                const activity = item.data;
                return (
                  <ActivityCard
                    key={`activity-${activity.id}`}
                    activity={activity}
                    tripId={tripId}
                    tripTimezone={tripTimezone}
                    linkedLocations={getLinkedLocations('ACTIVITY', activity.id)}
                    linkedAlbums={getLinkedAlbums('ACTIVITY', activity.id)}
                    currentDate={item.dateTime}
                    originPlace={originPlace}
                  />
                );
              }
              case 'transportation': {
                const transportation = item.data;
                return (
                  <TransportationCard
                    key={`transportation-${transportation.id}`}
                    transportation={transportation}
                    tripId={tripId}
                    tripTimezone={tripTimezone}
                    linkedLocations={getLinkedLocations('TRANSPORTATION', transportation.id)}
                    linkedAlbums={getLinkedAlbums('TRANSPORTATION', transportation.id)}
                    currentDate={item.dateTime}
                    originPlace={originPlace}
                  />
                );
              }
              case 'lodging': {
                const lodging = item.data;
                return (
                  <LodgingCard
                    key={`lodging-${lodging.id}-${item.lodgingContext?.nightNumber || 0}`}
                    lodging={lodging}
                    tripId={tripId}
                    tripTimezone={tripTimezone}
                    dayContext={item.lodgingContext}
                    linkedLocations={getLinkedLocations('LODGING', lodging.id)}
                    linkedAlbums={getLinkedAlbums('LODGING', lodging.id)}
                    currentDate={item.dateTime}
                    originPlace={originPlace}
                  />
                );
              }
              case 'journal': {
                const journal = item.data;
                return (
                  <JournalCard
                    key={`journal-${journal.id}`}
                    journal={journal}
                    tripId={tripId}
                    tripTimezone={tripTimezone}
                    linkedLocations={getLinkedLocations('JOURNAL_ENTRY', journal.id)}
                    linkedAlbums={getLinkedAlbums('JOURNAL_ENTRY', journal.id)}
                    currentDate={item.dateTime}
                  />
                );
              }
              case 'customItem': {
                const customItem = item.data;
                return (
                  <CustomItemCard
                    key={`customItem-${customItem.id}`}
                    item={customItem}
                    tripId={tripId}
                    tripTimezone={tripTimezone}
                    currentDate={item.dateTime}
                    originPlace={originPlace}
                  />
                );
              }
              default:
                return null;
            }
          })
        )}

        {/* Unscheduled Activities Section */}
        {currentDay?.unscheduledActivities && currentDay.unscheduledActivities.length > 0 && (
          <div className="bg-white dark:bg-dusk-800 rounded-lg shadow-sm border border-gray-200 dark:border-dusk-700 p-4">
            <div className="flex items-center gap-2 mb-4">
              <svg
                className="w-5 h-5 text-amber-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-dusk-300">
                Unscheduled Activities
              </h3>
              <span className="text-xs text-gray-500 dark:text-dusk-400 bg-gray-100 dark:bg-dusk-700 px-2 py-0.5 rounded-full">
                {currentDay.unscheduledActivities.length}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-dusk-400 mb-4">
              These activities are linked to locations on this day but don't have scheduled times.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {currentDay.unscheduledActivities.map((activity) => (
                <div
                  key={`unscheduled-${activity.id}`}
                  className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-200 dark:border-amber-800/30"
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <svg
                      className="w-4 h-4 text-amber-600 dark:text-amber-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                      />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {activity.name}
                    </h4>
                    {activity.category && (
                      <p className="text-xs text-gray-500 dark:text-dusk-400 mt-0.5">
                        {activity.category}
                      </p>
                    )}
                    {activity.linkedLocations && activity.linkedLocations.length > 0 && (
                      <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-600 dark:text-dusk-400">
                        <svg
                          className="w-3 h-3 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                        <span className="truncate">
                          {activity.linkedLocations.map(loc => loc.name).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Print Portal - renders printable day itinerary when printing */}
      {isPrinting &&
        currentDay &&
        createPortal(
          <div className="print-itinerary-wrapper">
            <PrintableDayItinerary
              tripTitle={tripTitle || 'Trip Itinerary'}
              tripTimezone={tripTimezone}
              dayNumber={currentDay.dayNumber}
              displayDate={currentDay.displayDate}
              items={currentDay.items}
              weather={currentDay.weather}
              unscheduledActivities={currentDay.unscheduledActivities}
            />
          </div>,
          document.body
        )}
    </div>
  );
}
