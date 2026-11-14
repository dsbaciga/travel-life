import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import entityLinkService from '../services/entityLink.service';
import type {
  EntityType,
  EnrichedEntityLink,
  EntityLinksResponse,
} from '../types/entityLink';
import {
  ENTITY_TYPE_CONFIG,
  ENTITY_TYPE_DISPLAY_ORDER,
  getEntityColorClasses,
  getRelationshipLabel,
  getEntityDisplayName,
} from '../lib/entityConfig';
import { extractDatePortion, resolveTimezone } from '../utils/timezone';
import { useTimezoneResolver } from '../hooks/useTimezoneResolver';
import EntityDetailModal from './EntityDetailModal';

interface LinkedEntitiesDisplayProps {
  tripId: number;
  entityType: EntityType;
  entityId: number;
  /** Optional: Exclude certain entity types from display */
  excludeTypes?: EntityType[];
  /** Optional: Compact mode shows fewer details */
  compact?: boolean;
  /** Optional: Maximum number of items to show per type before collapsing */
  maxItemsPerType?: number;
  /** Optional: Custom class name for the container */
  className?: string;
  /** Optional: Current date being displayed (for multi-day entities like lodging).
   *  When provided, journal entries will be filtered to only show on their specific date. */
  currentDate?: Date;
  /** Optional: Timezone to use for date comparison */
  timezone?: string;
}


interface GroupedLink {
  link: EnrichedEntityLink;
  linkedEntityType: EntityType;
  linkedEntityId: number;
  displayName: string;
  direction: 'from' | 'to';
}

// Selected entity state for detail modal
interface SelectedEntity {
  type: EntityType;
  id: number;
}

// Helper to get date string in timezone (YYYY-MM-DD format)
function getDateInTimezone(date: Date, timezone?: string): string {
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    // Callers pass an already-resolved zone; resolve again so a direct caller
    // that passes nothing still lands on the viewer's zone rather than UTC.
    timeZone: resolveTimezone(timezone),
  };
  // Format as YYYY-MM-DD
  const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(date);
  const year = parts.find(p => p.type === 'year')?.value || '';
  const month = parts.find(p => p.type === 'month')?.value || '';
  const day = parts.find(p => p.type === 'day')?.value || '';
  return `${year}-${month}-${day}`;
}

/**
 * Whether a journal entry belongs to the date currently being displayed.
 *
 * Lives at module scope (taking currentDate/timezone as arguments) rather than
 * inside the component, so it has a stable identity and the grouping memo's
 * dependency array can be honest about what it actually depends on.
 */
function journalMatchesCurrentDate(
  journalDate: string | undefined,
  currentDate: Date | undefined,
  timezone: string | undefined,
): boolean {
  // If no currentDate filter is provided, show all journal entries
  if (!currentDate) return true;
  // If journal has no date, show it (shouldn't happen but be safe)
  if (!journalDate) return true;

  // For journal dates (which are date-only in the database), extract the date portion
  // directly from the string to avoid UTC timezone shift issues.
  // The database stores dates like "2025-01-15" which JavaScript parses as midnight UTC.
  // This would shift to the wrong day when converted to timezones west of UTC.
  return getDateInTimezone(currentDate, timezone) === extractDatePortion(journalDate);
}

export default function LinkedEntitiesDisplay({
  tripId,
  entityType,
  entityId,
  excludeTypes = [],
  compact = false,
  maxItemsPerType = 5,
  className = '',
  currentDate,
  timezone,
}: LinkedEntitiesDisplayProps) {
  const navigate = useNavigate();
  const resolveTz = useTimezoneResolver();
  // Journal entries are bucketed by calendar day, so which day a timestamp
  // falls on depends on the zone: the trip's when it has one, else the viewer's.
  const effectiveTimezone = resolveTz(timezone);
  // State for entity detail modal
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);

  // Handle clicking on a linked entity - albums go to their detail page, others open modal
  const handleEntityClick = (linkedEntityType: EntityType, linkedEntityId: number) => {
    if (linkedEntityType === 'PHOTO_ALBUM') {
      navigate(`/trips/${tripId}/albums/${linkedEntityId}`);
    } else {
      setSelectedEntity({ type: linkedEntityType, id: linkedEntityId });
    }
  };

  // Fetch all links for this entity
  const {
    data: linksData,
    isLoading,
    error,
  } = useQuery<EntityLinksResponse>({
    queryKey: ['entityLinks', tripId, entityType, entityId],
    queryFn: () => entityLinkService.getAllLinksForEntity(tripId, entityType, entityId),
  });

  // Group links by entity type
  const groupedLinks = useMemo(() => {
    // Listed explicitly so the Record<EntityType, …> annotation makes TypeScript
    // enforce completeness: adding a backend EntityType fails the build here
    // instead of silently leaving a key undefined at runtime. Returning this
    // (rather than a bare `{}`) when there is no data keeps the memo's type a
    // full Record, so callers can index it by EntityType.
    const emptyGroups = (): Record<EntityType, GroupedLink[]> => ({
      PHOTO: [],
      LOCATION: [],
      ACTIVITY: [],
      LODGING: [],
      TRANSPORTATION: [],
      JOURNAL_ENTRY: [],
      PHOTO_ALBUM: [],
      SAVED_LINK: [],
      PDF_IMPORT: [],
      CUSTOM_ITEM: [],
    });

    if (!linksData) return emptyGroups();

    const groups = emptyGroups();

    const addToGroup = (type: EntityType, item: GroupedLink) => {
      groups[type].push(item);
    };

    // Links FROM this entity (this entity is the source)
    for (const link of linksData.linksFrom) {
      if (!excludeTypes.includes(link.targetType)) {
        // Filter journal entries by date when currentDate is provided
        if (link.targetType === 'JOURNAL_ENTRY' && currentDate) {
          if (!journalMatchesCurrentDate(link.targetEntity?.date, currentDate, effectiveTimezone)) {
            continue;
          }
        }
        addToGroup(link.targetType, {
          link,
          linkedEntityType: link.targetType,
          linkedEntityId: link.targetId,
          displayName: getEntityDisplayName(link.targetEntity, link.targetId),
          direction: 'from',
        });
      }
    }

    // Links TO this entity (this entity is the target)
    for (const link of linksData.linksTo) {
      if (!excludeTypes.includes(link.sourceType)) {
        // Filter journal entries by date when currentDate is provided
        if (link.sourceType === 'JOURNAL_ENTRY' && currentDate) {
          if (!journalMatchesCurrentDate(link.sourceEntity?.date, currentDate, effectiveTimezone)) {
            continue;
          }
        }
        addToGroup(link.sourceType, {
          link,
          linkedEntityType: link.sourceType,
          linkedEntityId: link.sourceId,
          displayName: getEntityDisplayName(link.sourceEntity, link.sourceId),
          direction: 'to',
        });
      }
    }

    return groups;
  }, [linksData, excludeTypes, currentDate, effectiveTimezone]);

  // Get entity types that have links (in standard display order)
  const linkedEntityTypes = useMemo(() => {
    return ENTITY_TYPE_DISPLAY_ORDER.filter(
      (type) => groupedLinks[type]?.length > 0
    );
  }, [groupedLinks]);

  // Don't render anything if there are no links
  if (!isLoading && linkedEntityTypes.length === 0) {
    return null;
  }

  if (isLoading) {
    return (
      <div className={`mt-3 ${className}`}>
        <div className="flex items-center gap-2">
          <div className="animate-pulse h-4 w-4 bg-gray-300 dark:bg-dusk-600 rounded"></div>
          <div className="animate-pulse h-4 w-24 bg-gray-300 dark:bg-dusk-600 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    // Log the error for debugging while not breaking the UI
    console.error('LinkedEntitiesDisplay: Failed to load links', {
      tripId,
      entityType,
      entityId,
      error: error instanceof Error ? error.message : error,
    });
    return null;
  }

  return (
    <div className={`mt-3 ${className}`}>
      {/* Section header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-gray-500 dark:text-dusk-400 uppercase tracking-wide">
          Linked Items
        </span>
        <div className="flex-1 h-px bg-gray-200 dark:bg-dusk-700"></div>
      </div>

      {/* Linked entity cards by type */}
      <div className="space-y-3">
        {linkedEntityTypes.map((type) => {
          const items = groupedLinks[type];
          const config = ENTITY_TYPE_CONFIG[type];
          const colors = getEntityColorClasses(type);
          const showAll = items.length <= maxItemsPerType;
          const displayItems = showAll ? items : items.slice(0, maxItemsPerType);
          const hiddenCount = items.length - displayItems.length;

          return (
            <div key={type}>
              {/* Type label with count */}
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-sm">{config.emoji}</span>
                <span className={`text-xs font-medium ${colors.text} ${colors.textDark}`}>
                  {items.length === 1 ? config.label : config.pluralLabel} ({items.length})
                </span>
              </div>

              {/* Cards grid */}
              <div className="flex flex-wrap gap-2">
                {displayItems.map((item) => (
                  <button
                    key={item.link.id}
                    type="button"
                    onClick={() => handleEntityClick(item.linkedEntityType, item.linkedEntityId)}
                    className={`
                      inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border
                      ${colors.bg} ${colors.bgDark} ${colors.bgHover} ${colors.border} ${colors.focus}
                      transition-colors cursor-pointer
                      ${compact ? 'text-xs' : 'text-sm'}
                    `}
                    title={`${getRelationshipLabel(item.link.relationship)}: ${item.displayName}`}
                  >
                    <span className={compact ? 'text-xs' : 'text-sm'}>{config.emoji}</span>
                    <span className={`font-medium ${colors.text} ${colors.textDark} truncate max-w-[150px]`}>
                      {item.displayName}
                    </span>
                    {!compact && (
                      <span className="text-xs text-gray-500 dark:text-dusk-400">
                        ({getRelationshipLabel(item.link.relationship)})
                      </span>
                    )}
                  </button>
                ))}

                {/* Show "more" indicator if items are truncated */}
                {hiddenCount > 0 && (
                  <div
                    className={`
                      inline-flex items-center px-3 py-1.5 rounded-lg border
                      bg-gray-50 dark:bg-dusk-800 border-gray-200 dark:border-dusk-700
                      text-gray-600 dark:text-dusk-400
                      ${compact ? 'text-xs' : 'text-sm'}
                    `}
                  >
                    +{hiddenCount} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Entity Detail Modal */}
      {selectedEntity && (
        <EntityDetailModal
          isOpen={!!selectedEntity}
          onClose={() => setSelectedEntity(null)}
          tripId={tripId}
          entityType={selectedEntity.type}
          entityId={selectedEntity.id}
        />
      )}
    </div>
  );
}
