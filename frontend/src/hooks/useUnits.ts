import { useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import {
  distanceUnitLabel,
  formatDistance,
  formatTemperature,
  resolveMeasurementSystem,
  temperatureScale,
  type MeasurementSystem,
  type TemperatureScale,
} from '../utils/units';

export interface Units {
  system: MeasurementSystem;
  /** "km" or "mi". */
  distanceLabel: string;
  /** "C" or "F": the scale temperatures are shown in. */
  temperatureScale: TemperatureScale;
  /** Formats a distance given in kilometres. */
  formatDistance: (km: number) => string;
  /** Formats a temperature; `from` is the scale the value is stored in (default Fahrenheit). */
  formatTemperature: (value: number, from?: TemperatureScale) => string;
}

/**
 * The signed-in user's measurement system with formatters bound to it. Reads the value
 * carried in the session payload, so there is no fetch; a user who never chose gets the
 * app default (DEFAULT_MEASUREMENT_SYSTEM).
 */
export function useUnits(): Units {
  const stored = useAuthStore((s) => s.user?.measurementSystem);
  const system = resolveMeasurementSystem(stored);

  return useMemo(
    () => ({
      system,
      distanceLabel: distanceUnitLabel(system),
      temperatureScale: temperatureScale(system),
      formatDistance: (km: number) => formatDistance(km, system),
      formatTemperature: (value: number, from: TemperatureScale = 'F') =>
        formatTemperature(value, system, from),
    }),
    [system]
  );
}
