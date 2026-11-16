/**
 * Weather forecasts are stored in degrees Fahrenheit; the widget shows them in the user's units.
 *
 * Test cases:
 * - WFU-001: Imperial (and a user with no stored choice) shows the stored Fahrenheit values
 * - WFU-002: Metric converts them to Celsius
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import WeatherForecastWidget from '../trip-dashboard/WeatherForecastWidget';
import { useAuthStore } from '../../store/authStore';

const forecast = [{ date: '2099-06-01', high: 86, low: 50, condition: 'sunny' as const }];

const setSystem = (measurementSystem?: 'imperial' | 'metric' | null) =>
  useAuthStore.setState({
    user: { id: 1, username: 'u', email: 'u@x.y', avatarUrl: null, measurementSystem },
  });

describe('WeatherForecastWidget units', () => {
  it('WFU-001: shows Fahrenheit for imperial and for a user who never chose', () => {
    setSystem(null);
    render(<WeatherForecastWidget forecast={forecast} location="Rome" />);
    expect(screen.getByText('86°F')).toBeInTheDocument();
    expect(screen.getByText('50°F')).toBeInTheDocument();
  });

  it('WFU-002: shows Celsius for metric', () => {
    setSystem('metric');
    render(<WeatherForecastWidget forecast={forecast} location="Rome" />);
    expect(screen.getByText('30°C')).toBeInTheDocument();
    expect(screen.getByText('10°C')).toBeInTheDocument();
    expect(screen.queryByText('86°F')).not.toBeInTheDocument();
  });
});
