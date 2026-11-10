/**
 * JetLagCalculator Component
 *
 * Displays timezone difference information and sleep adjustment recommendations
 * for trips that cross time zones.
 */

import { useState, useMemo } from 'react';
import { calculateJetLag, formatTimeDifference } from '../utils/jetlag';
import { ChevronDownIcon } from './icons';

interface JetLagCalculatorProps {
  homeTimezone: string;
  tripTimezone: string;
  /** Optional className for additional styling */
  className?: string;
  /** Variant for different display contexts */
  variant?: 'default' | 'compact' | 'overlay';
}

/**
 * Get severity badge styling based on severity level
 */
function getSeverityStyles(severity: 'none' | 'mild' | 'moderate' | 'severe') {
  switch (severity) {
    case 'none':
      return {
        badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
        icon: 'text-green-500 dark:text-green-400',
        label: 'No Jet Lag',
      };
    case 'mild':
      return {
        badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
        icon: 'text-yellow-500 dark:text-yellow-400',
        label: 'Mild Jet Lag',
      };
    case 'moderate':
      return {
        badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
        icon: 'text-orange-500 dark:text-orange-400',
        label: 'Moderate Jet Lag',
      };
    case 'severe':
      return {
        badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
        icon: 'text-red-500 dark:text-red-400',
        label: 'Severe Jet Lag',
      };
  }
}

/**
 * Clock icon for timezone display
 */
function ClockIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

/**
 * Moon icon for sleep recommendations
 */
function MoonIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
      />
    </svg>
  );
}

/**
 * Info icon for recommendations
 */
function InfoIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

export default function JetLagCalculator({
  homeTimezone,
  tripTimezone,
  className = '',
  variant = 'default',
}: JetLagCalculatorProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Calculate jet lag info
  const jetLagInfo = useMemo(
    () => calculateJetLag(homeTimezone, tripTimezone),
    [homeTimezone, tripTimezone]
  );

  // Don't render anything if timezones are the same or not set
  if (!homeTimezone || !tripTimezone || homeTimezone === tripTimezone) {
    return null;
  }

  // Don't render if no time difference (unless there's an error to display)
  if (jetLagInfo.direction === 'same' && !jetLagInfo.timezoneError) {
    return null;
  }

  // Show warning if timezone calculation failed
  if (jetLagInfo.timezoneError) {
    return (
      <div className={`inline-flex items-center gap-2 text-amber-600 dark:text-amber-400 ${className}`}>
        <InfoIcon className="w-4 h-4" />
        <span className="text-sm">
          {jetLagInfo.recommendations[0] || 'Unable to calculate jet lag'}
        </span>
      </div>
    );
  }

  const severityStyles = getSeverityStyles(jetLagInfo.severity);
  const timeDifferenceText = formatTimeDifference(
    jetLagInfo.hoursDifference,
    jetLagInfo.direction
  );

  // Overlay variant for use on cover photos
  if (variant === 'overlay') {
    return (
      <div className={`${className}`}>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 px-3 py-1.5 bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/40 rounded-lg text-sm font-medium text-white shadow-md transition-all hover:shadow-lg"
          aria-expanded={isExpanded}
          aria-controls="jetlag-recommendations"
        >
          <ClockIcon className="w-4 h-4" />
          <span>{timeDifferenceText}</span>
          <span className={`px-2 py-0.5 rounded-full text-xs ${severityStyles.badge}`}>
            {severityStyles.label}
          </span>
          <ChevronDownIcon
            className={`w-4 h-4 transition-transform duration-200 ${
              isExpanded ? 'rotate-180' : ''
            }`}
          />
        </button>

        {isExpanded && (
          <div
            id="jetlag-recommendations"
            className="mt-2 p-4 bg-black/50 backdrop-blur-md rounded-lg border border-white/20 animate-fade-in"
          >
            <div className="flex items-center gap-2 mb-3 text-white">
              <MoonIcon className="w-5 h-5" />
              <span className="font-medium">
                Sleep Adjustment Tips
                {jetLagInfo.adjustmentDays > 0 && (
                  <span className="ml-2 text-white/80 font-normal text-sm">
                    (~{jetLagInfo.adjustmentDays} day{jetLagInfo.adjustmentDays !== 1 ? 's' : ''} to adjust)
                  </span>
                )}
              </span>
            </div>
            <ul className="space-y-2">
              {jetLagInfo.recommendations.map((rec, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2 text-sm text-white/90"
                >
                  <span className="text-white/60 mt-0.5">-</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // Compact variant for tight spaces
  if (variant === 'compact') {
    return (
      <div className={`inline-flex items-center gap-2 ${className}`}>
        <ClockIcon className={`w-4 h-4 ${severityStyles.icon}`} />
        <span className="text-sm text-gray-600 dark:text-gray-300">
          {timeDifferenceText}
        </span>
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${severityStyles.badge}`}
          title={`${severityStyles.label} - Click to see recommendations`}
        >
          {jetLagInfo.severity === 'none' ? 'OK' : severityStyles.label.split(' ')[0]}
        </span>
      </div>
    );
  }

  // Default variant - card style
  return (
    <div
      className={`bg-white dark:bg-navy-800 rounded-xl shadow-sm border border-gray-200 dark:border-gold/20 overflow-hidden ${className}`}
    >
      {/* Header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-navy-700/50 transition-colors"
        aria-expanded={isExpanded}
        aria-controls="jetlag-recommendations"
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg bg-gray-100 dark:bg-navy-700 ${severityStyles.icon}`}>
            <ClockIcon className="w-5 h-5" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900 dark:text-white">
                {timeDifferenceText}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${severityStyles.badge}`}
              >
                {severityStyles.label}
              </span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {jetLagInfo.direction === 'ahead' ? 'Eastward' : 'Westward'} travel
              {jetLagInfo.adjustmentDays > 0 && (
                <span className="ml-1">
                  - ~{jetLagInfo.adjustmentDays} day{jetLagInfo.adjustmentDays !== 1 ? 's' : ''} to adjust
                </span>
              )}
            </p>
          </div>
        </div>
        <ChevronDownIcon
          className={`w-5 h-5 text-gray-400 dark:text-gray-400 transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Expandable recommendations section */}
      {isExpanded && (
        <div
          id="jetlag-recommendations"
          className="px-4 pb-4 border-t border-gray-100 dark:border-navy-700 animate-fade-in"
        >
          <div className="flex items-center gap-2 mt-4 mb-3">
            <MoonIcon className="w-4 h-4 text-primary-500 dark:text-gold" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Sleep Adjustment Recommendations
            </span>
          </div>
          <ul className="space-y-2 ml-6">
            {jetLagInfo.recommendations.map((rec, index) => (
              <li
                key={index}
                className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300"
              >
                <InfoIcon className="w-4 h-4 text-primary-400 dark:text-gold/70 flex-shrink-0 mt-0.5" />
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
