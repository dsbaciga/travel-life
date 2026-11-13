import { useEffect, useId, useState } from 'react';
import toast from 'react-hot-toast';
import userService from '../services/user.service';
import { useInvalidateMapsPreferences } from '../hooks/useMapsPreferences';
import {
  MAPS_APPS,
  MAPS_APP_DESCRIPTIONS,
  MAPS_APP_LABELS,
  isMapsApp,
  type MapsApp,
} from '../lib/mapsDeepLinks';

const NO_PREFERENCE = 'none';

export default function MapsAppSettings() {
  const invalidateMapsPreferences = useInvalidateMapsPreferences();
  const [preferredApp, setPreferredApp] = useState<MapsApp | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const selectId = useId();

  useEffect(() => {
    let cancelled = false;

    userService
      .getMapsSettings()
      .then((settings) => {
        if (!cancelled) setPreferredApp(settings.preferredMapsApp);
      })
      .catch((error: unknown) => {
        console.error('Failed to load maps settings:', error);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = async (value: string) => {
    const next: MapsApp | null = isMapsApp(value) ? value : null;
    const previous = preferredApp;

    setPreferredApp(next);
    setIsSaving(true);
    try {
      const settings = await userService.updateMapsSettings(next);
      setPreferredApp(settings.preferredMapsApp);
      invalidateMapsPreferences();
      toast.success(
        next === null
          ? 'Default maps app cleared'
          : `Default maps app set to ${MAPS_APP_LABELS[next]}`
      );
    } catch {
      setPreferredApp(previous);
      toast.error('Failed to save maps app preference');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-dusk-800 rounded-lg shadow p-6">
        <p className="text-gray-600 dark:text-dusk-400">Loading maps settings...</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-dusk-800 rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
        Directions &amp; Maps
      </h2>

      <p className="text-gray-600 dark:text-dusk-400 mb-6">
        Itinerary items show a Directions button that opens your route — with the
        previous stop pre-filled as the starting point — in an external app. Pick
        the app you want listed first.
      </p>

      <div className="max-w-md">
        <label className="label" htmlFor={selectId}>
          Default maps app
        </label>
        <select
          id={selectId}
          value={preferredApp ?? NO_PREFERENCE}
          disabled={isSaving}
          onChange={(e) => {
            void handleChange(e.target.value);
          }}
          className="input w-full disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <option value={NO_PREFERENCE}>No preference (show all)</option>
          {MAPS_APPS.map((app) => (
            <option key={app} value={app}>
              {MAPS_APP_LABELS[app]}
            </option>
          ))}
        </select>
        <p className="mt-2 text-sm text-gray-500 dark:text-dusk-400">
          {preferredApp === null
            ? 'Every app that can handle the route is offered, in a fixed order.'
            : MAPS_APP_DESCRIPTIONS[preferredApp]}
        </p>
      </div>

      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg">
        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
          How the links are built
        </h3>
        <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
          <li>
            Coordinates are used when an item has them, otherwise its address, and
            finally its name.
          </li>
          <li>
            On iPhone and iPad the links use the native app schemes; on Android and
            desktop they use the web URLs.
          </li>
          <li>
            Citymapper, Uber and Lyft need exact coordinates, so they are only
            offered for items that have them.
          </li>
        </ul>
      </div>
    </div>
  );
}
