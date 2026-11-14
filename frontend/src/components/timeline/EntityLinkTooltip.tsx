import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import entityLinkService from '../../services/entityLink.service';
import type { EntityType } from '../../types/entityLink';
import { ENTITY_TYPE_CONFIG } from '../../lib/entityConfig';

interface EntityLinkTooltipProps {
  tripId: number;
  sourceEntityType: EntityType;
  sourceEntityId: number;
  targetEntityType: EntityType;
  children: React.ReactNode;
}

// Get display name from an entity
function getEntityDisplayName(entity: { name?: string; title?: string; caption?: string; id: number }): string {
  return entity.name || entity.title || entity.caption || `ID: ${entity.id}`;
}

export default function EntityLinkTooltip({
  tripId,
  sourceEntityType,
  sourceEntityId,
  targetEntityType,
  children,
}: EntityLinkTooltipProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  // Fetch links only when hovered (lazy loading)
  const { data: linksData, isLoading } = useQuery({
    queryKey: ['entityLinks', tripId, sourceEntityType, sourceEntityId],
    queryFn: () => entityLinkService.getAllLinksForEntity(tripId, sourceEntityType, sourceEntityId),
    enabled: isHovered, // Only fetch when hovered
    staleTime: 60000, // Cache for 1 minute
  });

  // Handle hover delay
  useEffect(() => {
    if (isHovered) {
      hoverTimeoutRef.current = setTimeout(() => {
        setShowTooltip(true);
      }, 300); // 300ms delay before showing tooltip
    } else {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      setShowTooltip(false);
    }

    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, [isHovered]);

  // Get linked entity names for the target type
  const linkedEntityNames: string[] = [];
  if (linksData) {
    // Links FROM this entity (this entity is the source)
    for (const link of linksData.linksFrom) {
      if (link.targetType === targetEntityType && link.targetEntity) {
        linkedEntityNames.push(getEntityDisplayName(link.targetEntity));
      }
    }
    // Links TO this entity (this entity is the target)
    for (const link of linksData.linksTo) {
      if (link.sourceType === targetEntityType && link.sourceEntity) {
        linkedEntityNames.push(getEntityDisplayName(link.sourceEntity));
      }
    }
  }

  const config = ENTITY_TYPE_CONFIG[targetEntityType];

  return (
    <div
      ref={triggerRef}
      className="relative inline-flex"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}

      {/* Tooltip */}
      {showTooltip && (
        <div
          ref={tooltipRef}
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 pointer-events-none"
        >
          <div className="bg-gray-900 dark:bg-dusk-700 text-white text-xs rounded-lg py-2 px-3 shadow-lg whitespace-nowrap max-w-xs">
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Loading</span>
              </div>
            ) : linkedEntityNames.length === 0 ? (
              <span>No {config.pluralLabel.toLowerCase()} linked</span>
            ) : (
              <div>
                <div className="font-medium mb-1 text-gray-300">
                  {config.emoji} {config.pluralLabel} ({linkedEntityNames.length})
                </div>
                <ul className="space-y-0.5">
                  {linkedEntityNames.slice(0, 5).map((name, index) => (
                    <li key={index} className="truncate max-w-[200px]">
                      • {name}
                    </li>
                  ))}
                  {linkedEntityNames.length > 5 && (
                    <li className="text-gray-400 italic">
                      +{linkedEntityNames.length - 5} more...
                    </li>
                  )}
                </ul>
              </div>
            )}
            {/* Arrow */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-dusk-700" />
          </div>
        </div>
      )}
    </div>
  );
}
