import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import PhotoGallery from '../PhotoGallery';
import TripPhotosTab from '../trip-detail/TripPhotosTab';
import { useTripEditAccess } from '../../hooks/useTripEditAccess';
import { createMockPhoto, createMockTrip } from '../../test/fixtures';
import photoService from '../../services/photo.service';
import collaborationService from '../../services/collaboration.service';
import type { Photo } from '../../types/photo';
import { renderHook } from '@testing-library/react';

class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = '0px';
  readonly thresholds: ReadonlyArray<number> = [0];
  observe = vi.fn<(target: Element) => void>();
  unobserve = vi.fn<(target: Element) => void>();
  disconnect = vi.fn<() => void>();
  takeRecords = vi.fn<() => IntersectionObserverEntry[]>(() => []);
}
window.IntersectionObserver = MockIntersectionObserver;

vi.mock('../ProgressiveImage', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../PhotoUpload', () => ({ default: () => null }));
vi.mock('../AlbumSuggestions', () => ({ default: () => null }));
vi.mock('../AlbumsSidebar', () => ({ default: () => null }));
vi.mock('../AlbumModal', () => ({ default: () => null }));
vi.mock('../AddPhotosToAlbumModal', () => ({ default: () => null }));
vi.mock('../../services/trip.service', () => ({ default: { updateCoverPhoto: vi.fn() } }));
vi.mock('../../services/photo.service', () => {
  const mockService = {
    getPhotosByTrip: vi.fn(),
    getUnsortedPhotosByTrip: vi.fn(),
    getAlbumById: vi.fn(),
    updatePhoto: vi.fn(),
  };
  return { photoService: mockService, default: mockService };
});
vi.mock('../../services/collaboration.service', () => ({
  default: { getPermissionLevel: vi.fn() },
}));

const mockedPhotos = vi.mocked(photoService);
const mockedCollab = vi.mocked(collaborationService);

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function mk(id: number, isFavorite: boolean): Photo {
  return createMockPhoto({ id, caption: `P${id}`, thumbnailPath: `/t/${id}.jpg`, isFavorite });
}

/** Buttons rendered by the lightbox (it portals outside the gallery root). */
function lightboxButtons(name: string) {
  const gallery = screen.getByTestId('photo-gallery');
  return screen.queryAllByRole('button', { name }).filter((b) => !gallery.contains(b));
}

describe('useTripEditAccess', () => {
  beforeEach(() => vi.clearAllMocks());

  const cases: Array<[string, { isOwner: boolean; permissionLevel: 'view' | 'edit' | 'admin' | null }, boolean]> = [
    ['owner', { isOwner: true, permissionLevel: 'admin' }, true],
    ['admin collaborator', { isOwner: false, permissionLevel: 'admin' }, true],
    ['edit collaborator', { isOwner: false, permissionLevel: 'edit' }, true],
    ['view collaborator', { isOwner: false, permissionLevel: 'view' }, false],
    ['no access', { isOwner: false, permissionLevel: null }, false],
  ];

  it.each(cases)('%s', async (_name, permission, expected) => {
    mockedCollab.getPermissionLevel.mockResolvedValue(permission);
    const { result } = renderHook(() => useTripEditAccess(5), { wrapper: wrapper(newClient()) });
    expect(result.current.canEdit).toBe(false); // never true while loading
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canEdit).toBe(expected);
    expect(mockedCollab.getPermissionLevel).toHaveBeenCalledWith(5);
  });

  it('is not editable and does not fetch without a trip id', () => {
    const { result } = renderHook(() => useTripEditAccess(undefined), { wrapper: wrapper(newClient()) });
    expect(result.current).toEqual({ canEdit: false, isLoading: false });
    expect(mockedCollab.getPermissionLevel).not.toHaveBeenCalled();
  });
});

describe('PhotoGallery permissions', () => {
  beforeEach(() => vi.clearAllMocks());
  const photos = [mk(1, false), mk(2, true)];

  function renderG(canEdit: boolean | undefined) {
    return render(
      <QueryClientProvider client={newClient()}>
        <BrowserRouter>
          <PhotoGallery photos={photos} canEdit={canEdit} />
        </BrowserRouter>
      </QueryClientProvider>
    );
  }

  it('view-only: indicator on starred photos, no star buttons in grid, list, or lightbox', async () => {
    renderG(false);
    expect(screen.queryByRole('button', { name: /favorites$/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'Favorite' })).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'List view' }));
    expect(screen.queryByRole('button', { name: /^(Add to|Remove from) favorites$/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'Favorite' })).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'P2' }));
    await screen.findAllByText('2 / 2');
    expect(lightboxButtons('Remove from favorites')).toHaveLength(0);
    expect(lightboxButtons('Add to favorites')).toHaveLength(0);
    expect(screen.getAllByRole('img', { name: 'Favorite' }).length).toBeGreaterThan(1);
  });

  it('view-only can still use the Favorites filter', async () => {
    renderG(false);
    await userEvent.click(screen.getByRole('button', { name: /^Favorites/ }));
    expect(screen.queryByRole('button', { name: 'P1' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'P2' })).toBeInTheDocument();
  });

  it('defaults to read-only when canEdit is not given (e.g. permission still loading)', () => {
    renderG(undefined);
    expect(screen.queryByRole('button', { name: /^(Add to|Remove from) favorites$/ })).not.toBeInTheDocument();
  });

  it('editor: star buttons in grid, list, and lightbox', async () => {
    renderG(true);
    expect(screen.getAllByRole('button', { name: /^(Add to|Remove from) favorites$/ })).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: 'List view' }));
    expect(screen.getAllByRole('button', { name: /^(Add to|Remove from) favorites$/ })).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: 'P2' }));
    await screen.findAllByText('2 / 2');
    expect(lightboxButtons('Remove from favorites')).toHaveLength(1);
  });
});

describe('Lightbox counter while the Favorites filter is on', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPhotos.updatePhoto.mockResolvedValue(createMockPhoto({ id: 1 }));
  });

  async function open(photos: Photo[], caption: string) {
    render(
      <QueryClientProvider client={newClient()}>
        <BrowserRouter>
          <PhotoGallery photos={photos} canEdit />
        </BrowserRouter>
      </QueryClientProvider>
    );
    await userEvent.click(screen.getByRole('button', { name: /^Favorites/ }));
    await userEvent.click(screen.getByRole('button', { name: caption }));
  }

  const three = () => [mk(1, true), mk(2, true), mk(3, true)];

  it('middle: keeps the photo and the counter, then drops it when navigating', async () => {
    await open(three(), 'P2');
    await screen.findAllByText('2 / 3');
    await userEvent.click(lightboxButtons('Remove from favorites')[0]);

    expect(mockedPhotos.updatePhoto).toHaveBeenCalledWith(2, { isFavorite: false });
    expect((await screen.findAllByText('2 / 3')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^0 \//)).not.toBeInTheDocument();
    // Can be undone with a second click
    expect(lightboxButtons('Add to favorites')).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Next photo' }));
    expect((await screen.findAllByText('2 / 2')).length).toBeGreaterThan(0);
  });

  it('first: counter stays 1 / N', async () => {
    await open(three(), 'P1');
    await userEvent.click(lightboxButtons('Remove from favorites')[0]);
    expect((await screen.findAllByText('1 / 3')).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Next photo' }));
    expect((await screen.findAllByText('1 / 2')).length).toBeGreaterThan(0);
  });

  it('last: counter stays N / N, and Previous then lands on N-1 / N-1', async () => {
    await open(three(), 'P3');
    await userEvent.click(lightboxButtons('Remove from favorites')[0]);
    expect((await screen.findAllByText('3 / 3')).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Previous photo' }));
    expect((await screen.findAllByText('2 / 2')).length).toBeGreaterThan(0);
  });

  it('only one favorite: no crash, 1 / 1, undo works, and closing shows the empty hint', async () => {
    await open([mk(1, true), mk(2, false)], 'P1');
    await userEvent.click(lightboxButtons('Remove from favorites')[0]);
    expect((await screen.findAllByText('1 / 1')).length).toBeGreaterThan(0);

    await userEvent.click(lightboxButtons('Add to favorites')[0]);
    expect(mockedPhotos.updatePhoto).toHaveBeenLastCalledWith(1, { isFavorite: true });
    expect((await screen.findAllByText('1 / 1')).length).toBeGreaterThan(0);

    await userEvent.click(lightboxButtons('Remove from favorites')[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Close lightbox' }));
    expect(await screen.findByText(/No favorites among these photos yet/)).toBeInTheDocument();
  });
});

describe('TripPhotosTab Favorites filter (server-side)', () => {
  const trip = createMockTrip({ id: 11 });
  const baseProps = {
    trip,
    albums: [],
    areAlbumsLoading: false,
    totalPhotosCount: 100,
    unsortedPhotosCount: 0,
    selectedAlbumId: null,
    onSelectAlbum: vi.fn(),
    filteredPhotos: [mk(1, false), mk(2, true), mk(3, false)],
    photosPagination: { loadInitial: vi.fn(), total: 100, totalPages: 1 },
    unsortedPagination: { loadInitial: vi.fn(), total: 0, totalPages: 0 },
    albumPhotosPagination: { loadInitial: vi.fn(), total: 0, totalPages: 0 },
    onPhotoSortChange: vi.fn(),
    initialSortBy: 'date',
    initialSortOrder: 'desc',
    existingImmichAssetIds: new Set<string>(),
    onRefreshImmichAssetIds: vi.fn(async () => {}),
    confirm: vi.fn(async () => true),
  };

  function renderTab(extra: Record<string, unknown> = {}) {
    const client = newClient();
    const Wrapper = wrapper(client);
    render(
      <Wrapper>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial pagination stubs */}
        <TripPhotosTab {...(baseProps as any)} {...extra} />
      </Wrapper>
    );
    return client;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockedCollab.getPermissionLevel.mockResolvedValue({ isOwner: true, permissionLevel: 'admin' });
    mockedPhotos.updatePhoto.mockResolvedValue(createMockPhoto({ id: 1 }));
    mockedPhotos.getPhotosByTrip.mockImplementation(async (_id, opts) => {
      // 45 favorites in total, 40 per page
      const skip = opts?.skip ?? 0;
      const count = Math.min(40, 45 - skip);
      return {
        photos: Array.from({ length: count }, (_, i) => mk(1000 + skip + i, true)),
        total: 45,
        hasMore: skip + count < 45,
      };
    });
  });

  it('requests the server-filtered list, shows the full count, and pages through it', async () => {
    renderTab();
    await screen.findByRole('button', { name: 'P1' });

    await userEvent.click(await screen.findByRole('button', { name: /^Favorites/ }));

    await waitFor(() =>
      expect(mockedPhotos.getPhotosByTrip).toHaveBeenCalledWith(
        11,
        expect.objectContaining({ favoritesOnly: true, skip: 0, take: 40, sortBy: 'date', sortOrder: 'desc' })
      )
    );
    // Full favorites count (45), not the 40 on the page and not the unfiltered list
    expect(await screen.findByRole('button', { name: /Favorites \(45\)/ })).toBeInTheDocument();
    expect(screen.getByText('45 photos')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'P1' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^Next/i }));
    await waitFor(() =>
      expect(mockedPhotos.getPhotosByTrip).toHaveBeenCalledWith(
        11,
        expect.objectContaining({ favoritesOnly: true, skip: 40 })
      )
    );
  });

  it('uses the unsorted and album endpoints for those scopes', async () => {
    mockedPhotos.getUnsortedPhotosByTrip.mockResolvedValue({ photos: [mk(7, true)], total: 1, hasMore: false });
    renderTab({ selectedAlbumId: -1 });
    await userEvent.click(await screen.findByRole('button', { name: /^Favorites/ }));
    await waitFor(() =>
      expect(mockedPhotos.getUnsortedPhotosByTrip).toHaveBeenCalledWith(
        11,
        expect.objectContaining({ favoritesOnly: true })
      )
    );
  });

  it('keeps the filtered, unfiltered and highlights caches in sync on star changes', async () => {
    const client = renderTab();
    await screen.findByRole('button', { name: 'P1' });

    // Unstar from the unfiltered list: the filtered and highlights caches are invalidated
    const spy = vi.spyOn(client, 'invalidateQueries');
    await userEvent.click((await screen.findAllByRole('button', { name: 'Remove from favorites' }))[0]);
    await waitFor(() => expect(mockedPhotos.updatePhoto).toHaveBeenCalledWith(2, { isFavorite: false }));
    await waitFor(() => {
      const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown[] }).queryKey));
      expect(keys).toContain(JSON.stringify(['photos', 'favorites', 11]));
      expect(keys).toContain(JSON.stringify(['photos', 'highlights', 11]));
    });

    // The optimistic unstar is still applied after switching the filter on:
    // the server list (not yet refetched) is filtered by the shared override.
    mockedPhotos.getPhotosByTrip.mockResolvedValue({ photos: [mk(2, true)], total: 1, hasMore: false });
    await userEvent.click(screen.getByRole('button', { name: /^Favorites/ }));
    await waitFor(() => expect(screen.getByText(/No favorites among these photos yet/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'P2' })).not.toBeInTheDocument();
  });

  it('a starred photo appears the next time the filter is turned on without a manual refresh', async () => {
    mockedPhotos.getPhotosByTrip.mockResolvedValue({ photos: [mk(1, true)], total: 1, hasMore: false });
    renderTab();
    await userEvent.click((await screen.findAllByRole('button', { name: 'Add to favorites' }))[0]);
    await waitFor(() => expect(mockedPhotos.updatePhoto).toHaveBeenCalledWith(1, { isFavorite: true }));

    await userEvent.click(screen.getByRole('button', { name: /^Favorites/ }));
    expect(await screen.findByRole('button', { name: 'P1' })).toBeInTheDocument();
    expect(within(screen.getByTestId('photo-gallery')).queryByRole('button', { name: 'P3' })).not.toBeInTheDocument();
  });

  it('hides star buttons for view-only collaborators but keeps indicators and the filter', async () => {
    mockedCollab.getPermissionLevel.mockResolvedValue({ isOwner: false, permissionLevel: 'view' });
    renderTab();
    await screen.findByRole('button', { name: 'P1' });
    await waitFor(() => expect(mockedCollab.getPermissionLevel).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /^(Add to|Remove from) favorites$/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'Favorite' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /^Favorites/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Highlights/ })).toBeInTheDocument();
  });
});
