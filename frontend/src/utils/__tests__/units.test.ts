import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MEASUREMENT_SYSTEM,
  celsiusToFahrenheit,
  distanceUnitLabel,
  distanceUnitName,
  distanceValue,
  fahrenheitToCelsius,
  formatDistance,
  formatTemperature,
  isMeasurementSystem,
  kmToMiles,
  otherMeasurementSystem,
  resolveMeasurementSystem,
  temperatureScale,
  temperatureValue,
} from '../units';

describe('measurement system', () => {
  it('defaults to imperial, in one constant', () => {
    expect(DEFAULT_MEASUREMENT_SYSTEM).toBe('imperial');
  });

  it('resolves a missing or unknown stored value to the default', () => {
    expect(resolveMeasurementSystem(undefined)).toBe(DEFAULT_MEASUREMENT_SYSTEM);
    expect(resolveMeasurementSystem(null)).toBe(DEFAULT_MEASUREMENT_SYSTEM);
    expect(resolveMeasurementSystem('miles')).toBe(DEFAULT_MEASUREMENT_SYSTEM);
    expect(resolveMeasurementSystem('metric')).toBe('metric');
    expect(resolveMeasurementSystem('imperial')).toBe('imperial');
  });

  it('recognises only the two systems', () => {
    expect(isMeasurementSystem('metric')).toBe(true);
    expect(isMeasurementSystem('imperial')).toBe(true);
    expect(isMeasurementSystem('si')).toBe(false);
    expect(isMeasurementSystem(null)).toBe(false);
  });

  it('knows the other system', () => {
    expect(otherMeasurementSystem('metric')).toBe('imperial');
    expect(otherMeasurementSystem('imperial')).toBe('metric');
  });
});

describe('distance', () => {
  it('converts km to miles', () => {
    expect(kmToMiles(1.609344)).toBeCloseTo(1, 9);
    expect(kmToMiles(100)).toBeCloseTo(62.137, 2);
    expect(distanceValue(100, 'metric')).toBe(100);
    expect(distanceValue(100, 'imperial')).toBeCloseTo(62.137, 2);
  });

  it('labels the units', () => {
    expect(distanceUnitLabel('metric')).toBe('km');
    expect(distanceUnitLabel('imperial')).toBe('mi');
    expect(distanceUnitName('imperial', 1)).toBe('mile');
    expect(distanceUnitName('imperial', 2)).toBe('miles');
    expect(distanceUnitName('metric', 1)).toBe('kilometer');
    expect(distanceUnitName('metric', 0)).toBe('kilometers');
  });

  it('formats in both systems', () => {
    expect(formatDistance(878, 'metric')).toBe('878 km');
    expect(formatDistance(878, 'imperial')).toBe('546 mi');
    expect(formatDistance(1240, 'metric')).toBe(`${(1240).toLocaleString()} km`);
    expect(formatDistance(1240, 'imperial')).toBe(`${(771).toLocaleString()} mi`);
  });

  it('uses one decimal under 10 and whole numbers from 10 up', () => {
    expect(formatDistance(2.54, 'metric')).toBe('2.5 km');
    expect(formatDistance(4, 'imperial')).toBe('2.5 mi');
    expect(formatDistance(9.96, 'metric')).toBe('10 km');
    expect(formatDistance(10.4, 'metric')).toBe('10 km');
  });

  it('shows nothing, negative or broken input as 0', () => {
    expect(formatDistance(0, 'metric')).toBe('0 km');
    expect(formatDistance(-5, 'imperial')).toBe('0 mi');
    expect(formatDistance(Number.NaN, 'metric')).toBe('0 km');
    expect(formatDistance(Number.POSITIVE_INFINITY, 'imperial')).toBe('0 mi');
  });
});

describe('temperature', () => {
  it('converts both ways', () => {
    expect(fahrenheitToCelsius(32)).toBe(0);
    expect(fahrenheitToCelsius(212)).toBe(100);
    expect(celsiusToFahrenheit(0)).toBe(32);
    expect(celsiusToFahrenheit(-40)).toBe(-40);
  });

  it('picks the scale for a system', () => {
    expect(temperatureScale('imperial')).toBe('F');
    expect(temperatureScale('metric')).toBe('C');
  });

  it('converts only when the stored scale differs from the displayed one', () => {
    expect(temperatureValue(72, 'F', 'imperial')).toBe(72);
    expect(temperatureValue(72, 'F', 'metric')).toBeCloseTo(22.22, 2);
    expect(temperatureValue(20, 'C', 'imperial')).toBe(68);
    expect(temperatureValue(20, 'C', 'metric')).toBe(20);
  });

  it('formats stored Fahrenheit by default', () => {
    expect(formatTemperature(72, 'imperial')).toBe('72°F');
    expect(formatTemperature(72, 'metric')).toBe('22°C');
    expect(formatTemperature(32, 'metric')).toBe('0°C');
    expect(formatTemperature(20, 'imperial', 'C')).toBe('68°F');
  });
});
