/**
 * Timeline event card - route marker colours and place line
 *
 * Test cases:
 * - TEC-001: Upcoming stops use their type colour, the next stop is gold, past stops are grey
 * - TEC-002: Only a real location gets the italic serif .place-name; the category stays a plain subtitle
 * - TEC-003: The street address shows only when it differs from the place name
 */
import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TimelineEventCard from '../TimelineEventCard';
import { getTypeColor } from '../utils';
import type { TimelineItem } from '../types';
import type { Activity } from '../../../types/activity';

vi.mock('../../../hooks/useUnits', () => ({
  useUnits: () => ({ formatDistance: (km: number) => `${km} km` }),
}));
vi.mock('../../LinkedEntitiesDisplay', () => ({ default: () => null }));
vi.mock('../../LinkButton', () => ({ default: () => null }));
vi.mock('../../DirectionsButton', () => ({ default: () => null }));
vi.mock('../../../services/entityLink.service', () => ({
  default: { getPhotosForEntity: vi.fn().mockResolvedValue([]) },
}));

const item = (over: Partial<TimelineItem> = {}): TimelineItem => ({
  id: 1,
  type: 'activity',
  dateTime: new Date('2026-06-10T09:00:00Z'),
  title: 'Senso-ji visit',
  subtitle: 'sightseeing',
  data: { id: 1, name: 'Senso-ji visit' } as Activity,
  ...over,
});

const renderCard = (it: TimelineItem, routeStop: 'past' | 'next' | 'future') => {
  const { container } = render(
    <TimelineEventCard
      item={it}
      tripId={1}
      tripTimezone="Asia/Tokyo"
      showDualTime={false}
      viewMode="standard"
      routeStop={routeStop}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onLinkUpdate={vi.fn()}
    />
  );
  const marker = container.querySelector('.rounded-full.z-10') as HTMLElement;
  return { container, marker };
};

describe('TimelineEventCard route marker', () => {
  it('TEC-001: type colour when upcoming, gold when next, grey when past', () => {
    const upcoming = renderCard(item(), 'future').marker;
    expect(upcoming.className).toContain(getTypeColor('activity'));
    expect(upcoming.className).not.toContain('bg-gray-300');

    const next = renderCard(item({ type: 'transportation' }), 'next').marker;
    expect(next.className).toContain('bg-accent-500');

    const past = renderCard(item(), 'past').marker;
    expect(past.className).toContain('bg-gray-300');
  });
});

describe('TimelineEventCard place line', () => {
  it('TEC-002: category is a plain subtitle, a location is .place-name', () => {
    const noPlace = renderCard(item(), 'future').container;
    expect(noPlace.querySelector('.place-name')).toBeNull();
    expect(noPlace.textContent).toContain('sightseeing');

    const withPlace = renderCard(item({ location: 'Senso-ji Temple' }), 'future').container;
    const names = Array.from(withPlace.querySelectorAll('.place-name')).map((el) => el.textContent);
    expect(names).toEqual(['Senso-ji Temple']);
  });

  it('TEC-003: shows the address only when it adds information', () => {
    const same = renderCard(
      item({ location: 'Senso-ji Temple', locationAddress: 'Senso-ji Temple' }),
      'future'
    ).container;
    expect(same.textContent?.match(/Senso-ji Temple/g)).toHaveLength(1);

    const different = renderCard(
      item({ location: 'Senso-ji Temple', locationAddress: '2-3-1 Asakusa' }),
      'future'
    ).container;
    expect(different.textContent).toContain('2-3-1 Asakusa');
  });
});
