import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface ActionButton {
  /** Button label */
  label: string;
  /** Click handler (for button) */
  onClick?: () => void;
  /** Link href (for link) */
  href?: string;
  /** Button variant */
  variant?: 'primary' | 'secondary' | 'danger';
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Icon to show before label */
  icon?: ReactNode;
  /** Tooltip text shown on hover */
  title?: string;
}

interface PageHeaderProps {
  /** Page title */
  title: string;
  /** Optional subtitle/description */
  subtitle?: string;
  /** Primary action button */
  action?: ActionButton;
  /** Secondary actions */
  secondaryActions?: ActionButton[];
  /** Back link */
  backLink?: {
    label: string;
    href: string;
  };
  /** Additional content to render on the right side */
  rightContent?: ReactNode;
  /** Additional class names */
  className?: string;
}

const variantClasses = {
  primary: 'btn btn-primary',
  secondary: 'btn btn-secondary',
  danger: 'btn btn-danger',
};

/**
 * Reusable page header component with consistent styling
 * 
 * @example
 * ```tsx
 * // Basic usage
 * <PageHeader title="My Trips" />
 * 
 * // With subtitle and action
 * <PageHeader
 *   title="Travel Companions"
 *   subtitle="Manage your travel companions and add them to trips"
 *   action={{ label: "+ Add Companion", onClick: () => setShowForm(true) }}
 * />
 * 
 * // With back link
 * <PageHeader
 *   title="Trip Details"
 *   backLink={{ label: "← Back to Trips", href: "/trips" }}
 * />
 * ```
 */
export default function PageHeader({
  title,
  subtitle,
  action,
  secondaryActions,
  backLink,
  rightContent,
  className = '',
}: PageHeaderProps) {
  const renderAction = (actionConfig: ActionButton, key?: string | number) => {
    const classes = variantClasses[actionConfig.variant ?? 'primary'];
    const content = (
      <>
        {actionConfig.icon && <span className="mr-1">{actionConfig.icon}</span>}
        {actionConfig.label}
      </>
    );

    if (actionConfig.href) {
      return (
        <Link key={key} to={actionConfig.href} className={classes} title={actionConfig.title}>
          {content}
        </Link>
      );
    }

    return (
      <button
        key={key}
        onClick={actionConfig.onClick}
        disabled={actionConfig.disabled}
        className={classes}
        title={actionConfig.title}
      >
        {content}
      </button>
    );
  };

  return (
    <div className={`mb-6 ${className}`}>
      {backLink && (
        <Link
          to={backLink.href}
          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 mb-2 inline-block"
        >
          {backLink.label}
        </Link>
      )}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {title}
          </h1>
          {subtitle && (
            <p className="text-gray-600 dark:text-gray-400 mt-1">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {secondaryActions?.map((action, index) => renderAction(action, index))}
          {action && renderAction(action)}
          {rightContent}
        </div>
      </div>
    </div>
  );
}

/**
 * Compact page header for use in cards or sections
 */
PageHeader.Section = function SectionHeader({
  title,
  subtitle,
  action,
  className = '',
}: Pick<PageHeaderProps, 'title' | 'subtitle' | 'action' | 'className'>) {
  return (
    <div className={`flex justify-between items-center mb-4 ${className}`}>
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {title}
        </h3>
        {subtitle && (
          <p className="text-sm text-gray-600 dark:text-gray-400">{subtitle}</p>
        )}
      </div>
      {action && (
        <button
          onClick={action.onClick}
          disabled={action.disabled}
          className={variantClasses[action.variant ?? 'secondary']}
        >
          {action.icon && <span className="mr-1">{action.icon}</span>}
          {action.label}
        </button>
      )}
    </div>
  );
};

