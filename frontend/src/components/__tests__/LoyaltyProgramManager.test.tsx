/**
 * LoyaltyProgramManager Component Tests (feature #109)
 *
 * Test IDs:
 * - LPM-001: Shows an empty state when there are no programs
 * - LPM-002: Lists programs with the number masked until revealed
 * - LPM-003: Creates a program from the form (aliases split, blanks become null)
 * - LPM-004: Edits a program, prefilling the full number
 * - LPM-005: Deletes after confirmation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoyaltyProgramManager from '../LoyaltyProgramManager';
import loyaltyProgramService from '../../services/loyaltyProgram.service';
import type { LoyaltyProgram } from '../../types/loyaltyProgram';

vi.mock('../../services/loyaltyProgram.service', () => {
  const mockService = {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  return {
    loyaltyProgramService: mockService,
    default: mockService,
    LOYALTY_PROGRAMS_QUERY_KEY: ['loyalty-programs'],
  };
});

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}));

const program: LoyaltyProgram = {
  id: 1,
  userId: 1,
  name: 'SkyMiles',
  type: 'AIRLINE',
  providerName: 'Delta Air Lines',
  providerCode: 'DL',
  alliance: 'SkyTeam',
  aliases: ['Delta', 'DL'],
  membershipNumber: '9876543210',
  tier: 'Gold',
  pointsBalance: 12500,
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderManager() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <LoyaltyProgramManager />
    </QueryClientProvider>
  );
}

describe('LoyaltyProgramManager', () => {
  beforeEach(() => {
    vi.mocked(loyaltyProgramService.getAll).mockReset();
    vi.mocked(loyaltyProgramService.create).mockReset();
    vi.mocked(loyaltyProgramService.update).mockReset();
    vi.mocked(loyaltyProgramService.delete).mockReset();
  });

  it('LPM-001: shows an empty state when there are no programs', async () => {
    vi.mocked(loyaltyProgramService.getAll).mockResolvedValue([]);
    renderManager();

    expect(await screen.findByText('No loyalty programs yet')).toBeInTheDocument();
  });

  it('LPM-002: lists programs with the number masked until revealed', async () => {
    vi.mocked(loyaltyProgramService.getAll).mockResolvedValue([program]);
    renderManager();

    expect(await screen.findByText('Delta Air Lines - SkyMiles')).toBeInTheDocument();
    expect(screen.getByText('***3210')).toBeInTheDocument();
    expect(screen.queryByText('9876543210')).not.toBeInTheDocument();
    expect(screen.getByText('Gold')).toBeInTheDocument();
    expect(screen.getByText('12,500')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Show membership number for SkyMiles/ }));
    expect(screen.getByText('9876543210')).toBeInTheDocument();
  });

  it('LPM-003: creates a program, splitting aliases and nulling blank optionals', async () => {
    vi.mocked(loyaltyProgramService.getAll).mockResolvedValue([]);
    vi.mocked(loyaltyProgramService.create).mockResolvedValue(program);
    renderManager();

    await userEvent.click((await screen.findAllByRole('button', { name: /Add Program|\+ Add/ }))[0]);
    const dialog = await screen.findByRole('dialog');

    await userEvent.type(within(dialog).getByLabelText('Program Name *'), 'SkyMiles');
    await userEvent.type(within(dialog).getByLabelText('Airline / Hotel / Brand *'), 'Delta Air Lines');
    await userEvent.type(within(dialog).getByLabelText('Other Names'), 'Delta, ,DL');
    await userEvent.type(within(dialog).getByLabelText('Membership Number *'), '9876543210');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add Program' }));

    await waitFor(() => expect(loyaltyProgramService.create).toHaveBeenCalled());
    expect(loyaltyProgramService.create).toHaveBeenCalledWith({
      name: 'SkyMiles',
      type: 'AIRLINE',
      providerName: 'Delta Air Lines',
      providerCode: null,
      alliance: null,
      aliases: ['Delta', 'DL'],
      membershipNumber: '9876543210',
      tier: null,
      pointsBalance: null,
      notes: null,
    });
  });

  it('LPM-004: edits a program with the full number prefilled', async () => {
    vi.mocked(loyaltyProgramService.getAll).mockResolvedValue([program]);
    vi.mocked(loyaltyProgramService.update).mockResolvedValue({ ...program, tier: 'Platinum' });
    renderManager();

    await userEvent.click(await screen.findByRole('button', { name: 'Edit SkyMiles' }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByLabelText('Membership Number *')).toHaveValue('9876543210');
    const tier = within(dialog).getByLabelText('Status Tier');
    await userEvent.clear(tier);
    await userEvent.type(tier, 'Platinum');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Update Program' }));

    await waitFor(() => expect(loyaltyProgramService.update).toHaveBeenCalled());
    expect(loyaltyProgramService.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ tier: 'Platinum', membershipNumber: '9876543210', pointsBalance: 12500 })
    );
  });

  it('LPM-005: deletes after confirmation', async () => {
    vi.mocked(loyaltyProgramService.getAll).mockResolvedValue([program]);
    vi.mocked(loyaltyProgramService.delete).mockResolvedValue(undefined);
    renderManager();

    await userEvent.click(await screen.findByRole('button', { name: 'Delete SkyMiles' }));
    expect(loyaltyProgramService.delete).not.toHaveBeenCalled();

    const confirmDialog = await screen.findByRole('dialog');
    await userEvent.click(within(confirmDialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(loyaltyProgramService.delete).toHaveBeenCalledWith(1));
  });
});
