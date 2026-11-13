import { getTimezoneAbbr } from './utils';
import type { MobileTimezoneToggleProps } from './types';

export default function MobileTimezoneToggle({
  activeTimezone,
  tripTimezone,
  userTimezone,
  onToggle,
}: MobileTimezoneToggleProps) {
  if (!tripTimezone || !userTimezone || tripTimezone === userTimezone) {
    return null;
  }

  return (
    <div className="flex items-center justify-center gap-1 text-xs">
      <span className="text-gray-500 dark:text-dusk-400 mr-1">Show times in:</span>
      <div className="flex rounded-md bg-gray-100 dark:bg-dusk-800 p-0.5">
        <button
          type="button"
          onClick={() => onToggle('trip')}
          className={`px-2 py-1 rounded font-medium transition-colors ${
            activeTimezone === 'trip'
              ? 'bg-white dark:bg-dusk-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-dusk-400'
          }`}
        >
          Trip ({getTimezoneAbbr(tripTimezone)})
        </button>
        <button
          type="button"
          onClick={() => onToggle('user')}
          className={`px-2 py-1 rounded font-medium transition-colors ${
            activeTimezone === 'user'
              ? 'bg-white dark:bg-dusk-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-dusk-400'
          }`}
        >
          Home ({getTimezoneAbbr(userTimezone)})
        </button>
      </div>
    </div>
  );
}
