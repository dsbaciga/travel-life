/**
 * Measurement units (imperial / metric): the one place that converts and formats distance
 * and temperature for display.
 *
 * Everything stored or sent over the API stays metric (distances in km); convert only when
 * rendering. The one exception is weather: forecasts are fetched and stored in degrees
 * Fahrenheit, so temperature helpers take the unit the value is in.
 */

export type MeasurementSystem = 'imperial' | 'metric';

/**
 * What a user who never chose sees. The single place to flip the app's default; the server
 * stores null for "never chose", so changing this changes those users too.
 */
export const DEFAULT_MEASUREMENT_SYSTEM: MeasurementSystem = 'imperial';

export const MEASUREMENT_SYSTEMS: readonly MeasurementSystem[] = ['imperial', 'metric'];

/** The other system, for showing a value in both. */
export const otherMeasurementSystem = (system: MeasurementSystem): MeasurementSystem =>
  system === 'imperial' ? 'metric' : 'imperial';

export function isMeasurementSystem(value: unknown): value is MeasurementSystem {
  return value === 'imperial' || value === 'metric';
}

/** The user's stored value, or the app default when it is missing or not a known system. */
export function resolveMeasurementSystem(value: unknown): MeasurementSystem {
  return isMeasurementSystem(value) ? value : DEFAULT_MEASUREMENT_SYSTEM;
}

// ---------------------------------------------------------------------------
// Distance (input is always kilometres)
// ---------------------------------------------------------------------------

export const KM_PER_MILE = 1.609344;

export const kmToMiles = (km: number): number => km / KM_PER_MILE;

/** Distance in the unit of `system`: kilometres stay, miles are converted. */
export function distanceValue(km: number, system: MeasurementSystem): number {
  return system === 'imperial' ? kmToMiles(km) : km;
}

/** Short unit label: "km" or "mi". */
export function distanceUnitLabel(system: MeasurementSystem): string {
  return system === 'imperial' ? 'mi' : 'km';
}

/** Spelled-out unit with the right number: "1 mile", "2 miles", "1 kilometer". */
export function distanceUnitName(system: MeasurementSystem, count = 2): string {
  const one = count === 1;
  if (system === 'imperial') return one ? 'mile' : 'miles';
  return one ? 'kilometer' : 'kilometers';
}

/** Whole numbers from 10 up, one decimal below 10 ("2.5 mi", "880 km"); "0" for nothing. */
function roundDistance(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (value < 10) {
    const oneDecimal = Math.round(value * 10) / 10;
    // 9.96 rounds to 10.0: show "10", not "10.0".
    return oneDecimal >= 10 ? '10' : oneDecimal.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }
  return Math.round(value).toLocaleString();
}

/**
 * "878 km" / "546 mi". `km` is in kilometres whatever the system; negative and non-finite
 * values show as 0.
 */
export function formatDistance(km: number, system: MeasurementSystem): string {
  return `${roundDistance(distanceValue(km, system))} ${distanceUnitLabel(system)}`;
}

// ---------------------------------------------------------------------------
// Temperature
// ---------------------------------------------------------------------------

export type TemperatureScale = 'F' | 'C';

export const fahrenheitToCelsius = (f: number): number => ((f - 32) * 5) / 9;
export const celsiusToFahrenheit = (c: number): number => (c * 9) / 5 + 32;

/** The scale a system displays: Fahrenheit for imperial, Celsius for metric. */
export function temperatureScale(system: MeasurementSystem): TemperatureScale {
  return system === 'imperial' ? 'F' : 'C';
}

/** Converts a reading taken in `from` into the scale shown for `system`. */
export function temperatureValue(value: number, from: TemperatureScale, system: MeasurementSystem): number {
  const to = temperatureScale(system);
  if (from === to) return value;
  return from === 'F' ? fahrenheitToCelsius(value) : celsiusToFahrenheit(value);
}

/** "72°F" / "22°C", rounded to a whole degree. `from` is the scale `value` is stored in. */
export function formatTemperature(
  value: number,
  system: MeasurementSystem,
  from: TemperatureScale = 'F'
): string {
  return `${Math.round(temperatureValue(value, from, system))}°${temperatureScale(system)}`;
}
