import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAuthStore } from '../../store/authStore';
import { useUnits } from '../useUnits';

const setUser = (measurementSystem?: 'imperial' | 'metric' | null) =>
  useAuthStore.setState({
    user: { id: 1, username: 'u', email: 'u@x.y', avatarUrl: null, measurementSystem },
  });

describe('useUnits', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null });
  });

  it('reads the system from the session user', () => {
    setUser('metric');
    const { result } = renderHook(() => useUnits());
    expect(result.current.system).toBe('metric');
    expect(result.current.distanceLabel).toBe('km');
    expect(result.current.temperatureScale).toBe('C');
    expect(result.current.formatDistance(100)).toBe('100 km');
    expect(result.current.formatTemperature(32)).toBe('0°C');
  });

  it('gives a user with no stored choice, or nobody signed in, the app default', () => {
    setUser(null);
    expect(renderHook(() => useUnits()).result.current.system).toBe('imperial');
    setUser(undefined);
    expect(renderHook(() => useUnits()).result.current.system).toBe('imperial');
    useAuthStore.setState({ user: null });
    const signedOut = renderHook(() => useUnits()).result.current;
    expect(signedOut.system).toBe('imperial');
    expect(signedOut.formatDistance(100)).toBe('62 mi');
  });

  it('follows a change to the session without a reload', () => {
    setUser('imperial');
    const { result } = renderHook(() => useUnits());
    expect(result.current.formatDistance(100)).toBe('62 mi');
    act(() => useAuthStore.getState().updateUser({ measurementSystem: 'metric' }));
    expect(result.current.formatDistance(100)).toBe('100 km');
  });
});
