import { useState, useEffect, useCallback } from 'react';
import packingSuggestionService from '../services/packingSuggestion.service';
import checklistService from '../services/checklist.service';
import type {
  PackingSuggestion,
  PackingSuggestionCategory,
  PackingSuggestionPriority,
  PackingSuggestionsResponse,
} from '../types/packingSuggestion';
import toast from 'react-hot-toast';
import { useUnits } from '../hooks/useUnits';
import Icon, { type IconName } from './ui/Icon';

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
    icon: IconName;
    color: string;
    bgColor: string;
  }
> = {
  clothing: {
    label: 'Clothing',
    icon: 'luggage',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
  },
  accessories: {
    label: 'Accessories',
    icon: 'tag',
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
  },
  gear: {
    label: 'Gear',
    icon: 'settings',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
  },
  health: {
    label: 'Health & Safety',
    icon: 'medical',
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
    color: 'text-gray-600 dark:text-dusk-400',
    bgColor: 'bg-gray-100 dark:bg-dusk-700',
  },
};

export default function PackingSuggestions({ tripId }: PackingSuggestionsProps) {
  const { formatTemperature } = useUnits();
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
      toast.error("Couldn't load packing suggestions. Try again.");
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
      toast.error("Couldn't add item to checklist. Try again.");
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
          <span className="text-gray-600 dark:text-dusk-400">
            Analyzing weather data for packing suggestions…
          </span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white dark:bg-navy-800 rounded-xl shadow-sm border border-gray-200 dark:border-navy-700 p-6">
        <p className="text-gray-600 dark:text-dusk-400">Unable to load packing suggestions</p>
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
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-dusk-300 hover:bg-gray-100 dark:hover:bg-navy-700 transition-colors"
            title="Refresh suggestions"
          >
            <Icon name="refresh" size={16} />
          </button>
        </div>

        {/* Weather Summary */}
        {data.weatherSummary.minTemp !== null && (
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-100 dark:bg-navy-700 text-gray-700 dark:text-dusk-300">
              <Icon name="weatherCloudy" size={16} />
              {formatTemperature(data.weatherSummary.minTemp)} - {data.weatherSummary.maxTemp != null ? formatTemperature(data.weatherSummary.maxTemp) : '--'}
            </span>
            {data.weatherSummary.hasRain && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                <Icon name="weatherRain" size={16} />
                Rain expected
              </span>
            )}
            {data.weatherSummary.hasSnow && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400">
                Snow expected
              </span>
            )}
            {data.tripDays > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-100 dark:bg-navy-700 text-gray-700 dark:text-dusk-300">
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
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-navy-700 text-gray-400 dark:text-dusk-400 mb-3">
              <Icon name="checklist" size={24} />
            </div>
            <p className="font-medium text-gray-900 dark:text-white">No suggestions available</p>
            <p className="text-sm text-gray-500 dark:text-dusk-400 mt-1">
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
                      <span className={config.color}><Icon name={config.icon} /></span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {config.label}
                      </span>
                      <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-medium bg-gray-200 dark:bg-navy-600 text-gray-700 dark:text-dusk-300">
                        {suggestions.length}
                      </span>
                    </div>
                    <Icon name="expand" size={16} className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
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
                                <p className="text-sm text-gray-500 dark:text-dusk-400 mt-0.5">
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
                                    <Icon name="add" size={16} />
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
