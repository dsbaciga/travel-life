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
    <div className={`space-y-4 ${className}`}>
      {/* Section header: a quiet label, not a banner */}
      <div className="flex items-center gap-2">
        {icon && (
          <span className="text-base leading-none opacity-80" aria-hidden="true">
            {icon}
          </span>
        )}
        <h3 className="text-sm font-semibold text-charcoal dark:text-white">
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
    <div className="border-t border-primary-500/10 dark:border-navy-700 pt-4">
      {/* Toggle: a plain disclosure row rather than another bordered box */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 py-2 text-sm font-medium text-charcoal dark:text-white rounded-lg hover:text-primary-700 dark:hover:text-gold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50"
        {...{ 'aria-expanded': isExpanded }}
        aria-label={isExpanded ? `Collapse ${title}` : `Expand ${title}`}
      >
        <span className="flex items-baseline gap-2 min-w-0">
          {icon && (
            <span className="leading-none opacity-80" aria-hidden="true">
              {icon}
            </span>
          )}
          <span>{title}</span>
          {badge && !isExpanded && (
            <span className="text-xs font-normal text-slate dark:text-dusk-400 truncate">
              {badge}
            </span>
          )}
        </span>
        <svg
          className={`w-4 h-4 flex-shrink-0 text-slate dark:text-dusk-400 transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Optional Description */}
      {description && !isExpanded && (
        <p className="text-xs text-gray-500 dark:text-dusk-400 mt-2 px-1">
          {description}
        </p>
      )}

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="mt-4 space-y-6 animate-in slide-in-from-top-2 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}
