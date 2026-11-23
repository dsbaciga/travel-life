import type { ReactNode } from 'react';
import type { Activity } from '../../types/activity';
import type { Transportation } from '../../types/transportation';
import type { Lodging } from '../../types/lodging';
import type { JournalEntry } from '../../types/journalEntry';
import type { CustomItem } from '../../types/customItem';
import type { WeatherDisplay } from '../../types/weather';
import type { EntityLinkSummary } from '../../types/entityLink';
import type { MapsPlace } from '../../lib/mapsDeepLinks';

// Re-export Activity type for use in other timeline components
export type { Activity };

// Activity with linked location info for unscheduled activities display
export interface UnscheduledActivityWithLocation extends Activity {
  linkedLocations?: { id: number; name: string }[];
}

export type TimelineItemType =
  | 'activity'
  | 'transportation'
  | 'lodging'
  | 'journal'
  | 'customItem';

export type TransportationType =
  | 'flight'
  | 'train'
  | 'bus'
  | 'car'
  | 'ferry'
  | 'bicycle'
  | 'walk'
  | 'other';

export interface MultiDayInfo {
  originalId: number;
  nightNumber: number;
  totalNights: number;
}

export interface ConnectionInfo {
  legNumber: number;
  totalLegs: number;
  isFirst: boolean;
  isLast: boolean;
  groupId: string;
}

export interface TimelineItem {
  id: number;
  type: TimelineItemType;
  dateTime: Date;
  endDateTime?: Date;
  title: string;
  subtitle?: string;
  description?: string;
  location?: string;
  /** Street address of `location`, when it differs from the name. */
  locationAddress?: string;
  locationCoords?: { latitude: number; longitude: number };
  cost?: number;
  currency?: string;
  isAllDay?: boolean;
  showCheckInTime?: boolean;
  showCheckOutTime?: boolean;
  startTimezone?: string;
  endTimezone?: string;
  transportationType?: TransportationType;
  vehicleNumber?: string;
  confirmationNumber?: string;
  durationMinutes?: number;
  distanceKm?: number;
  fromCoords?: { latitude: number; longitude: number };
  toCoords?: { latitude: number; longitude: number };
  connectionGroupId?: string;
  multiDayInfo?: MultiDayInfo;
  data: Activity | Transportation | Lodging | JournalEntry | CustomItem;
}

export interface DayStats {
  activities: number;
  transportation: number;
  lodging: number;
  journal: number;
  customItems: number;
  totalPhotosLinked: number;
}

export interface DayGroup {
  dateKey: string;
  dayNumber: number | null;
  items: TimelineItem[];
  weather?: WeatherDisplay;
  stats: DayStats;
  unscheduledActivities?: UnscheduledActivityWithLocation[];
}

// Props interfaces for components
export interface TimelineEventCardProps {
  item: TimelineItem;
  tripId: number;
  tripTimezone?: string;
  userTimezone?: string;
  showDualTime: boolean;
  mobileActiveTimezone?: 'trip' | 'user';
  linkSummary?: EntityLinkSummary;
  viewMode: 'standard' | 'compact';
  connectionInfo?: ConnectionInfo;
  /** Where the stop sits relative to now; drives the gold/muted route marker. */
  routeStop?: 'past' | 'next' | 'future';
  /** Line style down to the next stop's marker; omit for the last stop. */
  routeSegment?: 'solid' | 'dashed';
  /**
   * Where the traveller is coming from — the nearest preceding item on the day
   * that has a usable location. Pre-fills the origin of the Directions link.
   */
  originPlace?: MapsPlace | null;
  onEdit: (item: TimelineItem) => void;
  onDelete: (item: TimelineItem) => void;
  onLinkUpdate: () => void;
}

export interface DayHeaderProps {
  date: string;
  dayNumber: number | null;
  tripTimezone?: string;
  userTimezone?: string;
  weather?: WeatherDisplay;
  stats: DayStats;
  eventCount: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  /** Extra per-day actions shown under the stats (e.g. add a journal entry). */
  actions?: ReactNode;
}

export interface PhotoPreviewPopoverProps {
  tripId: number;
  entityType: 'ACTIVITY' | 'TRANSPORTATION' | 'LODGING' | 'JOURNAL_ENTRY' | 'CUSTOM_ITEM';
  entityId: number;
  photoCount: number;
  onViewAll: () => void;
}

export interface MobileTimezoneToggleProps {
  activeTimezone: 'trip' | 'user';
  tripTimezone?: string;
  userTimezone?: string;
  onToggle: (tz: 'trip' | 'user') => void;
}
