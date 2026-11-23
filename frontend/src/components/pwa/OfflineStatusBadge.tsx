import { useState, useEffect } from 'react';
import Icon from '../ui/Icon';
import { offlineDownloadService, type OfflineDownloadStatus } from '../../services/offlineDownload.service';

export interface OfflineStatusBadgeProps {
  /** Trip ID to check status for */
  tripId: number;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Whether to show text label */
  showLabel?: boolean;
  /** Custom class name */
  className?: string;
}

/**
 * Small badge to show on trip cards indicating offline status.
 *
 * States:
 * - not-downloaded: Cloud icon, shows download available
 * - downloading: Spinner, shows in progress
 * - downloaded: Check/CloudArrowDownIcon icon, shows available offline
 * - outdated: Warning icon, shows needs update
 *
 * @example
 * ```tsx
 * // On a trip card
 * <div className="trip-card relative">
 *   <OfflineStatusBadge
 *     tripId={trip.id}
 *     size="sm"
 *     className="absolute top-2 right-2"
 *   />
 *   {/<!-- rest of card -->/}
 * </div>
 *
 * // With label
 * <OfflineStatusBadge tripId={trip.id} showLabel />
 * ```
 */
export default function OfflineStatusBadge({
  tripId,
  size = 'sm',
  showLabel = false,
  className = '',
}: OfflineStatusBadgeProps) {
  const [status, setStatus] = useState<OfflineDownloadStatus>('not-downloaded');
  const [isLoading, setIsLoading] = useState(true);

  // Load status on mount and periodically check for changes
  useEffect(() => {
    const loadStatus = async () => {
      try {
        const currentStatus = await offlineDownloadService.getOfflineStatus(tripId);
        setStatus(currentStatus);
      } catch (err) {
        console.error('Failed to get offline status:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadStatus();

    // Check status periodically if downloading
    const interval = setInterval(() => {
      if (status === 'downloading') {
        loadStatus();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [tripId, status]);

  // Size classes
  const sizeClasses = {
    sm: {
      container: 'px-2 py-0.5 text-xs gap-1',
      icon: 'w-3 h-3',
    },
    md: {
      container: 'px-2.5 py-1 text-xs gap-1.5',
      icon: 'w-4 h-4',
    },
    lg: {
      container: 'px-3 py-1.5 text-sm gap-2',
      icon: 'w-5 h-5',
    },
  };

  // Don't show badge if not downloaded and not showing label
  if (status === 'not-downloaded' && !showLabel && !isLoading) {
    return null;
  }

  // Get status-specific styles and content
  const getStatusConfig = () => {
    switch (status) {
      case 'downloaded':
        return {
          bg: 'bg-emerald-100 dark:bg-emerald-900/40',
          text: 'text-emerald-700 dark:text-emerald-400',
          icon: 'cloudDone' as const,
          label: 'Offline',
          tooltip: 'Available offline',
        };
      case 'downloading':
        return {
          bg: 'bg-primary-100 dark:bg-primary-900/40',
          text: 'text-primary-700 dark:text-gold',
          icon: 'refresh' as const,
          label: 'Downloading',
          tooltip: 'Downloading for offline…',
          animate: true,
        };
      case 'outdated':
        return {
          bg: 'bg-amber-100 dark:bg-amber-900/40',
          text: 'text-amber-700 dark:text-amber-400',
          icon: 'refresh' as const,
          label: 'Outdated',
          tooltip: 'Offline data may be outdated',
        };
      case 'not-downloaded':
      default:
        return {
          bg: 'bg-parchment dark:bg-navy-700',
          text: 'text-slate dark:text-warm-gray/70',
          icon: 'cloud' as const,
          label: 'Online only',
          tooltip: 'Not downloaded for offline',
        };
    }
  };

  const config = getStatusConfig();
  const sizeConfig = sizeClasses[size];

  // Loading state
  if (isLoading) {
    return (
      <span
        className={`
          inline-flex items-center rounded-full font-medium
          ${sizeConfig.container}
          bg-parchment dark:bg-navy-700
          text-slate dark:text-warm-gray/70
          ${className}
        `}
      >
        <Icon name="refresh" className={`${sizeConfig.icon} animate-spin`} />
        {showLabel && <span>Loading</span>}
      </span>
    );
  }

  return (
    <span
      className={`
        inline-flex items-center rounded-full font-medium
        ${sizeConfig.container}
        ${config.bg}
        ${config.text}
        ${className}
      `}
      title={config.tooltip}
      role="status"
      aria-label={config.tooltip}
    >
      <Icon
        name={config.icon}
        className={`
          ${sizeConfig.icon}
          ${config.animate ? 'animate-spin' : ''}
        `}
      />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}

/**
 * Icon-only variant of the offline status badge.
 * Minimal footprint for use in tight spaces.
 */
OfflineStatusBadge.Icon = function OfflineStatusIcon({
  tripId,
  size = 'sm',
  className = '',
}: Omit<OfflineStatusBadgeProps, 'showLabel'>) {
  const [status, setStatus] = useState<OfflineDownloadStatus>('not-downloaded');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const currentStatus = await offlineDownloadService.getOfflineStatus(tripId);
        setStatus(currentStatus);
      } catch (err) {
        console.error('Failed to get offline status:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadStatus();
  }, [tripId]);

  // Size classes for icon-only variant
  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  // Don't show if not downloaded
  if (status === 'not-downloaded' && !isLoading) {
    return null;
  }

  // Get icon based on status
  const getIcon = () => {
    if (isLoading) {
      return (
        <Icon
          name="refresh"
          className={`${iconSizes[size]} text-slate dark:text-warm-gray/70 animate-spin`}
        />
      );
    }

    switch (status) {
      case 'downloaded':
        return (
          <Icon
            name="cloudDone"
            className={`${iconSizes[size]} text-emerald-600 dark:text-emerald-400`}
          />
        );
      case 'downloading':
        return (
          <Icon
            name="refresh"
            className={`${iconSizes[size]} text-primary-600 dark:text-gold animate-spin`}
          />
        );
      case 'outdated':
        return (
          <Icon
            name="alert"
            className={`${iconSizes[size]} text-amber-600 dark:text-amber-400`}
          />
        );
      default:
        return null;
    }
  };

  const icon = getIcon();
  if (!icon) return null;

  const tooltips = {
    downloaded: 'Available offline',
    downloading: 'Downloading…',
    outdated: 'Offline data outdated',
    'not-downloaded': '',
  };

  return (
    <span
      className={`inline-flex items-center ${className}`}
      title={tooltips[status]}
      role="status"
      aria-label={tooltips[status]}
    >
      {icon}
    </span>
  );
};

/**
 * Pill variant with more prominent styling.
 * Good for feature callouts or headers.
 */
OfflineStatusBadge.Pill = function OfflineStatusPill({
  tripId,
  className = '',
}: Pick<OfflineStatusBadgeProps, 'tripId' | 'className'>) {
  const [status, setStatus] = useState<OfflineDownloadStatus>('not-downloaded');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const currentStatus = await offlineDownloadService.getOfflineStatus(tripId);
        setStatus(currentStatus);
      } catch (err) {
        console.error('Failed to get offline status:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadStatus();
  }, [tripId]);

  if (isLoading) {
    return (
      <span
        className={`
          inline-flex items-center gap-2 px-3 py-1.5 rounded-full
          bg-parchment dark:bg-navy-700
          text-sm font-medium text-slate dark:text-warm-gray/70
          ${className}
        `}
      >
        <Icon name="refresh" className="w-4 h-4 animate-spin" />
        Checking…
      </span>
    );
  }

  // Get status-specific content
  const getContent = () => {
    switch (status) {
      case 'downloaded':
        return {
          bg: 'bg-emerald-500 dark:bg-emerald-600',
          text: 'text-white',
          icon: 'check' as const,
          label: 'Available offline',
        };
      case 'downloading':
        return {
          bg: 'bg-primary-500 dark:bg-gold',
          text: 'text-white dark:text-navy-900',
          icon: 'refresh' as const,
          label: 'Downloading…',
          animate: true,
        };
      case 'outdated':
        return {
          bg: 'bg-amber-500 dark:bg-amber-600',
          text: 'text-white',
          icon: 'refresh' as const,
          label: 'Update available',
        };
      case 'not-downloaded':
      default:
        return {
          bg: 'bg-parchment dark:bg-navy-700',
          text: 'text-slate dark:text-warm-gray',
          icon: 'download' as const,
          label: 'Not downloaded',
        };
    }
  };

  const content = getContent();

  return (
    <span
      className={`
        inline-flex items-center gap-2 px-3 py-1.5 rounded-full
        ${content.bg} ${content.text}
        text-sm font-medium
        shadow-sm
        ${className}
      `}
      role="status"
    >
      <Icon
        name={content.icon}
        className={`w-4 h-4 ${content.animate ? 'animate-spin' : ''}`}
      />
      {content.label}
    </span>
  );
};
