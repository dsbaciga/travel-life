/**
 * LinkedEntitiesDisplay + LinkButton - one link control per card
 *
 * Test cases:
 * - LED-001: A manageable display shows "Edit links", which opens the link panel
 * - LED-002: A display that is not manageable has no "Edit links" button
 * - LED-003: A manageable display with no links renders nothing
 * - LED-004: A manageable display stays visible when the date filter hides every link
 * - LED-005: LinkButton with hideWhenLinked hides once the entity has links
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { EntityLinksResponse } from '../../types/entityLink';

const h = vi.hoisted(() => ({
  links: { getAllLinksForEntity: vi.fn() },
}));
vi.mock('../../services/entityLink.service', () => ({
  entityLinkService: h.links,
  default: h.links,
}));
vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../../hooks/useTimezoneResolver', () => ({
  useTimezoneResolver: () => (tz?: string | null) => tz || 'Europe/Madrid',
}));
vi.mock('../LinkPanel', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Link panel">
      <button type="button" onClick={onClose}>Close panel</button>
    </div>
  ),
}));
vi.mock('../EntityDetailModal', () => ({ default: () => null }));

import LinkedEntitiesDisplay from '../LinkedEntitiesDisplay';
import LinkButton from '../LinkButton';

const locationLink: EntityLinksResponse = {
  linksFrom: [
    {
      id: 1,
      tripId: 7,
      sourceType: 'LODGING',
      sourceId: 3,
      targetType: 'LOCATION',
      targetId: 11,
      relationship: 'RELATED',
      targetEntity: { id: 11, name: 'Marriott Marbella Beach' },
    },
  ],
  linksTo: [],
} as unknown as EntityLinksResponse;

const journalLink: EntityLinksResponse = {
  linksFrom: [
    {
      id: 2,
      tripId: 7,
      sourceType: 'LODGING',
      sourceId: 3,
      targetType: 'JOURNAL_ENTRY',
      targetId: 12,
      relationship: 'RELATED',
      targetEntity: { id: 12, title: 'Beach day', date: '2027-03-20' },
    },
  ],
  linksTo: [],
} as unknown as EntityLinksResponse;

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('LinkedEntitiesDisplay', () => {
  beforeEach(() => {
    h.links.getAllLinksForEntity.mockReset();
  });

  it('LED-001: a manageable display shows "Edit links", which opens the link panel', async () => {
    h.links.getAllLinksForEntity.mockResolvedValue(locationLink);
    wrap(<LinkedEntitiesDisplay tripId={7} entityType="LODGING" entityId={3} compact manageable />);

    expect(await screen.findByText('Marriott Marbella Beach')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit linked items' }));
    expect(screen.getByRole('dialog', { name: 'Link panel' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Close panel'));
    expect(screen.queryByRole('dialog', { name: 'Link panel' })).not.toBeInTheDocument();
  });

  it('LED-002: a display that is not manageable has no "Edit links" button', async () => {
    h.links.getAllLinksForEntity.mockResolvedValue(locationLink);
    wrap(<LinkedEntitiesDisplay tripId={7} entityType="LODGING" entityId={3} compact />);

    expect(await screen.findByText('Marriott Marbella Beach')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit linked items' })).not.toBeInTheDocument();
  });

  it('LED-003: a manageable display with no links renders nothing', async () => {
    h.links.getAllLinksForEntity.mockResolvedValue({ linksFrom: [], linksTo: [] });
    const { container } = wrap(
      <LinkedEntitiesDisplay tripId={7} entityType="LODGING" entityId={3} compact manageable />
    );

    await vi.waitFor(() => expect(h.links.getAllLinksForEntity).toHaveBeenCalled());
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('LED-004: a manageable display stays visible when the date filter hides every link', async () => {
    h.links.getAllLinksForEntity.mockResolvedValue(journalLink);
    wrap(
      <LinkedEntitiesDisplay
        tripId={7}
        entityType="LODGING"
        entityId={3}
        compact
        manageable
        currentDate={new Date('2027-03-18T12:00:00Z')}
        timezone="Europe/Madrid"
      />
    );

    expect(await screen.findByRole('button', { name: 'Edit linked items' })).toBeInTheDocument();
    expect(screen.queryByText('Beach day')).not.toBeInTheDocument();
  });
});

describe('LinkButton', () => {
  it('LED-005: with hideWhenLinked it hides once the entity has links', () => {
    const { rerender } = render(
      <LinkButton tripId={7} entityType="LODGING" entityId={3} hideWhenLinked size="sm" />
    );
    expect(screen.getByRole('button', { name: '0 linked items' })).toBeInTheDocument();

    rerender(
      <LinkButton
        tripId={7}
        entityType="LODGING"
        entityId={3}
        hideWhenLinked
        size="sm"
        linkSummary={{ entityType: 'LODGING', entityId: 3, linkCounts: { LOCATION: 1 }, totalLinks: 1 }}
      />
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
