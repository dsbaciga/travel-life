import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: string | ReactNode;
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
 *   icon="🎯"
 *   message="No activities yet"
 *   subMessage="Add activities to your trip"
 * />
 *
 * // With action button
 * <EmptyState
 *   icon="📸"
 *   message="No photos yet"
 *   subMessage="Upload your first photo"
 *   actionLabel="Upload Photo"
 *   onAction={() => setShowUploadModal(true)}
 * />
 *
 * // With link action
 * <EmptyState
 *   icon="✈️"
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
      'mt-4 px-6 py-3 rounded-lg font-semibold font-body bg-gradient-to-r from-primary-500 to-primary-600 dark:from-accent-400 dark:to-accent-600 text-white shadow-lg shadow-primary-500/20 dark:shadow-accent-400/20 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200';

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
      className={`text-center py-12 px-6 bg-white/80 dark:bg-navy-800/80 backdrop-blur-sm rounded-2xl border-2 border-primary-500/10 dark:border-sky/10 ${className}`}
      role="status"
    >
      {icon && (
        <div className="text-6xl mb-4 animate-bounce-slow" aria-hidden="true">
          {typeof icon === 'string' ? (
            <span className="inline-block">{icon}</span>
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
      <ActionButton />
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
        <span className="text-2xl" aria-hidden="true">
          {icon}
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
    <svg className="w-24 h-24 mx-auto mb-4 text-primary-300 dark:text-sky/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),

  NoPhotos: () => (
    <svg className="w-24 h-24 mx-auto mb-4 text-primary-300 dark:text-sky/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),

  NoActivities: () => (
    <svg className="w-24 h-24 mx-auto mb-4 text-primary-300 dark:text-sky/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),

  NoTransportation: () => (
    <svg className="w-24 h-24 mx-auto mb-4 text-primary-300 dark:text-sky/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  ),

  NoLodging: () => (
    <svg className="w-24 h-24 mx-auto mb-4 text-primary-300 dark:text-sky/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),

  NoJournalEntries: () => (
    <svg className="w-24 h-24 mx-auto mb-4 text-primary-300 dark:text-sky/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),

  NoCompanions: () => (
    <svg className="w-24 h-24 mx-auto mb-4 text-primary-300 dark:text-sky/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),

  NoTags: () => (
    <svg className="w-24 h-24 mx-auto mb-4 text-primary-300 dark:text-sky/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  ),

  NoLocations: () => (
    <svg className="w-24 h-24 mx-auto mb-4 text-primary-300 dark:text-sky/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};
