import Icon from './ui/Icon';
import { useState, useEffect, useCallback, type ReactElement } from 'react';
import tripService from '../services/trip.service';
import type { ValidationResult, ValidationIssue, ValidationIssueCategory } from '../types/trip';
import toast from 'react-hot-toast';

interface TripHealthCheckProps {
  tripId: number;
  onQuickAction?: (action: ValidationIssue['quickAction']) => void;
}

const CATEGORY_CONFIG: Record<ValidationIssueCategory, {
  label: string;
  icon: ReactElement;
  color: string;
  bgColor: string;
}> = {
  SCHEDULE: {
    label: 'Schedule',
    icon: (
      <Icon name="schedule" className="w-5 h-5" />
    ),
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
  },
  ACCOMMODATIONS: {
    label: 'Stays',
    icon: (
      <Icon name="lodging" className="w-5 h-5" />
    ),
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
  },
  TRANSPORTATION: {
    label: 'Transport',
    icon: (
      <Icon name="transportation" className="w-5 h-5" />
    ),
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
  },
  COMPLETENESS: {
    label: 'Completeness',
    icon: (
      <Icon name="checklist" className="w-5 h-5" />
    ),
    color: 'text-slate dark:text-dusk-400',
    bgColor: 'bg-cream dark:bg-navy-800/50',
  },
  DOCUMENTS: {
    label: 'Documents & Visas',
    icon: (
      <Icon name="document" className="w-5 h-5" />
    ),
    color: 'text-rose-600 dark:text-rose-400',
    bgColor: 'bg-rose-50 dark:bg-rose-900/20',
  },
};

export default function TripHealthCheck({ tripId, onQuickAction }: TripHealthCheckProps) {
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDismissed, setShowDismissed] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<ValidationIssueCategory>>(
    new Set(['SCHEDULE', 'ACCOMMODATIONS', 'TRANSPORTATION', 'DOCUMENTS'])
  );

  const fetchValidation = useCallback(async () => {
    setLoading(true);
    try {
      const result = await tripService.validateTrip(tripId);
      setValidation(result);
    } catch (error) {
      console.error('Health check failed:', error);
      toast.error("Couldn't check trip health. Try again.");
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    fetchValidation();
  }, [fetchValidation]);

  const handleDismiss = async (issue: ValidationIssue) => {
    try {
      const [issueType, ...keyParts] = issue.id.split(':');
      const issueKey = keyParts.join(':');
      await tripService.dismissValidationIssue(tripId, issueType, issueKey, issue.category);
      toast.success('Issue dismissed');
      fetchValidation();
    } catch (error) {
      console.error('Failed to dismiss issue:', error);
      toast.error("Couldn't dismiss issue. Try again.");
    }
  };

  const handleRestore = async (issue: ValidationIssue) => {
    try {
      const [issueType, ...keyParts] = issue.id.split(':');
      const issueKey = keyParts.join(':');
      await tripService.restoreValidationIssue(tripId, issueType, issueKey);
      toast.success('Issue restored');
      fetchValidation();
    } catch (error) {
      console.error('Failed to restore issue:', error);
      toast.error("Couldn't restore issue. Try again.");
    }
  };

  const toggleCategory = (category: ValidationIssueCategory) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const getFilteredIssues = (issues: ValidationIssue[]) => {
    if (showDismissed) return issues;
    return issues.filter(i => !i.isDismissed);
  };

  if (loading) {
    return (
      <div className="card">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary-500 border-t-transparent" />
          <span className="text-gray-600 dark:text-dusk-400">Checking trip health…</span>
        </div>
      </div>
    );
  }

  if (!validation) {
    return (
      <div className="card">
        <p className="text-gray-600 dark:text-dusk-400">Couldn't check this trip. Try again.</p>
        <button
          onClick={fetchValidation}
          className="mt-3 text-sm text-primary-600 dark:text-gold hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  const isOkay = validation.status === 'okay';

  return (
    <div className="card p-0 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-navy-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Trip Health</h3>
            {/* Status Badge */}
            {isOkay ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                <Icon name="success" className="w-3.5 h-3.5" />
                Okay
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                <Icon name="alert" className="w-3.5 h-3.5" />
                {validation.activeIssues} Issue{validation.activeIssues !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {validation.dismissedIssues > 0 && (
              <button
                onClick={() => setShowDismissed(!showDismissed)}
                className="text-xs text-gray-500 dark:text-dusk-400 hover:text-gray-700 dark:hover:text-dusk-300 transition-colors"
              >
                {showDismissed ? 'Hide' : 'Show'} {validation.dismissedIssues} dismissed
              </button>
            )}
            <button
              onClick={fetchValidation}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-dusk-300 hover:bg-gray-100 dark:hover:bg-navy-700 transition-colors"
              title="Refresh"
            >
              <Icon name="refresh" className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {isOkay && validation.dismissedIssues === 0 ? (
          <div className="text-center py-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 mb-3">
              <Icon name="success" className="w-6 h-6" />
            </div>
            <p className="font-medium text-gray-900 dark:text-white">Looking good!</p>
            <p className="text-sm text-gray-500 dark:text-dusk-400 mt-1">Nothing to fix. Your trip looks good.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {(Object.keys(CATEGORY_CONFIG) as ValidationIssueCategory[]).map(category => {
              const config = CATEGORY_CONFIG[category];
              const issues = getFilteredIssues(validation.issuesByCategory[category]);

              if (issues.length === 0) return null;

              const activeCount = issues.filter(i => !i.isDismissed).length;
              const isExpanded = expandedCategories.has(category);

              return (
                <div key={category} className={`rounded-lg border ${config.bgColor} border-gray-200 dark:border-navy-600 overflow-hidden`}>
                  {/* Category Header */}
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full flex items-center justify-between p-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className={config.color}>{config.icon}</span>
                      <span className="font-medium text-gray-900 dark:text-white">{config.label}</span>
                      {activeCount > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-medium bg-gray-200 dark:bg-navy-600 text-gray-700 dark:text-dusk-300">
                          {activeCount}
                        </span>
                      )}
                    </div>
                    <Icon name="expand" className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Issues List */}
                  {isExpanded && (
                    <div className="border-t border-gray-200 dark:border-navy-600">
                      {issues.map(issue => (
                        <div
                          key={issue.id}
                          className={`p-3 border-b last:border-b-0 border-gray-200 dark:border-navy-600 ${
                            issue.isDismissed ? 'opacity-50' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm ${issue.isDismissed ? 'text-gray-500 dark:text-dusk-400' : 'text-gray-700 dark:text-dusk-300'}`}>
                                {issue.message}
                              </p>
                              {issue.suggestion && !issue.isDismissed && (
                                <p className="text-xs text-gray-500 dark:text-dusk-400 mt-1">
                                  {issue.suggestion}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {issue.quickAction && !issue.isDismissed && onQuickAction && (
                                <button
                                  onClick={() => onQuickAction(issue.quickAction)}
                                  className="text-xs px-2 py-1 rounded bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 hover:bg-primary-200 dark:hover:bg-primary-900/50 transition-colors"
                                >
                                  {issue.quickAction.label}
                                </button>
                              )}
                              {issue.isDismissed ? (
                                <button
                                  onClick={() => handleRestore(issue)}
                                  className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-dusk-300 transition-colors"
                                >
                                  Restore
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleDismiss(issue)}
                                  className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-dusk-300 hover:bg-gray-100 dark:hover:bg-navy-700 transition-colors"
                                  title="Dismiss"
                                >
                                  <Icon name="close" className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
