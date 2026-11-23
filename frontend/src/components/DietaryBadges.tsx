import { useMemo } from "react";
import Icon, { type IconName } from "./ui/Icon";
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
        icon: IconName;
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
          <Icon name={tag.icon} size={size === "sm" ? 16 : 20} />
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
          <Icon name={tag.icon} size={16} />
          <span>{tag.label}</span>
          {tag.isPreference && (
            <span
              className="ml-0.5 text-green-600 dark:text-green-400"
              title="Matches your dietary preference"
            >
              <Icon name="check" size={16} />
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
