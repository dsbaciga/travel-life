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
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
  },
  ACCOMMODATIONS: {
    label: 'Accommodations',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
  },
  TRANSPORTATION: {
    label: 'Transportation',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    ),
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
  },
  COMPLETENESS: {
    label: 'Completeness',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    color: 'text-slate dark:text-dusk-400',
    bgColor: 'bg-cream dark:bg-navy-800/50',
  },
  DOCUMENTS: {
    label: 'Documents & Visas',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
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
      toast.error('Failed to check trip health');
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
      toast.error('Failed to dismiss issue');
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
      toast.error('Failed to restore issue');
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
      <div className="bg-white dark:bg-navy-800 rounded-xl shadow-sm border border-gray-200 dark:border-navy-700 p-6">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary-500 border-t-transparent" />
          <span className="text-gray-600 dark:text-dusk-400">Checking trip health...</span>
        </div>
      </div>
    );
  }

  if (!validation) {
    return (
      <div className="bg-white dark:bg-navy-800 rounded-xl shadow-sm border border-gray-200 dark:border-navy-700 p-6">
        <p className="text-gray-600 dark:text-dusk-400">Unable to check trip health</p>
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
    <div className="bg-white dark:bg-navy-800 rounded-xl shadow-sm border border-gray-200 dark:border-navy-700 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-navy-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Trip Health</h3>
            {/* Status Badge */}
            {isOkay ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Okay
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
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
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {isOkay && validation.dismissedIssues === 0 ? (
          <div className="text-center py-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 mb-3">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="font-medium text-gray-900 dark:text-white">Looking good!</p>
            <p className="text-sm text-gray-500 dark:text-dusk-400 mt-1">No issues found with your trip.</p>
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
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
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
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
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
