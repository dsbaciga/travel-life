import { useState } from 'react';
import LinkPanel from './LinkPanel';
import type { EntityType, EntityLinkSummary } from '../types/entityLink';
import { ENTITY_TYPE_CONFIG, ENTITY_TYPE_DISPLAY_ORDER } from '../lib/entityConfig';

interface LinkButtonProps {
  tripId: number;
  entityType: EntityType;
  entityId: number;
  linkSummary?: EntityLinkSummary;
  onUpdate?: () => void;
  className?: string;
  size?: 'sm' | 'md';
}

export default function LinkButton({
  tripId,
  entityType,
  entityId,
  linkSummary,
  onUpdate,
  className = '',
  size = 'md',
}: LinkButtonProps) {
  const [showPanel, setShowPanel] = useState(false);

  const totalLinks = linkSummary?.totalLinks ?? 0;
  const hasLinks = totalLinks > 0;
  const iconSize = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  const badgeSize = size === 'sm' ? 'w-4 h-4 text-[9px]' : 'w-5 h-5 text-[10px]';
  const buttonPadding = size === 'sm' ? 'p-2.5' : 'p-3';
  const minSize = 'min-w-[44px] min-h-[44px]';

  // Build tooltip showing linked entity types
  const getTooltip = () => {
    if (!hasLinks || !linkSummary?.linkCounts) {
      return 'Link to other items';
    }

    const parts: string[] = [];
    for (const type of ENTITY_TYPE_DISPLAY_ORDER) {
      const count = linkSummary.linkCounts[type];
      if (count && count > 0) {
        const config = ENTITY_TYPE_CONFIG[type];
        parts.push(`${config.emoji} ${count} ${count === 1 ? config.label : config.pluralLabel}`);
      }
    }
    return parts.join('\n');
  };

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowPanel(true);
        }}
        type="button"
        className={`relative ${buttonPadding} ${minSize} rounded-md transition-all flex items-center justify-center ${
          hasLinks
            ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50'
            : 'text-gray-400 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700'
        } ${className}`}
        aria-label={`${totalLinks} linked ${totalLinks === 1 ? 'item' : 'items'}`}
        title={getTooltip()}
      >
        {/* Link icon - filled when has links, outline when empty */}
        {hasLinks ? (
          <svg className={iconSize} fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z"
              clipRule="evenodd"
            />
          </svg>
        ) : (
          <svg
            className={iconSize}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
        )}

        {/* Badge with link count */}
        {hasLinks && (
          <span
            className={`absolute -top-1 -right-1 bg-blue-600 dark:bg-blue-500 text-white rounded-full flex items-center justify-center font-bold shadow-sm ${badgeSize}`}
          >
            {totalLinks > 99 ? '99+' : totalLinks}
          </span>
        )}
      </button>

      {/* Link Panel Modal */}
      {showPanel && (
        <LinkPanel
          tripId={tripId}
          entityType={entityType}
          entityId={entityId}
          onClose={() => setShowPanel(false)}
          onUpdate={onUpdate}
        />
      )}
    </>
  );
}
