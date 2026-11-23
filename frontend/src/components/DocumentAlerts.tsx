import { useState, useEffect } from 'react';
import Icon from './ui/Icon';
import { Link } from 'react-router';
import travelDocumentService from '../services/travelDocument.service';
import type { DocumentAlert } from '../types/travelDocument';
import { getDocumentTypeIcon } from '../types/travelDocument';

interface DocumentAlertsProps {
  /** Maximum number of alerts to show (default: 3) */
  maxAlerts?: number;
  /** Whether to show a "View All" link */
  showViewAll?: boolean;
  /** Additional class names */
  className?: string;
  /** Compact mode for smaller displays */
  compact?: boolean;
}

/**
 * Compact alert banner showing expiring travel documents.
 * Used in dashboard and trip detail page.
 */
export default function DocumentAlerts({
  maxAlerts = 3,
  showViewAll = true,
  className = '',
  compact = false,
}: DocumentAlertsProps) {
  const [alerts, setAlerts] = useState<DocumentAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    loadAlerts();
  }, []);

  const loadAlerts = async () => {
    try {
      const data = await travelDocumentService.getAlerts();
      setAlerts(data);
    } catch (err) {
      console.error('Failed to load document alerts:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || alerts.length === 0 || dismissed) {
    return null;
  }

  const displayedAlerts = alerts.slice(0, maxAlerts);
  const remainingCount = alerts.length - maxAlerts;

  // Get the most severe alert type for styling the container
  const mostSevereType = alerts.reduce((worst, alert) => {
    const severity = { expired: 0, critical: 1, warning: 2, caution: 3 };
    return severity[alert.alertType] < severity[worst] ? alert.alertType : worst;
  }, alerts[0].alertType);

  const containerClasses = {
    expired: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    critical: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    warning: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800',
    caution: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
  };

  const textClasses = {
    expired: 'text-red-800 dark:text-red-200',
    critical: 'text-red-800 dark:text-red-200',
    warning: 'text-orange-800 dark:text-orange-200',
    caution: 'text-yellow-800 dark:text-yellow-200',
  };

  const iconClasses = {
    expired: 'text-red-600 dark:text-red-400',
    critical: 'text-red-600 dark:text-red-400',
    warning: 'text-orange-600 dark:text-orange-400',
    caution: 'text-yellow-600 dark:text-yellow-400',
  };

  if (compact) {
    return (
      <Link
        to="/settings?tab=documents"
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors hover:opacity-90 ${containerClasses[mostSevereType]} ${className}`}
      >
        <span className={iconClasses[mostSevereType]} aria-hidden="true">
          <Icon name={alerts.length === 1 ? getDocumentTypeIcon(alerts[0].document.type) : 'document'} />
        </span>
        <span className={`text-sm font-medium ${textClasses[mostSevereType]}`}>
          {alerts.length === 1 ? alerts[0].message : `${alerts.length} documents need attention`}
        </span>
      </Link>
    );
  }

  return (
    <div
      className={`rounded-lg border p-4 ${containerClasses[mostSevereType]} ${className}`}
      role="alert"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1">
          <span className={iconClasses[mostSevereType]} aria-hidden="true">
            <Icon name={mostSevereType === 'expired' || mostSevereType === 'critical' ? 'alert' : 'info'} size={24} />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className={`font-semibold ${textClasses[mostSevereType]}`}>
              {alerts.some(a => a.alertType === 'expired')
                ? 'Document Expired'
                : 'Document Expiring Soon'}
            </h3>
            <ul className="mt-2 space-y-1">
              {displayedAlerts.map((alert) => (
                <li
                  key={alert.document.id}
                  className={`text-sm flex items-center gap-2 ${textClasses[alert.alertType]}`}
                >
                  <Icon name={getDocumentTypeIcon(alert.document.type)} size={16} />
                  <span>{alert.message}</span>
                </li>
              ))}
            </ul>
            {remainingCount > 0 && (
              <p className={`text-sm mt-1 ${textClasses[mostSevereType]} opacity-75`}>
                +{remainingCount} more
              </p>
            )}
            {showViewAll && (
              <Link
                to="/settings?tab=documents"
                className={`inline-block mt-3 text-sm font-medium hover:underline ${textClasses[mostSevereType]}`}
              >
                Manage Documents &rarr;
              </Link>
            )}
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className={`p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 ${textClasses[mostSevereType]}`}
          aria-label="Dismiss alert"
        >
          <Icon name="close" />
        </button>
      </div>
    </div>
  );
}

/**
 * Inline badge version for headers/navigation
 */
DocumentAlerts.Badge = function DocumentAlertsBadge({ className = '' }: { className?: string }) {
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    travelDocumentService
      .getAlerts()
      .then((alerts) => setAlertCount(alerts.length))
      .catch(() => setAlertCount(0));
  }, []);

  if (alertCount === 0) {
    return null;
  }

  return (
    <Link
      to="/settings?tab=documents"
      className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors ${className}`}
      title={`${alertCount} document${alertCount === 1 ? '' : 's'} need attention`}
    >
      <span aria-hidden="true">!</span>
      <span>{alertCount}</span>
    </Link>
  );
};
