import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AgendaList from './AgendaList';
import AgendaMap from './AgendaMap';
import type { AgendaItem } from '../../utils/dayAgenda';
import { nextBookings } from '../../utils/nextBookings';
import type { Transportation } from '../../types/transportation';
import type { Lodging } from '../../types/lodging';

const item = (over: Partial<AgendaItem>): AgendaItem => ({
  key: 'activity-1',
  number: 1,
  type: 'activity',
  entityId: 1,
  title: 'Museum',
  subtitle: null,
  time: '2026-05-10T01:00:00Z',
  timezone: 'Asia/Tokyo',
  allDay: false,
  point: { latitude: 35.68, longitude: 139.76 },
  endPoint: null,
  tab: 'activities',
  ...over,
});

const items: AgendaItem[] = [
  item({}),
  item({ key: 'activity-2', number: 2, entityId: 2, title: 'Free time', point: null, time: null, allDay: true }),
  item({
    key: 'transportation-3',
    number: 3,
    type: 'transportation',
    entityId: 3,
    title: 'Tokyo to Kyoto',
    tab: 'transportation',
    point: { latitude: 35.68, longitude: 139.76 },
    endPoint: { latitude: 35.01, longitude: 135.77 },
  }),
];

describe('AgendaList', () => {
  it('numbers every row, shows times in the item timezone and flags rows without a place', () => {
    render(<AgendaList items={items} />);

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    // 01:00Z is 10:00 in Tokyo.
    expect(rows[0]).toHaveTextContent('1');
    expect(rows[0]).toHaveTextContent('10:00 AM');
    expect(rows[0]).not.toHaveTextContent('no place set');
    expect(rows[1]).toHaveTextContent('All day');
    expect(rows[1]).toHaveTextContent('no place set');
  });

  it('reports hover and activation', () => {
    const onActiveChange = vi.fn();
    const onOpen = vi.fn();
    render(<AgendaList items={items} onActiveChange={onActiveChange} onOpen={onOpen} />);

    const row = screen.getByRole('button', { name: /Tokyo to Kyoto/ });
    fireEvent.mouseEnter(row);
    expect(onActiveChange).toHaveBeenLastCalledWith('transportation-3');
    fireEvent.click(row);
    expect(onOpen).toHaveBeenCalledWith(items[2]);
  });

  it('shows the empty message for a day with nothing on it', () => {
    render(<AgendaList items={[]} emptyMessage="Nothing today." />);
    expect(screen.getByText('Nothing today.')).toBeInTheDocument();
  });
});

describe('AgendaMap', () => {
  it('draws one numbered pin per item that has a place, using the list numbers', async () => {
    const { container } = render(<AgendaMap items={items} className="h-64" />);

    await waitFor(() => {
      expect(container.querySelectorAll('.agenda-pin')).toHaveLength(2);
    });
    const numbers = [...container.querySelectorAll('.agenda-pin')].map((pin) => pin.textContent);
    // Item 2 has no place, so its number is skipped on the map, not reassigned.
    expect(numbers).toEqual(['1', '3']);
  });

  it('explains an empty map instead of rendering one', () => {
    const { container } = render(
      <AgendaMap items={[item({ point: null })]} className="h-64" />
    );
    expect(container.querySelector('.leaflet-container')).toBeNull();
    expect(screen.getByText(/has a place attached/)).toBeInTheDocument();
  });
});

describe('nextBookings', () => {
  const now = Date.parse('2026-05-10T00:00:00Z');
  const leg = (id: number, departureTime: string | null): Transportation =>
    ({ id, type: 'train', departureTime, startTimezone: null, carrier: null, vehicleNumber: null, fromLocationName: 'A', toLocationName: 'B' }) as Transportation;
  const stay = (id: number, checkInDate: string | null): Lodging =>
    ({ id, type: 'hotel', name: `Hotel ${id}`, checkInDate, timezone: null }) as Lodging;

  it('returns upcoming bookings soonest first, skipping past and undated ones', () => {
    const rows = nextBookings(
      [leg(1, '2026-05-09T10:00:00Z'), leg(2, '2026-05-12T10:00:00Z'), leg(3, null)],
      [stay(4, '2026-05-11T06:00:00Z'), stay(5, '2026-05-20T06:00:00Z'), stay(6, '2026-05-30T06:00:00Z')],
      () => 'UTC',
      3,
      now
    );
    expect(rows.map((row) => row.key)).toEqual(['l-4', 't-2', 'l-5']);
  });
});
