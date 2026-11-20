import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLinkedCreate } from './useLinkedCreate';
import locationService from '../services/location.service';
import activityService from '../services/activity.service';
import lodgingService from '../services/lodging.service';
import entityLinkService from '../services/entityLink.service';

vi.mock('../services/location.service', () => ({ default: { createLocation: vi.fn() } }));
vi.mock('../services/activity.service', () => ({ default: { createActivity: vi.fn() } }));
vi.mock('../services/lodging.service', () => ({ default: { createLodging: vi.fn() } }));
vi.mock('../services/entityLink.service', () => ({ default: { createLink: vi.fn() } }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const setup = () => {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useLinkedCreate(7), { wrapper }).result.current;
};

const place = { id: 11, name: 'Louvre', address: 'Rue de Rivoli' };

describe('useLinkedCreate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a place with the trimmed name and address', async () => {
    vi.mocked(locationService.createLocation).mockResolvedValue(place as never);
    const { createPlaceNamed } = setup();

    await expect(createPlaceNamed('  Louvre ', ' Rue de Rivoli ')).resolves.toBe(place);
    expect(locationService.createLocation).toHaveBeenCalledWith({
      tripId: 7,
      name: 'Louvre',
      address: 'Rue de Rivoli',
    });
  });

  it('returns null instead of throwing when the place cannot be created', async () => {
    vi.mocked(locationService.createLocation).mockRejectedValue(new Error('nope'));
    const { createPlaceNamed } = setup();

    await expect(createPlaceNamed('Louvre')).resolves.toBeNull();
  });

  it('does not create a place for a blank name', async () => {
    const { createPlaceNamed } = setup();

    await expect(createPlaceNamed('   ')).resolves.toBeNull();
    expect(locationService.createLocation).not.toHaveBeenCalled();
  });

  it('creates an activity named after the place, located at the place', async () => {
    vi.mocked(activityService.createActivity).mockResolvedValue({ id: 21 } as never);
    const { createCompanionForPlace } = setup();

    await expect(createCompanionForPlace('activity', place)).resolves.toBe(true);
    expect(activityService.createActivity).toHaveBeenCalledWith({ tripId: 7, locationId: 11, name: 'Louvre' });
    // The place is the activity's own locationId, not a link
    expect(entityLinkService.createLink).not.toHaveBeenCalled();
  });

  it('creates a lodging carrying the place address, located at the place', async () => {
    vi.mocked(lodgingService.createLodging).mockResolvedValue({ id: 31 } as never);
    const { createCompanionForPlace } = setup();

    await expect(createCompanionForPlace('lodging', place)).resolves.toBe(true);
    expect(lodgingService.createLodging).toHaveBeenCalledWith({
      tripId: 7,
      locationId: 11,
      type: 'hotel',
      name: 'Louvre',
      address: 'Rue de Rivoli',
    });
    expect(entityLinkService.createLink).not.toHaveBeenCalled();
  });

  it('reports failure without linking when the companion cannot be created', async () => {
    vi.mocked(activityService.createActivity).mockRejectedValue(new Error('nope'));
    const { createCompanionForPlace } = setup();

    await expect(createCompanionForPlace('activity', place)).resolves.toBe(false);
    expect(entityLinkService.createLink).not.toHaveBeenCalled();
  });
});
