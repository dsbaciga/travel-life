import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PhotoGallery from '../PhotoGallery';
import FavoriteStarButton from '../FavoriteStarButton';
import TripHighlights from '../trip-detail/TripHighlights';
import { createMockPhoto } from '../../test/fixtures';
import photoService from '../../services/photo.service';

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

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('../../services/photo.service', () => {
  const mockService = {
    getPhotosByTrip: vi.fn(),
    updatePhoto: vi.fn(),
  };
  return { photoService: mockService, default: mockService };
});

const mockedService = vi.mocked(photoService);

function renderGallery(props: Partial<React.ComponentProps<typeof PhotoGallery>> = {}) {
  const photos = [
    createMockPhoto({ id: 1, caption: 'Alpha', thumbnailPath: '/t/1.jpg', isFavorite: false }),
    createMockPhoto({ id: 2, caption: 'Beta', thumbnailPath: '/t/2.jpg', isFavorite: true }),
    createMockPhoto({ id: 3, caption: 'Gamma', thumbnailPath: '/t/3.jpg', isFavorite: false }),
  ];
  return render(
    <BrowserRouter>
      <PhotoGallery photos={photos} {...props} />
    </BrowserRouter>
  );
}

describe('FavoriteStarButton', () => {
  it('reflects state in its label and aria-pressed, and does not bubble clicks', async () => {
    const onToggle = vi.fn();
    const onParentClick = vi.fn();
    render(
      <div onClick={onParentClick}>
        <FavoriteStarButton isFavorite={false} onToggle={onToggle} />
      </div>
    );

    const button = screen.getByRole('button', { name: 'Add to favorites' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it('shows the remove label when starred', () => {
    render(<FavoriteStarButton isFavorite onToggle={() => {}} />);
    expect(screen.getByRole('button', { name: 'Remove from favorites' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});

describe('PhotoGallery favorites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedService.updatePhoto.mockResolvedValue(createMockPhoto({ id: 1, isFavorite: true }));
  });

  it('stars a photo optimistically and persists it', async () => {
    const onFavoriteChanged = vi.fn();
    renderGallery({ onFavoriteChanged });

    const addButtons = screen.getAllByRole('button', { name: 'Add to favorites' });
    expect(addButtons).toHaveLength(2);
    await userEvent.click(addButtons[0]);

    expect(mockedService.updatePhoto).toHaveBeenCalledWith(1, { isFavorite: true });
    await waitFor(() => expect(onFavoriteChanged).toHaveBeenCalledWith(1, true));
    expect(screen.getAllByRole('button', { name: 'Remove from favorites' })).toHaveLength(2);
  });

  it('rolls the star back when the server rejects the change', async () => {
    mockedService.updatePhoto.mockRejectedValue(new Error('forbidden'));
    renderGallery();

    await userEvent.click(screen.getAllByRole('button', { name: 'Add to favorites' })[0]);

    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Add to favorites' })).toHaveLength(2)
    );
    expect(screen.getAllByRole('button', { name: 'Remove from favorites' })).toHaveLength(1);
  });

  it('filters the grid to favorites only', async () => {
    renderGallery();

    expect(screen.getByRole('button', { name: 'Alpha' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Favorites \(1\)/ }));

    expect(screen.queryByRole('button', { name: 'Alpha' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Beta' })).toBeInTheDocument();
    expect(screen.getByText('1 photo')).toBeInTheDocument();
  });

  it('pages the lightbox only through favorites when the filter is on', async () => {
    const photos = [
      createMockPhoto({ id: 1, caption: 'One', thumbnailPath: '/t/1.jpg', isFavorite: true }),
      createMockPhoto({ id: 2, caption: 'Two', thumbnailPath: '/t/2.jpg', isFavorite: false }),
      createMockPhoto({ id: 3, caption: 'Three', thumbnailPath: '/t/3.jpg', isFavorite: true }),
    ];
    render(
      <QueryClientProvider client={new QueryClient()}>
        <BrowserRouter>
          <PhotoGallery photos={photos} />
        </BrowserRouter>
      </QueryClientProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: /^Favorites/ }));
    await userEvent.click(screen.getByRole('button', { name: 'One' }));

    expect((await screen.findAllByText('1 / 2')).length).toBeGreaterThan(0);
  });

  it('shows a hint instead of an empty grid when nothing is starred', async () => {
    render(
      <BrowserRouter>
        <PhotoGallery photos={[createMockPhoto({ id: 9, caption: 'Solo', thumbnailPath: '/t/9.jpg' })]} />
      </BrowserRouter>
    );

    await userEvent.click(screen.getByRole('button', { name: /^Favorites/ }));
    expect(screen.getByText(/No favorites among these photos yet/)).toBeInTheDocument();
  });
});

describe('TripHighlights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderHighlights() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <BrowserRouter>
          <TripHighlights tripId={7} />
        </BrowserRouter>
      </QueryClientProvider>
    );
  }

  it('explains how to star photos when the trip has no favorites', async () => {
    mockedService.getPhotosByTrip.mockResolvedValue({ photos: [], total: 0, hasMore: false });
    renderHighlights();

    expect(await screen.findByText('No highlights yet')).toBeInTheDocument();
    expect(screen.getByText(/Tap the star on any photo/)).toBeInTheDocument();
    expect(mockedService.getPhotosByTrip).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ favoritesOnly: true })
    );
  });

  it('renders the favorite photos as a set', async () => {
    mockedService.getPhotosByTrip.mockResolvedValue({
      photos: [createMockPhoto({ id: 5, caption: 'Sunrise', thumbnailPath: '/t/5.jpg', isFavorite: true })],
      total: 1,
      hasMore: false,
    });
    renderHighlights();

    expect(await screen.findByRole('button', { name: 'Sunrise' })).toBeInTheDocument();
  });
});
