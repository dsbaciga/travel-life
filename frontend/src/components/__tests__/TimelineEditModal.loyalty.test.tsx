/**
 * TimelineEditModal loyalty program tests (feature #109)
 *
 * Test IDs:
 * - TEM-LP-001: A lodging stay loads its existing loyalty program
 * - TEM-LP-002: Saving a lodging stay sends a changed or cleared program id
 * - TEM-LP-003: A transportation leg loads its existing loyalty program
 * - TEM-LP-004: Saving a transportation leg sends a changed or cleared program id
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TimelineEditModal from '../TimelineEditModal';
import lodgingService from '../../services/lodging.service';
import transportationService from '../../services/transportation.service';
import loyaltyProgramService from '../../services/loyaltyProgram.service';
import type { Lodging } from '../../types/lodging';
import type { Transportation } from '../../types/transportation';
import type { LoyaltyProgram } from '../../types/loyaltyProgram';

vi.mock('../../services/loyaltyProgram.service', () => {
  const mockService = { getAll: vi.fn() };
  return {
    loyaltyProgramService: mockService,
    default: mockService,
    LOYALTY_PROGRAMS_QUERY_KEY: ['loyalty-programs'],
  };
});
vi.mock('../../services/lodging.service', () => ({
  default: { updateLodging: vi.fn().mockResolvedValue({}) },
}));
vi.mock('../../services/transportation.service', () => ({
  default: { updateTransportation: vi.fn().mockResolvedValue({}) },
}));
vi.mock('../../services/entityLink.service', () => ({
  default: {
    getLinksFrom: vi.fn().mockResolvedValue([]),
    createLink: vi.fn().mockResolvedValue({}),
    deleteLink: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock('../../services/user.service', () => ({
  default: { getMe: vi.fn().mockResolvedValue({ activityCategories: [] }) },
}));

const makeProgram = (overrides: Partial<LoyaltyProgram> & { id: number }): LoyaltyProgram => ({
  userId: 1,
  name: 'SkyMiles',
  type: 'AIRLINE',
  providerName: 'Delta Air Lines',
  providerCode: 'DL',
  alliance: null,
  aliases: [],
  membershipNumber: '9876543210',
  tier: null,
  pointsBalance: null,
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const skymiles = makeProgram({ id: 1 });
const honors = makeProgram({
  id: 2,
  name: 'Honors',
  type: 'HOTEL',
  providerName: 'Hilton',
  providerCode: null,
  membershipNumber: 'H-555',
});

const lodging = (loyaltyProgramId: number | null): Lodging => ({
  id: 10,
  tripId: 1,
  locationId: null,
  type: 'hotel',
  name: 'Hilton Garden Inn',
  address: null,
  checkInDate: '2026-06-01T15:00:00.000Z',
  checkOutDate: '2026-06-03T11:00:00.000Z',
  timezone: 'UTC',
  confirmationNumber: null,
  loyaltyProgramId,
  cost: null,
  currency: 'USD',
  bookingUrl: null,
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const transportation = (loyaltyProgramId: number | null): Transportation => ({
  id: 20,
  tripId: 1,
  type: 'flight',
  fromLocationId: null,
  toLocationId: null,
  fromLocationName: 'JFK',
  toLocationName: 'LAX',
  departureTime: '2026-06-01T10:00:00.000Z',
  arrivalTime: '2026-06-01T14:00:00.000Z',
  startTimezone: 'UTC',
  endTimezone: 'UTC',
  carrier: 'Delta',
  vehicleNumber: 'DL100',
  confirmationNumber: null,
  loyaltyProgramId,
  cost: null,
  currency: 'USD',
  notes: null,
  connectionGroupId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

function renderModal(props: React.ComponentProps<typeof TimelineEditModal>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TimelineEditModal {...props} />
    </QueryClientProvider>
  );
}

const baseProps = {
  isOpen: true,
  onClose: vi.fn(),
  onSave: vi.fn(),
  tripId: 1,
  locations: [],
  tripTimezone: 'UTC',
};

async function findProgramSelect() {
  return (await screen.findByLabelText('Loyalty program')) as HTMLSelectElement;
}

describe('TimelineEditModal loyalty program', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loyaltyProgramService.getAll).mockResolvedValue([skymiles, honors]);
  });

  it('TEM-LP-001: loads the existing program on a lodging stay', async () => {
    renderModal({ ...baseProps, itemType: 'lodging', itemData: lodging(2) });
    const select = await findProgramSelect();
    await waitFor(() => expect(select.value).toBe('2'));
  });

  it('TEM-LP-002: saving a lodging stay sends the chosen or cleared program', async () => {
    const user = userEvent.setup();
    renderModal({ ...baseProps, itemType: 'lodging', itemData: lodging(2) });
    const select = await findProgramSelect();
    await waitFor(() => expect(select.value).toBe('2'));

    await user.selectOptions(select, '1');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(lodgingService.updateLodging).toHaveBeenCalledTimes(1));
    expect(vi.mocked(lodgingService.updateLodging).mock.calls[0][1]).toMatchObject({
      loyaltyProgramId: 1,
    });

    await user.selectOptions(select, '');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(lodgingService.updateLodging).toHaveBeenCalledTimes(2));
    expect(vi.mocked(lodgingService.updateLodging).mock.calls[1][1]).toMatchObject({
      loyaltyProgramId: null,
    });
  });

  it('TEM-LP-003: loads the existing program on a transportation leg', async () => {
    renderModal({ ...baseProps, itemType: 'transportation', itemData: transportation(1) });
    const select = await findProgramSelect();
    await waitFor(() => expect(select.value).toBe('1'));
  });

  it('TEM-LP-004: saving a transportation leg sends the chosen or cleared program', async () => {
    const user = userEvent.setup();
    renderModal({ ...baseProps, itemType: 'transportation', itemData: transportation(null) });
    const select = await findProgramSelect();

    await user.selectOptions(select, '1');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(transportationService.updateTransportation).toHaveBeenCalledTimes(1));
    expect(vi.mocked(transportationService.updateTransportation).mock.calls[0][1]).toMatchObject({
      loyaltyProgramId: 1,
    });

    await user.selectOptions(select, '');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(transportationService.updateTransportation).toHaveBeenCalledTimes(2));
    expect(vi.mocked(transportationService.updateTransportation).mock.calls[1][1]).toMatchObject({
      loyaltyProgramId: null,
    });
  });
});
