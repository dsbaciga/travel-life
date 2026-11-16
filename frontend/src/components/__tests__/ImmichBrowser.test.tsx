/**
 * ImmichBrowser - server-side filtering, linked marks, bulk import entry point
 *
 * Nothing here talks to a real Immich server; the service layer is mocked.
 *
 * Test cases:
 * - IB-001: Opens on the trip's whole local days (date part only) in the trip timezone, asking for page 1
 * - IB-002: Favourites, media type and album filters are sent to the server and reset to page 1
 * - IB-003: Search is a filter sent on Enter, not a client-side scan
 * - IB-004: "This trip's dates" restores the trip range after it was changed
 * - IB-005: Paging asks the server for the next page
 * - IB-006: Already-linked assets are marked and cannot be selected
 * - IB-007: "Link all matching" appears only when a trip and a bulk callback are given
 * - IB-008: A failed load shows the error and Try again re-requests
 * - IB-009: imagesOnly forces the IMAGE type and hides the type filter
 * - IB-010: Select All on Page skips linked assets
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ImmichAsset } from '../../types/immich';

const h = vi.hoisted(() => ({
  immich: {
    queryAssets: vi.fn(),
    getAlbums: vi.fn(),
    getAlbumById: vi.fn(),
    previewBulkLink: vi.fn(),
    linkBulkPage: vi.fn(),
  },
}));

vi.mock('../../services/immich.service', () => ({ default: h.immich }));
vi.mock('../../lib/axios', () => ({ getAccessToken: () => null, default: {} }));

import ImmichBrowser from '../ImmichBrowser';

const asset = (id: string, over: Partial<ImmichAsset> = {}): ImmichAsset =>
  ({
    id,
    type: 'IMAGE',
    originalFileName: `${id}.jpg`,
    isFavorite: false,
    thumbnailUrl: `/api/immich/assets/${id}/thumbnail`,
    ...over,
  }) as ImmichAsset;

// Thumbnails need a session token, so in tests each asset renders as its placeholder tile.
const tiles = () => Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-disabled]'));
const waitForTiles = () => waitFor(() => expect(tiles().length).toBeGreaterThan(0));

function lastQuery() {
  const calls = h.immich.queryAssets.mock.calls;
  return calls[calls.length - 1][0] as {
    filters: Record<string, unknown>;
    page: number;
    size: number;
    tripId?: number;
  };
}

function renderBrowser(props: Partial<React.ComponentProps<typeof ImmichBrowser>> = {}) {
  const onSelect = vi.fn().mockResolvedValue(undefined);
  render(
    <ImmichBrowser
      onSelect={onSelect}
      onClose={vi.fn()}
      tripStartDate="2026-01-05T00:00:00.000Z"
      tripEndDate="2026-01-10T00:00:00.000Z"
      tripTimezone="Asia/Tokyo"
      tripId={42}
      onBulkImported={vi.fn()}
      {...props}
    />
  );
  return { onSelect };
}

describe('ImmichBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.immich.queryAssets.mockResolvedValue({ assets: [asset('a'), asset('b')], hasMore: false, page: 1 });
    h.immich.getAlbums.mockResolvedValue({
      albums: [{ id: 'alb-1', albumName: 'Beach day', assetCount: 3 }],
    });
  });

  it('IB-001: opens on the trip days in the trip timezone', async () => {
    renderBrowser();
    await waitForTiles();

    expect(lastQuery()).toMatchObject({
      page: 1,
      size: 50,
      tripId: 42,
      filters: { dateFrom: '2026-01-05', dateTo: '2026-01-10', timezone: 'Asia/Tokyo' },
    });
    expect(screen.getByLabelText('From date')).toHaveValue('2026-01-05');
    expect(screen.getByLabelText('To date')).toHaveValue('2026-01-10');
  });

  it('IB-002: sends favourites, type and album filters and returns to page 1', async () => {
    h.immich.queryAssets.mockResolvedValue({ assets: [asset('a')], hasMore: true, page: 1 });
    renderBrowser();
    await waitForTiles();
    fireEvent.click(screen.getAllByRole('button', { name: 'Next' })[0]);
    await waitFor(() => expect(lastQuery().page).toBe(2));

    fireEvent.click(screen.getByLabelText('Favourites only'));
    await waitFor(() => expect(lastQuery()).toMatchObject({ page: 1, filters: { isFavorite: true } }));

    fireEvent.change(screen.getByLabelText('Media type'), { target: { value: 'VIDEO' } });
    await waitFor(() => expect(lastQuery().filters).toMatchObject({ isFavorite: true, type: 'VIDEO' }));

    await screen.findByRole('option', { name: 'Beach day' });
    fireEvent.change(screen.getByLabelText('Immich album'), { target: { value: 'alb-1' } });
    await waitFor(() => expect(lastQuery().filters).toMatchObject({ albumId: 'alb-1', type: 'VIDEO' }));
  });

  it('IB-003: search is sent to the server on Enter', async () => {
    renderBrowser();
    await waitForTiles();
    const input = screen.getByLabelText('Search assets');
    fireEvent.change(input, { target: { value: '  IMG_12 ' } });
    expect(lastQuery().filters.text).toBeUndefined();
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(lastQuery().filters.text).toBe('IMG_12'));
  });

  it("IB-004: 'This trip's dates' restores the range", async () => {
    renderBrowser();
    await waitForTiles();
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-01-07' } });
    await waitFor(() => expect(lastQuery().filters.dateFrom).toBe('2026-01-07'));

    fireEvent.click(screen.getByRole('button', { name: "This trip's dates" }));
    await waitFor(() =>
      expect(lastQuery().filters).toMatchObject({ dateFrom: '2026-01-05', dateTo: '2026-01-10' })
    );
  });

  it('IB-005: paging requests the next page from the server', async () => {
    h.immich.queryAssets.mockResolvedValue({ assets: [asset('a')], hasMore: true, page: 1 });
    renderBrowser();
    await waitForTiles();
    fireEvent.click(screen.getAllByRole('button', { name: 'Next' })[0]);
    await waitFor(() => expect(lastQuery().page).toBe(2));
  });

  it('IB-006: linked assets are marked and cannot be selected', async () => {
    h.immich.queryAssets.mockResolvedValue({
      assets: [asset('a', { alreadyLinked: true }), asset('b'), asset('c')],
      hasMore: false,
      page: 1,
    });
    const { onSelect } = renderBrowser({ linkedAssetIds: new Set(['c']) });
    await screen.findAllByText('Linked');
    expect(screen.getAllByText('Linked')).toHaveLength(2);

    const grid = tiles();
    expect(grid).toHaveLength(3);
    fireEvent.click(grid[0]); // a: linked
    fireEvent.click(grid[2]); // c: linked via prop
    expect(screen.getByText('Select photos to continue')).toBeInTheDocument();

    fireEvent.click(grid[1]); // b
    expect(screen.getByText('1 photo selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Link 1 Photo/ }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    expect(onSelect.mock.calls[0][0].map((x: ImmichAsset) => x.id)).toEqual(['b']);
  });

  it('IB-007: "Link all matching" needs a trip and a bulk callback', async () => {
    const { unmount } = render(
      <ImmichBrowser onSelect={vi.fn()} onClose={vi.fn()} tripId={42} onBulkImported={vi.fn()} />
    );
    expect(await screen.findByRole('button', { name: 'Link all matching...' })).toBeInTheDocument();
    unmount();

    render(<ImmichBrowser onSelect={vi.fn()} onClose={vi.fn()} />);
    await waitForTiles();
    expect(screen.queryByRole('button', { name: 'Link all matching...' })).not.toBeInTheDocument();
  });

  it('IB-008: shows a load failure and retries', async () => {
    h.immich.queryAssets.mockRejectedValueOnce(new Error('Immich took too long to respond'));
    renderBrowser();
    expect(await screen.findByRole('alert')).toHaveTextContent('Immich took too long to respond');

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitForTiles();
    expect(h.immich.queryAssets).toHaveBeenCalledTimes(2);
  });

  it('IB-009: imagesOnly forces IMAGE and hides the type filter', async () => {
    renderBrowser({ imagesOnly: true, tripId: undefined, onBulkImported: undefined });
    await waitForTiles();
    expect(lastQuery().filters.type).toBe('IMAGE');
    expect(screen.queryByLabelText('Media type')).not.toBeInTheDocument();
  });

  it('IB-011: smart mode sends the mode and query, shows the relevance hint, and keeps other filters', async () => {
    renderBrowser();
    await waitForTiles();
    expect(screen.getByLabelText('Search mode')).toHaveValue('filename');
    expect(screen.queryByText(/Sorted by relevance/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search mode'), { target: { value: 'smart' } });
    // No query yet: no text is sent (the server then runs the plain metadata query) and no hint shows.
    await waitFor(() => expect(h.immich.queryAssets.mock.calls.length).toBeGreaterThan(1));
    expect(lastQuery().filters.text).toBeUndefined();
    expect(screen.queryByText(/Sorted by relevance/)).not.toBeInTheDocument();

    const input = screen.getByLabelText('Search assets');
    fireEvent.change(input, { target: { value: 'beach sunset' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(lastQuery().filters).toMatchObject({
        searchMode: 'smart',
        text: 'beach sunset',
        dateFrom: '2026-01-05',
        dateTo: '2026-01-10',
      })
    );
    expect(await screen.findByText(/Sorted by relevance/)).toBeInTheDocument();
  });

  it('IB-012: smart mode disables "Link all matching" with a reason', async () => {
    renderBrowser();
    await waitForTiles();
    expect(screen.getByRole('button', { name: 'Link all matching...' })).toBeEnabled();

    fireEvent.change(screen.getByLabelText('Search mode'), { target: { value: 'smart' } });
    const input = screen.getByLabelText('Search assets');
    fireEvent.change(input, { target: { value: 'beach' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Link all matching...' })).toBeDisabled());
    expect(screen.getByText(/Smart search ranks your whole library/)).toBeInTheDocument();
  });

  it('IB-013: smart search failing shows the message and file-name search still works', async () => {
    h.immich.queryAssets.mockImplementation(async (params: { filters: { searchMode?: string } }) => {
      if (params.filters.searchMode === 'smart') {
        throw new Error("Smart search isn't available on your Immich server; machine learning may be turned off.");
      }
      return { assets: [asset('a')], hasMore: false, page: 1 };
    });
    renderBrowser();
    await waitForTiles();

    fireEvent.change(screen.getByLabelText('Search mode'), { target: { value: 'smart' } });
    const input = screen.getByLabelText('Search assets');
    fireEvent.change(input, { target: { value: 'beach' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByRole('alert')).toHaveTextContent("Smart search isn't available");

    fireEvent.change(screen.getByLabelText('Search mode'), { target: { value: 'filename' } });
    await waitForTiles();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(lastQuery().filters).toMatchObject({ text: 'beach' });
    expect(lastQuery().filters.searchMode).toBeUndefined();
  });

  it('IB-010: Select All on Page skips linked assets', async () => {
    h.immich.queryAssets.mockResolvedValue({
      assets: [asset('a', { alreadyLinked: true }), asset('b'), asset('c')],
      hasMore: false,
      page: 1,
    });
    renderBrowser();
    await screen.findAllByText('Linked');
    fireEvent.click(screen.getByRole('button', { name: 'Select All on Page' }));
    expect(screen.getByText('2 photos selected')).toBeInTheDocument();
  });
});
