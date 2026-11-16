import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RecentlyViewedWidget from '../RecentlyViewedWidget';
import { installMemoryLocalStorage } from '../../../test/memoryStorage';
import { createMockTrip } from '../../../test/fixtures';
import { readRecentTrips, writeRecentTrips } from '../../../utils/recentTrips';
import type { Trip } from '../../../types/trip';

let mockUser: { id: number } | null = { id: 1 };
vi.mock('../../../store/authStore', () => ({
  useAuthStore: (selector: (state: { user: { id: number } | null }) => unknown) =>
    selector({ user: mockUser }),
}));

const getTrips = vi.fn<() => Promise<{ trips: Trip[] }>>();
vi.mock('../../../services/trip.service', () => ({
  default: { getTrips: () => getTrips() },
}));

const thumb = vi.fn<(path: string | null | undefined, source: string | null | undefined) => string | null>();
vi.mock('../../../hooks/useImmichThumbnail', () => ({
  useImmichThumbnail: (path: string | null | undefined, source: string | null | undefined) =>
    thumb(path, source),
}));

function renderWidget() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <RecentlyViewedWidget />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('RecentlyViewedWidget', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    mockUser = { id: 1 };
    getTrips.mockReset();
    thumb.mockReset();
    thumb.mockReturnValue(null);
  });

  it('renders an Immich cover through the thumbnail hook, else the placeholder', async () => {
    const immich = createMockTrip({
      id: 31,
      title: 'Immich trip',
      coverImagePath: null,
      coverPhoto: {
        id: 1,
        localPath: null,
        thumbnailPath: '/api/immich/assets/abc/thumbnail',
        source: 'immich',
        immichAssetId: 'abc',
      },
    });
    writeRecentTrips(1, [{ tripId: 31, viewedAt: 1 }]);
    getTrips.mockResolvedValue({ trips: [immich] });
    thumb.mockImplementation((path) => (path ? 'blob:cover-1' : null));
    const { container, unmount } = renderWidget();

    await waitFor(() => expect(container.querySelector('img')).toHaveAttribute('src', 'blob:cover-1'));
    expect(thumb).toHaveBeenCalledWith('/api/immich/assets/abc/thumbnail', 'immich');
    unmount();

    thumb.mockReturnValue(null);
    const second = renderWidget();
    await waitFor(() => expect(screen.getByText('Immich trip')).toBeInTheDocument());
    expect(second.container.querySelector('img')).toBeNull();
    expect(second.container.querySelector('span[aria-hidden="true"]')).not.toBeNull();
  });

  it('renders nothing when there is nothing stored', () => {
    getTrips.mockResolvedValue({ trips: [] });
    const { container } = renderWidget();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when signed out', () => {
    mockUser = null;
    writeRecentTrips(1, [{ tripId: 1, viewedAt: 1, title: 'Hidden' }]);
    getTrips.mockResolvedValue({ trips: [] });
    const { container } = renderWidget();
    expect(container).toBeEmptyDOMElement();
  });

  it('lists trips most recent first with dates', async () => {
    const a = createMockTrip({ id: 11, title: 'Alpha', startDate: '2026-03-01', endDate: '2026-03-05' });
    const b = createMockTrip({ id: 12, title: 'Bravo' });
    writeRecentTrips(1, [
      { tripId: 11, viewedAt: 1 },
      { tripId: 12, viewedAt: 2 },
    ]);
    getTrips.mockResolvedValue({ trips: [a, b] });
    renderWidget();

    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/trips/12', '/trips/11']);
    expect(screen.getByText('Mar 1, 2026 – Mar 5, 2026')).toBeInTheDocument();
  });

  it('shows only the signed-in user entries', async () => {
    writeRecentTrips(1, [{ tripId: 11, viewedAt: 1, title: 'Mine' }]);
    writeRecentTrips(2, [{ tripId: 22, viewedAt: 1, title: 'Theirs' }]);
    getTrips.mockResolvedValue({
      trips: [createMockTrip({ id: 11, title: 'Mine' }), createMockTrip({ id: 22, title: 'Theirs' })],
    });
    renderWidget();

    await waitFor(() => expect(screen.getByText('Mine')).toBeInTheDocument());
    expect(screen.queryByText('Theirs')).not.toBeInTheDocument();
  });

  it('prunes trips that no longer exist and rewrites storage', async () => {
    writeRecentTrips(1, [
      { tripId: 11, viewedAt: 2, title: 'Kept' },
      { tripId: 99, viewedAt: 1, title: 'Gone' },
    ]);
    getTrips.mockResolvedValue({ trips: [createMockTrip({ id: 11, title: 'Kept' })] });
    renderWidget();

    await waitFor(() => expect(screen.queryByText('Gone')).not.toBeInTheDocument());
    expect(screen.getByText('Kept')).toBeInTheDocument();
    expect(readRecentTrips(1).map((e) => e.tripId)).toEqual([11]);
  });

  it('still renders from storage when the trips request fails (offline)', async () => {
    writeRecentTrips(1, [{ tripId: 11, viewedAt: 1, title: 'Cached title' }]);
    getTrips.mockRejectedValue(new Error('offline'));
    renderWidget();

    expect(screen.getByText('Cached title')).toBeInTheDocument();
    await waitFor(() => expect(getTrips).toHaveBeenCalled());
    expect(screen.getByText('Cached title')).toBeInTheDocument();
    expect(readRecentTrips(1)).toHaveLength(1);
  });
});
