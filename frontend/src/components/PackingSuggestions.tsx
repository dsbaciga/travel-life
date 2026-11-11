import { useState, useEffect, useCallback, type ReactElement } from 'react';
import packingSuggestionService from '../services/packingSuggestion.service';
import checklistService from '../services/checklist.service';
import type {
  PackingSuggestion,
  PackingSuggestionCategory,
  PackingSuggestionPriority,
  PackingSuggestionsResponse,
} from '../types/packingSuggestion';
import toast from 'react-hot-toast';

interface PackingSuggestionsProps {
  tripId: number;
}

/**
 * Category configuration for display
 */
const CATEGORY_CONFIG: Record<
  PackingSuggestionCategory,
  {
    label: string;
    icon: ReactElement;
    color: string;
    bgColor: string;
  }
> = {
  clothing: {
    label: 'Clothing',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
        />
      </svg>
    ),
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
  },
  accessories: {
    label: 'Accessories',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
  },
  gear: {
    label: 'Gear',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
  },
  health: {
    label: 'Health & Safety',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
        />
      </svg>
    ),
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
  },
};

/**
 * Priority badge configuration
 */
const PRIORITY_CONFIG: Record<
  PackingSuggestionPriority,
  {
    label: string;
    color: string;
    bgColor: string;
  }
> = {
  essential: {
    label: 'Essential',
    color: 'text-red-700 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
  },
  recommended: {
    label: 'Recommended',
    color: 'text-amber-700 dark:text-amber-400',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
  },
  optional: {
    label: 'Optional',
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-700',
  },
};

export default function PackingSuggestions({ tripId }: PackingSuggestionsProps) {
  const [data, setData] = useState<PackingSuggestionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingToChecklist, setAddingToChecklist] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<PackingSuggestionCategory>>(
    new Set(['clothing', 'accessories', 'gear', 'health'])
  );

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    try {
      const result = await packingSuggestionService.getSuggestions(tripId);
      setData(result);
    } catch (error) {
      console.error('Failed to fetch packing suggestions:', error);
      toast.error('Failed to load packing suggestions');
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const handleAddToChecklist = async (suggestion: PackingSuggestion) => {
    setAddingToChecklist((prev) => new Set(prev).add(suggestion.id));

    try {
      // Check if a packing checklist exists for this trip, or create one
      const checklists = await checklistService.getChecklistsByTripId(tripId);
      let packingChecklist = checklists.find(
        (c) => c.name.toLowerCase().includes('packing') || c.type === 'custom'
      );

      if (!packingChecklist) {
        // Create a new packing checklist for this trip
        packingChecklist = await checklistService.createChecklist({
          name: 'Packing List',
          description: 'Items to pack based on weather suggestions',
          type: 'custom',
          tripId: tripId,
        });
      }

      // Add the item to the checklist
      await checklistService.addChecklistItem(packingChecklist.id, {
        name: suggestion.item,
        description: suggestion.reason,
      });

      toast.success(`Added "${suggestion.item}" to packing list`);
    } catch (error) {
      console.error('Failed to add to checklist:', error);
      toast.error('Failed to add item to checklist');
    } finally {
      setAddingToChecklist((prev) => {
        const next = new Set(prev);
        next.delete(suggestion.id);
        return next;
      });
    }
  };

  const toggleCategory = (category: PackingSuggestionCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const getSuggestionsByCategory = (
    suggestions: PackingSuggestion[]
  ): Record<PackingSuggestionCategory, PackingSuggestion[]> => {
    const grouped: Record<PackingSuggestionCategory, PackingSuggestion[]> = {
      clothing: [],
      accessories: [],
      gear: [],
      health: [],
    };

    for (const suggestion of suggestions) {
      grouped[suggestion.category].push(suggestion);
    }

    return grouped;
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-navy-800 rounded-xl shadow-sm border border-gray-200 dark:border-navy-700 p-6">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary-500 border-t-transparent" />
          <span className="text-gray-600 dark:text-gray-400">
            Analyzing weather data for packing suggestions...
          </span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white dark:bg-navy-800 rounded-xl shadow-sm border border-gray-200 dark:border-navy-700 p-6">
        <p className="text-gray-600 dark:text-gray-400">Unable to load packing suggestions</p>
        <button
          onClick={fetchSuggestions}
          className="mt-3 text-sm text-primary-600 dark:text-gold hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  const groupedSuggestions = getSuggestionsByCategory(data.suggestions);
  const hasAnySuggestions = data.suggestions.length > 0;

  return (
    <div className="bg-white dark:bg-navy-800 rounded-xl shadow-sm border border-gray-200 dark:border-navy-700 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-navy-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Packing Suggestions
            </h3>
            {hasAnySuggestions && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gold/20 text-gold">
                {data.suggestions.length} items
              </span>
            )}
          </div>
          <button
            onClick={fetchSuggestions}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-navy-700 transition-colors"
            title="Refresh suggestions"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>

        {/* Weather Summary */}
        {data.weatherSummary.minTemp !== null && (
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-100 dark:bg-navy-700 text-gray-700 dark:text-gray-300">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                />
              </svg>
              {Math.round(data.weatherSummary.minTemp)}° - {data.weatherSummary.maxTemp != null ? Math.round(data.weatherSummary.maxTemp) : '--'}°F
            </span>
            {data.weatherSummary.hasRain && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707"
                  />
                </svg>
                Rain expected
              </span>
            )}
            {data.weatherSummary.hasSnow && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400">
                Snow expected
              </span>
            )}
            {data.tripDays > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-100 dark:bg-navy-700 text-gray-700 dark:text-gray-300">
                {data.tripDays} day{data.tripDays !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {!hasAnySuggestions ? (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-navy-700 text-gray-400 dark:text-gray-400 mb-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                />
              </svg>
            </div>
            <p className="font-medium text-gray-900 dark:text-white">No suggestions available</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Add dates and locations to your trip to get weather-based packing suggestions.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {(Object.keys(CATEGORY_CONFIG) as PackingSuggestionCategory[]).map((category) => {
              const config = CATEGORY_CONFIG[category];
              const suggestions = groupedSuggestions[category];

              if (suggestions.length === 0) return null;

              const isExpanded = expandedCategories.has(category);

              return (
                <div
                  key={category}
                  className={`rounded-lg border ${config.bgColor} border-gray-200 dark:border-navy-600 overflow-hidden`}
                >
                  {/* Category Header */}
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full flex items-center justify-between p-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className={config.color}>{config.icon}</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {config.label}
                      </span>
                      <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-medium bg-gray-200 dark:bg-navy-600 text-gray-700 dark:text-gray-300">
                        {suggestions.length}
                      </span>
                    </div>
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>

                  {/* Suggestions List */}
                  {isExpanded && (
                    <div className="border-t border-gray-200 dark:border-navy-600">
                      {suggestions.map((suggestion) => {
                        const priorityConfig = PRIORITY_CONFIG[suggestion.priority];
                        const isAdding = addingToChecklist.has(suggestion.id);

                        return (
                          <div
                            key={suggestion.id}
                            className="p-3 border-b last:border-b-0 border-gray-200 dark:border-navy-600"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-gray-900 dark:text-white">
                                    {suggestion.item}
                                  </p>
                                  <span
                                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${priorityConfig.bgColor} ${priorityConfig.color}`}
                                  >
                                    {priorityConfig.label}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                  {suggestion.reason}
                                </p>
                              </div>
                              <button
                                onClick={() => handleAddToChecklist(suggestion)}
                                disabled={isAdding}
                                className="flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-lg bg-gold/10 text-gold hover:bg-gold/20 dark:bg-gold/20 dark:hover:bg-gold/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Add to packing checklist"
                              >
                                {isAdding ? (
                                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-gold border-t-transparent" />
                                ) : (
                                  <>
                                    <svg
                                      className="w-4 h-4"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M12 4v16m8-8H4"
                                      />
                                    </svg>
                                    Add
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
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
