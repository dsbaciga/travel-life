/**
 * LoyaltyProgramField Component Tests (feature #109)
 *
 * Test IDs:
 * - LPF-001: Renders nothing when the user has no programs
 * - LPF-002: Offers a suggestion chip for a matching carrier, filled only on click
 * - LPF-003: Never replaces a program the user already chose
 * - LPF-004: Suggests nothing for a non-matching carrier
 * - LPF-005: The select can set and clear the program
 * - LPF-006: Hotel names match lodging programs
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoyaltyProgramField from '../LoyaltyProgramField';
import loyaltyProgramService from '../../services/loyaltyProgram.service';
import type { LoyaltyProgram } from '../../types/loyaltyProgram';

vi.mock('../../services/loyaltyProgram.service', () => {
  const mockService = { getAll: vi.fn() };
  return {
    loyaltyProgramService: mockService,
    default: mockService,
    LOYALTY_PROGRAMS_QUERY_KEY: ['loyalty-programs'],
  };
});

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

const delta = makeProgram({ id: 1 });
const hilton = makeProgram({
  id: 2,
  name: 'Honors',
  type: 'HOTEL',
  providerName: 'Hilton',
  providerCode: null,
  membershipNumber: 'H-555',
});

function renderField(props: Partial<React.ComponentProps<typeof LoyaltyProgramField>> = {}) {
  const onChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <LoyaltyProgramField
        kind="transportation"
        name="Delta"
        transportType="flight"
        value={null}
        onChange={onChange}
        {...props}
      />
    </QueryClientProvider>
  );
  return { onChange };
}

describe('LoyaltyProgramField', () => {
  beforeEach(() => {
    vi.mocked(loyaltyProgramService.getAll).mockReset();
  });

  it('LPF-001: renders nothing when the user has no programs', async () => {
    vi.mocked(loyaltyProgramService.getAll).mockResolvedValue([]);
    renderField();

    await waitFor(() => expect(loyaltyProgramService.getAll).toHaveBeenCalled());
    expect(screen.queryByLabelText('Loyalty program')).not.toBeInTheDocument();
  });

  it('LPF-002: offers a chip for a matching carrier and only fills on click', async () => {
    vi.mocked(loyaltyProgramService.getAll).mockResolvedValue([delta, hilton]);
    const { onChange } = renderField({ name: 'delta air lines' });

    const chip = await screen.findByRole('button', { name: /Use SkyMiles 9876543210/ });
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.click(chip);
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('LPF-003: does not suggest over a program the user already chose', async () => {
    vi.mocked(loyaltyProgramService.getAll).mockResolvedValue([delta]);
    renderField({ value: 1 });

    await screen.findByLabelText('Loyalty program');
    expect(screen.queryByTestId('loyalty-suggestions')).not.toBeInTheDocument();
    expect(screen.getByText('9876543210')).toBeInTheDocument();
  });

  it('LPF-004: suggests nothing for a carrier that matches no program', async () => {
    vi.mocked(loyaltyProgramService.getAll).mockResolvedValue([delta, hilton]);
    renderField({ name: 'Southwest' });

    await screen.findByLabelText('Loyalty program');
    expect(screen.queryByTestId('loyalty-suggestions')).not.toBeInTheDocument();
  });

  it('LPF-005: the select can set and clear the program', async () => {
    vi.mocked(loyaltyProgramService.getAll).mockResolvedValue([delta, hilton]);
    const { onChange } = renderField({ name: '', value: 1 });

    const select = await screen.findByLabelText('Loyalty program');
    await userEvent.selectOptions(select, '2');
    expect(onChange).toHaveBeenLastCalledWith(2);

    await userEvent.selectOptions(select, '');
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('LPF-006: hotel names match lodging programs and not airline ones', async () => {
    vi.mocked(loyaltyProgramService.getAll).mockResolvedValue([delta, hilton]);
    const { onChange } = renderField({ kind: 'lodging', name: 'Hilton Garden Inn Boston', transportType: undefined });

    const chip = await screen.findByRole('button', { name: /Use Honors H-555/ });
    expect(screen.queryByRole('button', { name: /SkyMiles/ })).not.toBeInTheDocument();
    await userEvent.click(chip);
    expect(onChange).toHaveBeenCalledWith(2);
  });
});
