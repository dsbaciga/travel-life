import { useState, useRef, useEffect } from 'react';
import type { TimelineItemType } from './types';

export type PrintOption = 'standard' | 'with-maps';

interface TimelineFiltersProps {
  visibleTypes: Set<TimelineItemType>;
  onToggleType: (type: TimelineItemType) => void;
  viewMode: 'standard' | 'compact';
  onToggleViewMode: (mode: 'standard' | 'compact') => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onRefreshWeather?: () => void;
  onPrint?: (option: PrintOption) => void;
  refreshingWeather?: boolean;
}

const TYPE_CONFIG: Record<TimelineItemType, { label: string; shortLabel: string; color: string; bgColor: string }> = {
  activity: {
    label: 'Activities',
    shortLabel: 'Act',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
  },
  transportation: {
    label: 'Transport',
    shortLabel: 'Trans',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
  },
  lodging: {
    label: 'Lodging',
    shortLabel: 'Lodge',
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
  },
  journal: {
    label: 'Journal',
    shortLabel: 'Jrnl',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
  },
  customItem: {
    label: 'Custom',
    shortLabel: 'Cust',
    color: 'text-indigo-600 dark:text-indigo-400',
    bgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
  },
};

export default function TimelineFilters({
  visibleTypes,
  onToggleType,
  viewMode,
  onToggleViewMode,
  onExpandAll,
  onCollapseAll,
  onRefreshWeather,
  onPrint,
  refreshingWeather,
}: TimelineFiltersProps) {
  return (
    <div className="space-y-2">
      {/* Row 1: Type filters + View controls - all in one row */}
      <div className="flex items-center gap-2">
        {/* Type filters - scrollable on mobile */}
        <div className="flex gap-1.5 overflow-x-auto flex-1 pb-1 -mb-1 scrollbar-hide">
          {(Object.keys(TYPE_CONFIG) as TimelineItemType[]).map((type) => {
            const config = TYPE_CONFIG[type];
            const isActive = visibleTypes.has(type);

            return (
              <button
                key={type}
                type="button"
                onClick={() => onToggleType(type)}
                className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                  isActive
                    ? `${config.bgColor} ${config.color}`
                    : 'bg-gray-100 dark:bg-dusk-800 text-gray-500 dark:text-dusk-400 hover:bg-gray-200 dark:hover:bg-dusk-700'
                }`}
              >
                <span className="sm:hidden">{config.shortLabel}</span>
                <span className="hidden sm:inline">{config.label}</span>
              </button>
            );
          })}
        </div>

        {/* Divider - visible on larger screens */}
        <div className="hidden sm:block w-px h-6 bg-gray-200 dark:bg-dusk-700" />

        {/* View controls - compact icon buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Expand/Collapse */}
          <button
            type="button"
            onClick={onExpandAll}
            className="p-2.5 sm:p-2 rounded-lg text-gray-500 dark:text-dusk-400 hover:bg-gray-100 dark:hover:bg-dusk-800 hover:text-gray-700 dark:hover:text-dusk-200 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="Expand all days"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onCollapseAll}
            className="p-2.5 sm:p-2 rounded-lg text-gray-500 dark:text-dusk-400 hover:bg-gray-100 dark:hover:bg-dusk-800 hover:text-gray-700 dark:hover:text-dusk-200 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="Collapse all days"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
            </svg>
          </button>

          {/* Divider */}
          <div className="w-px h-5 bg-gray-200 dark:bg-dusk-700 mx-0.5" />

          {/* View mode toggle */}
          <button
            type="button"
            onClick={() => onToggleViewMode('standard')}
            className={`p-2.5 sm:p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${
              viewMode === 'standard'
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-dusk-400 hover:bg-gray-100 dark:hover:bg-dusk-800 hover:text-gray-700 dark:hover:text-dusk-200'
            }`}
            title="Standard view"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onToggleViewMode('compact')}
            className={`p-2.5 sm:p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${
              viewMode === 'compact'
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-dusk-400 hover:bg-gray-100 dark:hover:bg-dusk-800 hover:text-gray-700 dark:hover:text-dusk-200'
            }`}
            title="Compact view"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          </button>

          {/* Divider */}
          <div className="w-px h-5 bg-gray-200 dark:bg-dusk-700 mx-0.5" />

          {/* Weather refresh */}
          {onRefreshWeather && (
            <button
              type="button"
              onClick={onRefreshWeather}
              disabled={refreshingWeather}
              className="p-2.5 sm:p-2 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[44px] min-h-[44px] flex items-center justify-center"
              title="Refresh weather data"
            >
              <svg
                className={`w-4 h-4 ${refreshingWeather ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          )}

          {/* Print dropdown */}
          {onPrint && (
            <PrintDropdown onPrint={onPrint} />
          )}
        </div>
      </div>
    </div>
  );
}

// Print dropdown component
function PrintDropdown({ onPrint }: { onPrint: (option: PrintOption) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePrint = (option: PrintOption) => {
    setIsOpen(false);
    onPrint(option);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="p-2.5 sm:p-2 rounded-lg text-gray-500 dark:text-dusk-400 hover:bg-gray-100 dark:hover:bg-dusk-800 hover:text-gray-700 dark:hover:text-dusk-200 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
        title="Print timeline"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-48 rounded-lg bg-white dark:bg-dusk-800 shadow-lg ring-1 ring-black/5 dark:ring-white/10 z-50">
          <div className="py-1">
            <button
              type="button"
              onClick={() => handlePrint('standard')}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-dusk-200 hover:bg-gray-100 dark:hover:bg-dusk-700 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Print Itinerary
            </button>
            <button
              type="button"
              onClick={() => handlePrint('with-maps')}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-dusk-200 hover:bg-gray-100 dark:hover:bg-dusk-700 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              Print with Maps
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
