import Icon from '../ui/Icon';
import { useMemo } from "react";
import type { TabGroupItem } from "../TabGroup";
import { TripStatus, type TripStatusType } from "../../types/trip";

export type TabId =
  | "dashboard"
  | "itinerary"
  | "timeline"
  | "daily"
  | "trip-map"
  | "route-planner"
  | "locations"
  | "photos"
  | "photo-map"
  | "photo-timeline"
  | "journal"
  | "activities"
  | "transportation"
  | "lodging"
  | "budget"
  | "food-log"
  | "deadlines"
  | "links"
  | "custom"
  | "unscheduled"
  | "companions"
  | "emergency"
  | "local-norms";

const VALID_TAB_IDS = new Set<string>([
  "dashboard",
  "itinerary",
  "timeline",
  "daily",
  "trip-map",
  "route-planner",
  "locations",
  "photos",
  "photo-map",
  "photo-timeline",
  "journal",
  "activities",
  "transportation",
  "lodging",
  "budget",
  "food-log",
  "deadlines",
  "links",
  "custom",
  "unscheduled",
  "companions",
  "emergency",
  "local-norms",
]);

export function isTabId(value: string | null | undefined): value is TabId {
  return value != null && VALID_TAB_IDS.has(value);
}

const VALID_TRIP_STATUSES = new Set<string>(Object.values(TripStatus));

export function isTripStatusType(value: string): value is TripStatusType {
  return VALID_TRIP_STATUSES.has(value);
}

interface TripTabCounts {
  activitiesCount: number;
  transportationCount: number;
  lodgingCount: number;
  savedLinksCount: number;
  customItemsCount: number;
  unscheduledCount: number;
  totalPhotosCount: number;
  journalCount: number;
  locationsCount: number;
  companionsCount: number;
}

/**
 * The six trip sections. Itinerary holds the views of the trip over
 * time; Plans holds the lists of what is in it (places, activities and
 * the unscheduled ones, transport, lodging, links, custom items). Group ids ("plans",
 * "essentials" and the "-group" ones) only name a group of sub-tabs; they
 * are never a `TabId` and never appear in `?tab=`. Sections with a single
 * view use that view's `TabId` directly.
 */
export function useTripTabGroups({
  activitiesCount,
  transportationCount,
  lodgingCount,
  savedLinksCount,
  customItemsCount,
  unscheduledCount,
  totalPhotosCount,
  journalCount,
  locationsCount,
  companionsCount,
}: TripTabCounts): TabGroupItem[] {
  return useMemo(
    () => [
      {
        id: "dashboard",
        label: "Overview",
        icon: (
          <Icon name="dashboard" className="w-full h-full" />
        ),
      },
      {
        id: "itinerary-group",
        label: "Itinerary",
        icon: (
          <Icon name="route" className="w-full h-full" />
        ),
        subTabs: [
          {
            id: "itinerary",
            label: "Day Plan",
            icon: (
              <Icon name="list" className="w-full h-full" />
            ),
          },
          {
            id: "timeline",
            label: "Timeline",
            icon: (
              <Icon name="history" className="w-full h-full" />
            ),
          },
          {
            id: "daily",
            label: "Day By Day",
            icon: (
              <Icon name="calendar" className="w-full h-full" />
            ),
          },
          {
            id: "trip-map",
            label: "Trip Map",
            icon: (
              <Icon name="map" className="w-full h-full" />
            ),
          },
          {
            id: "route-planner",
            label: "Route Planner",
            icon: (
              <Icon name="directions" className="w-full h-full" />
            ),
          },
        ],
      },
      {
        id: "photos-group",
        label: "Photos",
        icon: (
          <Icon name="photos" className="w-full h-full" />
        ),
        subTabs: [
          {
            id: "photos",
            label: "Photos",
            count: totalPhotosCount,
            icon: (
              <Icon name="photo" className="w-full h-full" />
            ),
          },
          {
            id: "photo-map",
            label: "Photo Map",
            icon: (
              <Icon name="map" className="w-full h-full" />
            ),
          },
          {
            id: "photo-timeline",
            label: "Photo Timeline",
            icon: (
              <Icon name="schedule" className="w-full h-full" />
            ),
          },
        ],
      },
      {
        id: "plans",
        label: "Plans",
        icon: (
          <Icon name="list" className="w-full h-full" />
        ),
        subTabs: [
          {
            id: "locations",
            label: "Places",
            icon: (
              <Icon name="place" className="w-full h-full" />
            ),
            count: locationsCount,
          },
          {
            id: "activities",
            label: "Activities",
            count: activitiesCount,
            icon: (
              <Icon name="activity" className="w-full h-full" />
            ),
          },
          {
            id: "unscheduled",
            label: "Unscheduled",
            count: unscheduledCount,
            excludeFromGroupCount: true,
            icon: (
              <Icon name="pending" className="w-full h-full" />
            ),
          },
          {
            id: "transportation",
            label: "Transport",
            count: transportationCount,
            icon: (
              <Icon name="transportation" className="w-full h-full" />
            ),
          },
          {
            id: "lodging",
            label: "Stays",
            count: lodgingCount,
            icon: (
              <Icon name="lodging" className="w-full h-full" />
            ),
          },
          {
            id: "links",
            label: "Links",
            count: savedLinksCount,
            icon: (
              <Icon name="link" className="w-full h-full" />
            ),
          },
          {
            id: "custom",
            label: "Custom",
            count: customItemsCount,
            icon: (
              <Icon name="custom" className="w-full h-full" />
            ),
          },
        ],
      },
      {
        id: "journal-group",
        label: "Journal",
        icon: (
          <Icon name="journal" className="w-full h-full" />
        ),
        subTabs: [
          {
            id: "journal",
            label: "Journal",
            count: journalCount,
            icon: (
              <Icon name="journal" className="w-full h-full" />
            ),
          },
          {
            id: "food-log",
            label: "Food Log",
            icon: (
              <Icon name="foodLog" className="w-full h-full" />
            ),
          },
        ],
      },
      {
        id: "essentials",
        label: "Essentials",
        icon: (
          <Icon name="checklist" className="w-full h-full" />
        ),
        subTabs: [
          {
            id: "budget",
            label: "Budget",
            icon: (
              <Icon name="wallet" className="w-full h-full" />
            ),
          },
          {
            id: "deadlines",
            label: "Deadlines",
            icon: (
              <Icon name="notification" className="w-full h-full" />
            ),
          },
          {
            id: "companions",
            label: "Companions",
            icon: (
              <Icon name="users" className="w-full h-full" />
            ),
            count: companionsCount,
          },
          {
            id: "emergency",
            label: "Emergency",
            icon: (
              <Icon name="emergency" className="w-full h-full" />
            ),
          },
          {
            id: "local-norms",
            label: "Local Norms",
            icon: (
              <Icon name="globe" className="w-full h-full" />
            ),
          },
        ],
      },
    ],
    [
      activitiesCount,
      transportationCount,
      lodgingCount,
      savedLinksCount,
      customItemsCount,
      unscheduledCount,
      totalPhotosCount,
      journalCount,
      locationsCount,
      companionsCount,
    ]
  );
}
