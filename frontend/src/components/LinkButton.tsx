import { useState } from 'react';
import LinkPanel from './LinkPanel';
import Icon from './ui/Icon';
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
  /** Render nothing once the entity has links: used next to a manageable
   *  LinkedEntitiesDisplay, whose own "Edit links" button takes over. */
  hideWhenLinked?: boolean;
}

export default function LinkButton({
  tripId,
  entityType,
  entityId,
  linkSummary,
  onUpdate,
  className = '',
  size = 'md',
  hideWhenLinked = false,
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
        parts.push(`${count} ${count === 1 ? config.label : config.pluralLabel}`);
      }
    }
    return parts.join('\n');
  };

  if (hideWhenLinked && hasLinks) return null;

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
            : 'text-gray-400 dark:text-dusk-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-dusk-700'
        } ${className}`}
        aria-label={`${totalLinks} linked ${totalLinks === 1 ? 'item' : 'items'}`}
        title={getTooltip()}
      >
        <Icon name="link" className={iconSize} />

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
