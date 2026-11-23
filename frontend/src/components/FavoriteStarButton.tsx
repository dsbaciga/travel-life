import type { MouseEvent, KeyboardEvent } from "react";
import Icon from "./ui/Icon";

interface FavoriteStarButtonProps {
  isFavorite: boolean;
  onToggle: () => void;
  /**
   * `overlay` sits on top of a thumbnail, `toolbar` matches the lightbox
   * action buttons, `inline` is for list rows.
   */
  variant?: "overlay" | "toolbar" | "inline";
  className?: string;
  /**
   * For users who cannot edit the trip: renders a non-interactive indicator
   * when the photo is starred and nothing at all when it is not.
   */
  readOnly?: boolean;
}

const VARIANT_CLASSES: Record<NonNullable<FavoriteStarButtonProps["variant"]>, string> = {
  // The overlay button is a 32px corner hit area around a small drawn disc, so
  // the centre of a phone-sized thumbnail stays tappable for opening the photo.
  overlay: "touch-compact p-1 rounded-full group",
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
  readOnly = false,
}: FavoriteStarButtonProps) {
  if (readOnly) {
    if (!isFavorite) return null;
    return (
      <span
        role="img"
        aria-label="Favorite"
        title="Favorite"
        className={`inline-flex items-center justify-center ${
          variant === "overlay"
            ? "p-1.5 rounded-full bg-black/50 backdrop-blur-sm shadow-lg"
            : VARIANT_CLASSES[variant]
        } ${className}`}
      >
        <Icon name="starFilled" className="text-amber-400" />
      </span>
    );
  }

  const starName = isFavorite ? "starFilled" : "star";
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
      {variant === "overlay" ? (
        <span className="flex rounded-full bg-black/50 group-hover:bg-black/70 backdrop-blur-sm shadow-lg p-1">
          <Icon name={starName} size={16} className={iconColor} />
        </span>
      ) : (
        <Icon name={starName} className={iconColor} />
      )}
    </button>
  );
}
