import { formatOpeningHours, summarizeOpeningHours } from "../utils/openingHours";
import { useTimezoneResolver } from "../hooks/useTimezoneResolver";
import Icon from "./ui/Icon";

/**
 * LocationDisplay - Displays location name with hierarchical city/country info
 *
 * Parses address to extract city/country and displays it as secondary text.
 * Pattern: "Location Name" (large) + "City, Country" (smaller, muted)
 *
 * Optionally shows the location's opening hours. Hours are wall-clock times in the
 * location's own timezone, so the timezone is named alongside them whenever it differs
 * from the browser's — showing "09:00-17:00" without saying whose clock invites exactly
 * the mistake the closure warning exists to prevent.
 */

interface LocationDisplayProps {
  name: string;
  address?: string | null;
  className?: string;
  showFullAddress?: boolean;
  compact?: boolean;
  /** Raw OSM `opening_hours` string. Omit or pass null to hide the hours entirely. */
  openingHours?: string | null;
  /** IANA timezone the hours are expressed in. */
  timezone?: string | null;
}

/**
 * Extract city and country from an address string
 * Assumes address format: "Street, City, State/Region, Country" or similar
 * Takes the last 2 parts as the secondary location info
 */
function extractSecondaryLocation(address: string): string | null {
  if (!address) return null;

  // Split by comma and trim each part
  const parts = address.split(',').map(p => p.trim()).filter(p => p.length > 0);

  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];

  // Take the last 2 parts (usually city + country or state + country)
  const lastTwo = parts.slice(-2);
  return lastTwo.join(', ');
}

/**
 * Name the timezone the hours belong to, but only when it is not the viewer's own —
 * "09:00-17:00 (Europe/Paris)" is useful to someone in New York and noise to someone in Paris.
 */
function timezoneNote(
  timezone: string | null | undefined,
  viewerTimezone: string
): string | null {
  if (!timezone) return null;
  if (timezone === viewerTimezone) return null;
  return timezone.replace(/_/g, ' ');
}

export default function LocationDisplay({
  name,
  address,
  className = '',
  showFullAddress = false,
  compact = false,
  openingHours,
  timezone,
}: LocationDisplayProps) {
  const resolveTz = useTimezoneResolver();
  const secondaryLocation = address ? extractSecondaryLocation(address) : null;

  // Check if the name already contains the secondary location info
  // (to avoid redundant display like "Paris, France" with "Paris, France" below it)
  const shouldShowSecondary = secondaryLocation &&
    !name.toLowerCase().includes(secondaryLocation.toLowerCase().split(',')[0]);

  const hoursLines = formatOpeningHours(openingHours);
  const localZone = timezoneNote(timezone, resolveTz());

  if (compact) {
    return (
      <div className={className}>
        <div className="flex flex-wrap items-baseline gap-x-1.5 min-w-0">
          <span className="font-semibold text-charcoal dark:text-warm-gray break-words min-w-0">
            {name}
          </span>
          {shouldShowSecondary && (
            <span className="text-sm text-slate dark:text-warm-gray/60 break-words min-w-0">
              · {secondaryLocation}
            </span>
          )}
        </div>
        {hoursLines.length > 0 && (
          <p
            className="text-xs text-slate dark:text-warm-gray/60 mt-0.5"
            title={summarizeOpeningHours(openingHours)}
          >
            <Icon name="schedule" size={14} className="align-text-bottom mr-1" />
            {summarizeOpeningHours(openingHours)}
            {localZone && ` (${localZone})`}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <h3 className="text-lg font-semibold text-charcoal dark:text-warm-gray break-words">
        {name}
      </h3>
      {shouldShowSecondary && (
        <p className="text-sm text-slate dark:text-warm-gray/60 mt-0.5">
          {secondaryLocation}
        </p>
      )}
      {showFullAddress && address && (
        <p className="text-sm text-slate/80 dark:text-warm-gray/50 mt-1 line-clamp-2">
          {address}
        </p>
      )}
      {hoursLines.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium text-slate dark:text-warm-gray/70 flex items-center gap-1">
            <Icon name="schedule" size={14} />
            Opening hours
            {localZone && (
              <span className="font-normal text-slate/70 dark:text-warm-gray/50">
                ({localZone})
              </span>
            )}
          </p>
          <ul className="mt-0.5 space-y-0.5">
            {hoursLines.map((line, index) => (
              <li
                key={`${line.days}-${line.times}-${index}`}
                className="text-xs text-slate/90 dark:text-warm-gray/60"
              >
                {line.days && <span className="font-medium">{line.days}: </span>}
                {line.times}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
