import type { ReactNode } from 'react';
import Icon, { type IconName } from './ui/Icon';

interface EmptyStateProps {
  /** An icon name (see `ui/Icon`) or a custom element. */
  icon?: IconName | ReactNode;
  message: string;
  subMessage?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
  className?: string;
}

/**
 * Reusable empty state component for when no items exist
 *
 * @example
 * ```tsx
 * // Basic usage
 * <EmptyState
 *   icon="activity"
 *   message="No activities yet"
 *   subMessage="Add activities to your trip"
 * />
 *
 * // With action button
 * <EmptyState
 *   icon="photo"
 *   message="No photos yet"
 *   subMessage="Upload your first photo"
 *   actionLabel="Upload Photo"
 *   onAction={() => setShowUploadModal(true)}
 * />
 *
 * // With link action
 * <EmptyState
 *   icon="flight"
 *   message="No trips yet"
 *   actionLabel="Create your first trip"
 *   actionHref="/trips/new"
 * />
 * ```
 */
export default function EmptyState({
  icon,
  message,
  subMessage,
  actionLabel,
  onAction,
  actionHref,
  className = '',
}: EmptyStateProps) {
  const ActionButton = () => {
    if (!actionLabel) return null;

    const buttonClasses =
      'px-6 py-3 rounded-lg font-semibold font-body bg-gradient-to-r from-primary-500 to-primary-600 dark:from-accent-400 dark:to-accent-600 text-white shadow-lg shadow-primary-500/20 dark:shadow-accent-400/20 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200';

    if (actionHref) {
      return (
        <a href={actionHref} className={buttonClasses}>
          {actionLabel}
        </a>
      );
    }

    if (onAction) {
      return (
        <button onClick={onAction} className={buttonClasses}>
          {actionLabel}
        </button>
      );
    }

    return null;
  };

  return (
    <div
      className={`text-center py-12 px-6 bg-white/80 dark:bg-navy-800/80 backdrop-blur-sm rounded-2xl border-2 border-primary-500/10 dark:border-gold/20 ${className}`}
      role="status"
    >
      {icon && (
        <div className="mb-4 flex justify-center text-primary-300 dark:text-sky/60 animate-bounce-slow" aria-hidden="true">
          {typeof icon === 'string' ? (
            <Icon name={icon as IconName} size={64} />
          ) : (
            icon
          )}
        </div>
      )}
      <p className="text-lg font-medium text-charcoal dark:text-warm-gray mb-2 font-body">
        {message}
      </p>
      {subMessage && (
        <p className="text-sm text-slate dark:text-warm-gray/70 font-body max-w-md mx-auto mb-2">
          {subMessage}
        </p>
      )}
      {actionLabel && (actionHref || onAction) && (
        <div className="mt-6">
          <ActionButton />
        </div>
      )}
    </div>
  );
}

/**
 * Compact empty state for inline use
 */
EmptyState.Compact = function CompactEmptyState({
  icon,
  message,
  className = '',
}: Pick<EmptyStateProps, 'icon' | 'message' | 'className'>) {
  return (
    <div
      className={`flex items-center justify-center gap-3 py-6 px-4 text-slate dark:text-warm-gray/70 ${className}`}
      role="status"
    >
      {icon && (
        <span aria-hidden="true">
          {typeof icon === 'string' ? <Icon name={icon as IconName} size={24} /> : icon}
        </span>
      )}
      <span className="font-body">{message}</span>
    </div>
  );
};

/**
 * SVG Illustrations for common empty states
 */

// eslint-disable-next-line react-refresh/only-export-components
export const EmptyIllustrations = {
  NoTrips: () => (
    <Icon name="globe" size={96} className="mx-auto mb-4 text-primary-300 dark:text-sky/50" />
  ),

  NoPhotos: () => (
    <Icon name="photo" size={96} className="mx-auto mb-4 text-primary-300 dark:text-sky/50" />
  ),

  NoActivities: () => (
    <Icon name="checklist" size={96} className="mx-auto mb-4 text-primary-300 dark:text-sky/50" />
  ),

  NoTransportation: () => (
    <Icon name="navigate" size={96} className="mx-auto mb-4 text-primary-300 dark:text-sky/50" />
  ),

  NoLodging: () => (
    <Icon name="home" size={96} className="mx-auto mb-4 text-primary-300 dark:text-sky/50" />
  ),

  NoJournalEntries: () => (
    <Icon name="journal" size={96} className="mx-auto mb-4 text-primary-300 dark:text-sky/50" />
  ),

  NoCompanions: () => (
    <Icon name="users" size={96} className="mx-auto mb-4 text-primary-300 dark:text-sky/50" />
  ),

  NoTags: () => (
    <Icon name="tag" size={96} className="mx-auto mb-4 text-primary-300 dark:text-sky/50" />
  ),

  NoLocations: () => (
    <Icon name="place" size={96} className="mx-auto mb-4 text-primary-300 dark:text-sky/50" />
  ),
};
