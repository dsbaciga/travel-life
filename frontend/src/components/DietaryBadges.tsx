import { useMemo } from "react";
import { DIETARY_TAGS } from "../constants/dietaryTags";

interface DietaryBadgesProps {
  tags: string[];
  userPreferences?: string[];
  maxDisplay?: number;
  className?: string;
  size?: "sm" | "md";
}

/**
 * Hook to transform tag IDs into tag data with preference matching.
 * Returns tags sorted with user preferences first.
 */
function useDietaryTagData(tags: string[], userPreferences: string[]) {
  return useMemo(() => {
    const tagData = tags
      .map((tagId) => {
        const tagInfo = DIETARY_TAGS.find((t) => t.id === tagId);
        if (!tagInfo) return null;
        return {
          ...tagInfo,
          isPreference: userPreferences.includes(tagId),
        };
      })
      .filter(Boolean) as Array<{
        id: string;
        label: string;
        emoji: string;
        isPreference: boolean;
      }>;

    // Sort so user preferences come first
    return [...tagData].sort((a, b) => {
      if (a.isPreference && !b.isPreference) return -1;
      if (!a.isPreference && b.isPreference) return 1;
      return 0;
    });
  }, [tags, userPreferences]);
}

/**
 * Compact inline display of dietary tags for activity cards.
 * Highlights tags that match user preferences with different styling.
 * Shows "+N more" if there are more than maxDisplay tags.
 */
export default function DietaryBadges({
  tags,
  userPreferences = [],
  maxDisplay = 4,
  className = "",
  size = "sm",
}: DietaryBadgesProps) {
  const sortedTags = useDietaryTagData(tags, userPreferences);

  if (sortedTags.length === 0) {
    return null;
  }

  const displayedTags = sortedTags.slice(0, maxDisplay);
  const remainingCount = sortedTags.length - maxDisplay;

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-sm px-2 py-1",
  };

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {displayedTags.map((tag) => (
        <span
          key={tag.id}
          title={tag.label}
          className={`
            inline-flex items-center rounded-full
            ${sizeClasses[size]}
            ${
              tag.isPreference
                ? "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 ring-1 ring-green-500/50"
                : "bg-gray-100 dark:bg-dusk-700 text-gray-700 dark:text-dusk-300"
            }
          `}
        >
          <span className={size === "sm" ? "text-sm" : "text-base"}>
            {tag.emoji}
          </span>
        </span>
      ))}
      {remainingCount > 0 && (
        <span
          className={`
            inline-flex items-center rounded-full text-gray-500 dark:text-dusk-400
            ${sizeClasses[size]}
          `}
          title={sortedTags
            .slice(maxDisplay)
            .map((t) => t.label)
            .join(", ")}
        >
          +{remainingCount}
        </span>
      )}
    </div>
  );
}

/**
 * Expanded version showing full labels for detail views.
 */
export function DietaryBadgesExpanded({
  tags,
  userPreferences = [],
  className = "",
}: Omit<DietaryBadgesProps, "maxDisplay" | "size">) {
  const sortedTags = useDietaryTagData(tags, userPreferences);

  if (sortedTags.length === 0) {
    return null;
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {sortedTags.map((tag) => (
        <span
          key={tag.id}
          className={`
            inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm
            ${
              tag.isPreference
                ? "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 ring-1 ring-green-500/50"
                : "bg-gray-100 dark:bg-dusk-700 text-gray-700 dark:text-dusk-300"
            }
          `}
        >
          <span>{tag.emoji}</span>
          <span>{tag.label}</span>
          {tag.isPreference && (
            <span
              className="ml-0.5 text-green-600 dark:text-green-400"
              title="Matches your dietary preference"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
