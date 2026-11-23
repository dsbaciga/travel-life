import Icon from '../ui/Icon';
import type { Activity } from '../../types/activity';
import type { WeatherDisplay } from '../../types/weather';
import MarkdownRenderer from '../MarkdownRenderer';
import { formatCurrency } from '../../utils/formatCurrency';

import type { DayItem } from './DayItem';

// Unscheduled activity with linked location info
interface UnscheduledActivityWithLocation extends Activity {
  linkedLocations?: { id: number; name: string }[];
}

interface PrintableDayItineraryProps {
  tripTitle: string;
  tripTimezone?: string;
  dayNumber: number;
  displayDate: string;
  items: DayItem[];
  weather?: WeatherDisplay;
  unscheduledActivities?: UnscheduledActivityWithLocation[];
}

// Format time from Date
const formatTime = (dateTime: Date | string | null | undefined, timezone?: string): string => {
  if (!dateTime) return '';
  const date = typeof dateTime === 'string' ? new Date(dateTime) : dateTime;
  if (isNaN(date.getTime())) return '';

  try {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone,
    });
  } catch {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }
};

// Format currency (shared guarded helper — unknown codes must not throw)
const formatCost = formatCurrency;

// Get transportation type display name
const getTransportTypeName = (type: string): string => {
  const names: Record<string, string> = {
    flight: 'Flight',
    train: 'Train',
    bus: 'Bus',
    car: 'Car',
    ferry: 'Ferry',
    bicycle: 'Bicycle',
    walk: 'Walking',
    other: 'Other',
  };
  return names[type] || type;
};

// Get lodging type display name
const getLodgingTypeName = (type: string): string => {
  const names: Record<string, string> = {
    hotel: 'Hotel',
    hostel: 'Hostel',
    airbnb: 'Airbnb',
    vacation_rental: 'Vacation Rental',
    camping: 'Camping',
    resort: 'Resort',
    motel: 'Motel',
    bed_and_breakfast: 'B&B',
    apartment: 'Apartment',
    friends_family: 'Friends/Family',
    other: 'Other',
  };
  return names[type] || type;
};

// Render activity item
const ActivityItemPrint = ({ item, timezone }: { item: Extract<DayItem, { type: 'activity' }>; timezone?: string }) => {
  const activity = item.data;
  const startTime = formatTime(item.dateTime, timezone);
  const endTime = activity.endTime ? formatTime(activity.endTime, timezone) : '';
  const timeRange = activity.allDay ? 'All Day' : endTime ? `${startTime} - ${endTime}` : startTime;

  return (
    <div className="print-item">
      <div className="print-item-header">
        <span className="print-item-type">Activity</span>
        {timeRange && <span className="print-item-time">{timeRange}</span>}
      </div>
      <div className="print-item-title">{activity.name}</div>
      {activity.category && <div className="print-item-detail">Category: {activity.category}</div>}
      {activity.bookingReference && (
        <div className="print-item-detail">Booking Ref: {activity.bookingReference}</div>
      )}
      {activity.cost && (
        <div className="print-item-detail">Cost: {formatCost(activity.cost, activity.currency)}</div>
      )}
      {activity.notes && <div className="print-item-notes">Notes: <MarkdownRenderer content={activity.notes} compact /></div>}
      {activity.description && <div className="print-item-description"><MarkdownRenderer content={activity.description} compact /></div>}
    </div>
  );
};

// Render transportation item
const TransportationItemPrint = ({ item, timezone }: { item: Extract<DayItem, { type: 'transportation' }>; timezone?: string }) => {
  const transport = item.data;
  const departTime = formatTime(item.dateTime, transport.startTimezone || timezone);
  const arriveTime = transport.arrivalTime
    ? formatTime(transport.arrivalTime, transport.endTimezone || timezone)
    : '';

  return (
    <div className="print-item">
      <div className="print-item-header">
        <span className="print-item-type">{getTransportTypeName(transport.type)}</span>
        {departTime && (
          <span className="print-item-time">
            {departTime}
            {arriveTime && ` - ${arriveTime}`}
          </span>
        )}
      </div>
      <div className="print-item-title">
        {transport.fromLocationName || transport.fromLocation?.name || 'TBD'} →{' '}
        {transport.toLocationName || transport.toLocation?.name || 'TBD'}
      </div>
      {transport.fromLocation?.address && (
        <div className="print-item-detail">From: {transport.fromLocation.address}</div>
      )}
      {transport.toLocation?.address && (
        <div className="print-item-detail">To: {transport.toLocation.address}</div>
      )}
      {transport.carrier && <div className="print-item-detail">Carrier: {transport.carrier}</div>}
      {transport.vehicleNumber && (
        <div className="print-item-detail">
          {transport.type === 'flight' ? 'Flight' : 'Vehicle'} #: {transport.vehicleNumber}
        </div>
      )}
      {transport.confirmationNumber && (
        <div className="print-item-detail">Confirmation: {transport.confirmationNumber}</div>
      )}
      {transport.cost && (
        <div className="print-item-detail">Cost: {formatCost(transport.cost, transport.currency)}</div>
      )}
      {transport.notes && <div className="print-item-notes">Notes: <MarkdownRenderer content={transport.notes} compact /></div>}
    </div>
  );
};

// Render lodging item
const LodgingItemPrint = ({ item, timezone }: { item: Extract<DayItem, { type: 'lodging' }>; timezone?: string }) => {
  const lodging = item.data;
  const context = item.lodgingContext;
  const time = formatTime(item.dateTime, timezone);

  let timeLabel = time;
  if (context?.isCheckInDay) timeLabel = `Check-in: ${time || 'TBD'}`;
  else if (context?.isCheckOutDay) timeLabel = `Check-out: ${time || 'TBD'}`;

  return (
    <div className="print-item">
      <div className="print-item-header">
        <span className="print-item-type">{getLodgingTypeName(lodging.type)}</span>
        {timeLabel && <span className="print-item-time">{timeLabel}</span>}
      </div>
      <div className="print-item-title">{lodging.name}</div>
      {context?.nightNumber && context?.totalNights && context.totalNights > 1 && (
        <div className="print-item-detail">
          Night {context.nightNumber} of {context.totalNights}
        </div>
      )}
      {lodging.address && (
        <div className="print-item-detail">Address: {lodging.address}</div>
      )}
      {lodging.confirmationNumber && (
        <div className="print-item-detail">Confirmation: {lodging.confirmationNumber}</div>
      )}
      {lodging.cost && (
        <div className="print-item-detail">Cost: {formatCost(lodging.cost, lodging.currency)}</div>
      )}
      {lodging.notes && <div className="print-item-notes">Notes: <MarkdownRenderer content={lodging.notes} compact /></div>}
    </div>
  );
};

// Render journal item
const JournalItemPrint = ({ item }: { item: Extract<DayItem, { type: 'journal' }> }) => {
  const journal = item.data;

  return (
    <div className="print-item print-item-journal">
      <div className="print-item-header">
        <span className="print-item-type">Journal Entry</span>
      </div>
      {journal.title && <div className="print-item-title">{journal.title}</div>}
      {journal.content && <div className="print-item-description"><MarkdownRenderer content={journal.content} compact /></div>}
    </div>
  );
};

// Render location item
const LocationItemPrint = ({ item, timezone }: { item: Extract<DayItem, { type: 'location' }>; timezone?: string }) => {
  const location = item.data;
  const visitTime = formatTime(item.dateTime, timezone);

  return (
    <div className="print-item">
      <div className="print-item-header">
        <span className="print-item-type">Location</span>
        {visitTime && <span className="print-item-time">{visitTime}</span>}
      </div>
      <div className="print-item-title">{location.name}</div>
      {location.category && <div className="print-item-detail">Category: {location.category.name}</div>}
      {location.address && <div className="print-item-detail">Address: {location.address}</div>}
      {location.notes && <div className="print-item-description"><MarkdownRenderer content={location.notes} compact /></div>}
    </div>
  );
};

const CustomItemPrint = ({
  item,
  timezone,
}: {
  item: Extract<DayItem, { type: 'customItem' }>;
  timezone?: string;
}) => {
  const customItem = item.data;
  const startTime = formatTime(item.dateTime, timezone);
  const endTime = customItem.endTime ? formatTime(new Date(customItem.endTime), timezone) : '';
  const timeRange = customItem.allDay
    ? 'All Day'
    : endTime
      ? `${startTime} - ${endTime}`
      : startTime;

  return (
    <div className="print-item">
      <div className="print-item-header">
        <span className="print-item-type">{customItem.type?.name || 'Custom'}</span>
        {timeRange && <span className="print-item-time">{timeRange}</span>}
      </div>
      <div className="print-item-title">{customItem.name}</div>
      {customItem.location?.name && (
        <div className="print-item-detail">Location: {customItem.location.name}</div>
      )}
      {customItem.confirmationNumber && (
        <div className="print-item-detail">Confirmation: {customItem.confirmationNumber}</div>
      )}
      {customItem.cost != null && (
        <div className="print-item-detail">
          Cost: {formatCost(customItem.cost, customItem.currency)}
        </div>
      )}
      {customItem.url && <div className="print-item-detail">URL: {customItem.url}</div>}
      {customItem.notes && (
        <div className="print-item-description">
          <MarkdownRenderer content={customItem.notes} compact />
        </div>
      )}
    </div>
  );
};

// Render day item based on type
const DayItemRow = ({ item, timezone }: { item: DayItem; timezone?: string }) => {
  switch (item.type) {
    case 'activity':
      return <ActivityItemPrint item={item} timezone={timezone} />;
    case 'transportation':
      return <TransportationItemPrint item={item} timezone={timezone} />;
    case 'lodging':
      return <LodgingItemPrint item={item} timezone={timezone} />;
    case 'journal':
      return <JournalItemPrint item={item} />;
    case 'location':
      return <LocationItemPrint item={item} timezone={timezone} />;
    case 'customItem':
      return <CustomItemPrint item={item} timezone={timezone} />;
    default:
      return null;
  }
};

// Unscheduled activity item
const UnscheduledActivityItemPrint = ({ activity }: { activity: UnscheduledActivityWithLocation }) => (
  <div className="print-item">
    <div className="print-item-header">
      <span className="print-item-type">Unscheduled Activity</span>
    </div>
    <div className="print-item-title">{activity.name}</div>
    {activity.category && <div className="print-item-detail">Category: {activity.category}</div>}
    {activity.linkedLocations && activity.linkedLocations.length > 0 && (
      <div className="print-item-detail">
        Linked to: {activity.linkedLocations.map((loc) => loc.name).join(', ')}
      </div>
    )}
    {activity.bookingReference && (
      <div className="print-item-detail">Booking Ref: {activity.bookingReference}</div>
    )}
    {activity.cost && (
      <div className="print-item-detail">Cost: {formatCost(activity.cost, activity.currency)}</div>
    )}
    {activity.notes && <div className="print-item-notes">Notes: {activity.notes}</div>}
    {activity.description && <div className="print-item-description">{activity.description}</div>}
  </div>
);

export default function PrintableDayItinerary({
  tripTitle,
  tripTimezone,
  dayNumber,
  displayDate,
  items,
  weather,
  unscheduledActivities,
}: PrintableDayItineraryProps) {
  const hasItems = items.length > 0;
  const hasUnscheduled = unscheduledActivities && unscheduledActivities.length > 0;

  // Sort items by time
  const sortedItems = [...items].sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());

  return (
    <div className="print-itinerary">
        {/* Header */}
        <div className="print-header">
          <h1 className="print-title">{tripTitle}</h1>
          <p className="print-dates">
            Day {dayNumber} - {displayDate}
          </p>
          {tripTimezone && <p className="print-timezone">All times in {tripTimezone}</p>}
        </div>

        {/* Weather info if available */}
        {weather && (
          <div className="print-weather">
            <span className="print-weather-icon"><Icon name={weather.icon} /></span>
            <span className="print-weather-temp">
              {weather.high !== null && weather.high !== undefined ? Math.round(weather.high) : '--'}°
              {weather.low !== null && weather.low !== undefined && ` / ${Math.round(weather.low)}°`}
            </span>
            {weather.conditions && <span className="print-weather-conditions">{weather.conditions}</span>}
          </div>
        )}

        {/* Day content */}
        <div className="print-day">
          <div className="print-day-header">
            <span className="print-day-number">Day {dayNumber}</span>
            <span className="print-day-date">{displayDate}</span>
          </div>

          {hasItems ? (
            <div className="print-day-items">
              {sortedItems.map((item, index) => {
                const key = `${item.type}-${item.data.id ?? index}`;
                return <DayItemRow key={key} item={item} timezone={tripTimezone} />;
              })}
            </div>
          ) : (
            <div className="print-day-empty">No scheduled items for this day</div>
          )}
        </div>

        {/* Unscheduled activities for this day */}
        {hasUnscheduled && (
          <div className="print-unscheduled">
            <div className="print-section-header">Unscheduled Activities</div>
            <p className="print-unscheduled-note">
              These activities are linked to locations visited on this day but don't have scheduled times.
            </p>
            <div className="print-unscheduled-group">
              {unscheduledActivities!.map((activity) => (
                <UnscheduledActivityItemPrint key={activity.id} activity={activity} />
              ))}
            </div>
          </div>
        )}

      {/* Footer */}
      <div className="print-footer">
        <p>Generated from Travel Life</p>
      </div>
    </div>
  );
}
