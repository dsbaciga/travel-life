import { useNavigate } from 'react-router';
import Icon from '../ui/Icon';
import type { CustomItem } from '../../types/customItem';
import LinkedEntitiesDisplay from '../LinkedEntitiesDisplay';
import MarkdownRenderer from '../MarkdownRenderer';
import DirectionsButton from '../DirectionsButton';
import { getTypeColors } from './utils';
import { formatCurrency } from '../../utils/formatCurrency';
import { useTimezoneResolver } from '../../hooks/useTimezoneResolver';
import type { MapsPlace } from '../../lib/mapsDeepLinks';

interface CustomItemCardProps {
  item: CustomItem;
  tripId: number;
  tripTimezone?: string;
  /** Current date being displayed (for filtering linked entities) */
  currentDate?: Date;
  /** Where the traveller is coming from, for the Directions link */
  originPlace?: MapsPlace | null;
}

export default function CustomItemCard({
  item,
  tripId,
  tripTimezone,
  currentDate,
  originPlace,
}: CustomItemCardProps) {
  const navigate = useNavigate();
  const colors = getTypeColors('customItem');
  const resolveTz = useTimezoneResolver();

  const handleEdit = () => {
    navigate(`/trips/${tripId}?tab=custom&edit=${item.id}`);
  };

  // Resolve through the shared chain — never a raw `|| 'UTC'`.
  const effectiveTz = resolveTz(item.timezone, tripTimezone);

  const formatTime = (value: string | null) => {
    if (!value) return '';
    return new Date(value).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: effectiveTz,
    });
  };

  const timeLabel = item.allDay
    ? 'All Day'
    : item.endTime
      ? `${formatTime(item.startTime)} - ${formatTime(item.endTime)}`
      : formatTime(item.startTime);

  const destination: MapsPlace | null = item.location
    ? {
        name: item.location.name,
        latitude: item.location.latitude,
        longitude: item.location.longitude,
      }
    : null;

  return (
    <div
      className={`bg-white dark:bg-dusk-800 rounded-xl shadow-sm border ${colors.border} border-l-4 ${colors.accent} overflow-hidden hover:shadow-md transition-shadow`}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {/* Icon */}
            <div
              className={`w-12 h-12 rounded-xl ${colors.icon} flex items-center justify-center flex-shrink-0`}
            >
              <Icon name="custom" size={24} />
            </div>

            {/* Main content */}
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white line-clamp-2 break-words [overflow-wrap:anywhere]">
                {item.name}
              </h3>

              <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-gray-500 dark:text-dusk-400">
                {item.type?.name && <span>{item.type.name}</span>}
                {timeLabel && (
                  <>
                    {item.type?.name && (
                      <span className="text-gray-300 dark:text-dusk-600">·</span>
                    )}
                    <span>{timeLabel}</span>
                  </>
                )}
                {item.cost != null && (
                  <>
                    <span className="text-gray-300 dark:text-dusk-600">·</span>
                    <span>{formatCurrency(item.cost, item.currency)}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={handleEdit}
              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 dark:hover:text-blue-400 transition-colors"
              title="Edit custom item"
            >
              <Icon name="edit" size={20} />
            </button>
          </div>
        </div>

        {/* Location */}
        {item.location?.name && (
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-dusk-400 min-w-0">
              <Icon name="place" size={16} className="flex-shrink-0" />
              <span className="truncate">{item.location.name}</span>
            </div>
            {destination && (
              <DirectionsButton destination={destination} origin={originPlace} variant="icon" />
            )}
          </div>
        )}

        {/* Confirmation number */}
        {item.confirmationNumber && (
          <div className="mt-2 text-sm text-gray-600 dark:text-dusk-400">
            Confirmation: <span className="font-mono">{item.confirmationNumber}</span>
          </div>
        )}

        {/* URL */}
        {item.url && (
          <div className="mt-2 text-sm">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:underline break-all [@media(pointer:coarse)]:min-h-[44px]"
            >
              {item.url}
            </a>
          </div>
        )}

        {/* Notes */}
        {item.notes && (
          <div className="mt-3 text-gray-700 dark:text-dusk-300">
            <MarkdownRenderer content={item.notes} compact />
          </div>
        )}

        {/* Linked entities (photos, links, …) */}
        <LinkedEntitiesDisplay
          tripId={tripId}
          entityType="CUSTOM_ITEM"
          entityId={item.id}
          compact
          currentDate={currentDate}
          timezone={tripTimezone}
        />
      </div>
    </div>
  );
}
