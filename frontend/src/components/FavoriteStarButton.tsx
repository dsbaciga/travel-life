import type { MouseEvent, KeyboardEvent } from "react";
import { StarIcon as StarOutline } from "@heroicons/react/24/outline";
import { StarIcon as StarSolid } from "@heroicons/react/24/solid";

interface FavoriteStarButtonProps {
  isFavorite: boolean;
  onToggle: () => void;
  /**
   * `overlay` sits on top of a thumbnail, `toolbar` matches the lightbox
   * action buttons, `inline` is for list rows.
   */
  variant?: "overlay" | "toolbar" | "inline";
  className?: string;
}

const VARIANT_CLASSES: Record<NonNullable<FavoriteStarButtonProps["variant"]>, string> = {
  overlay:
    "p-1.5 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-sm shadow-lg",
  toolbar: "p-3 bg-black/50 hover:bg-white/20 rounded-lg",
  inline:
    "p-1.5 rounded-full bg-gray-100 dark:bg-dusk-700 hover:bg-gray-200 dark:hover:bg-dusk-600",
};

/**
 * Star toggle for marking a photo as a favorite. Stops click and key events
 * from bubbling so it can sit inside a clickable thumbnail without also
 * opening the lightbox or toggling selection.
 */
export default function FavoriteStarButton({
  isFavorite,
  onToggle,
  variant = "overlay",
  className = "",
}: FavoriteStarButtonProps) {
  const Icon = isFavorite ? StarSolid : StarOutline;
  const iconColor = isFavorite
    ? "text-amber-400"
    : variant === "inline"
      ? "text-gray-500 dark:text-dusk-300"
      : "text-white";

  return (
    <button
      type="button"
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        onToggle();
      }}
      onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
      aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={isFavorite}
      title={isFavorite ? "Remove from favorites" : "Add to favorites"}
      className={`transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 ${VARIANT_CLASSES[variant]} ${className}`}
    >
      <Icon className={`w-5 h-5 ${iconColor}`} aria-hidden="true" />
    </button>
  );
}
