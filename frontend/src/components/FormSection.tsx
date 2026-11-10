import { type ReactNode } from 'react';

interface FormSectionProps {
  title: string;
  icon?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Reusable form section component for visual grouping of related fields
 * Provides consistent styling with title, optional icon, and description
 * Works in both light and dark modes
 */
export default function FormSection({
  title,
  icon,
  description,
  children,
  className = '',
}: FormSectionProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      {/* Section Header */}
      <div className="flex items-center gap-2">
        {icon && <span className="text-lg">{icon}</span>}
        <h3 className="text-sm font-semibold text-charcoal dark:text-warm-gray uppercase tracking-wide">
          {title}
        </h3>
      </div>

      {/* Optional Description */}
      {description && (
        <p className="text-xs text-slate dark:text-warm-gray/70 -mt-1">
          {description}
        </p>
      )}

      {/* Section Content */}
      <div className="space-y-4 pl-0">
        {children}
      </div>
    </div>
  );
}

interface CollapsibleSectionProps {
  title: string;
  icon?: string;
  description?: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  badge?: string;
}

/**
 * Collapsible form section for optional/advanced fields
 * Implements progressive disclosure pattern
 */
export function CollapsibleSection({
  title,
  icon,
  description,
  isExpanded,
  onToggle,
  children,
  badge,
}: CollapsibleSectionProps) {
  return (
    <div className="border-t border-primary-100 dark:border-gold/20 pt-4">
      {/* Toggle Button */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between py-2 px-3 text-sm font-medium text-primary-600 dark:text-gold hover:text-primary-700 dark:hover:text-gold/80 bg-primary-50 dark:bg-navy-800 rounded-lg border border-primary-200 dark:border-gold/30 hover:border-primary-300 dark:hover:border-gold/50 transition-colors"
        {...{ 'aria-expanded': isExpanded }}
        aria-label={isExpanded ? `Collapse ${title}` : `Expand ${title}`}
      >
        <div className="flex items-center gap-2">
          {icon && <span>{icon}</span>}
          <span>{isExpanded ? `Hide ${title}` : `Show ${title}`}</span>
          {badge && !isExpanded && (
            <span className="text-xs text-slate dark:text-warm-gray/70">
              ({badge})
            </span>
          )}
        </div>
        <span className="transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          ▼
        </span>
      </button>

      {/* Optional Description */}
      {description && !isExpanded && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 px-1">
          {description}
        </p>
      )}

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="mt-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}
