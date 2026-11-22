import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AlbumSuggestions from '../AlbumSuggestions';
import photoService from '../../services/photo.service';

vi.mock('../../services/photo.service', () => ({
  default: {
    getAlbumSuggestions: vi.fn(),
    acceptAlbumSuggestion: vi.fn(),
  },
}));

vi.mock('../../hooks/useImmichThumbnail', () => ({
  useImmichThumbnailCache: () => ({
    loadThumbnails: vi.fn(),
    getThumbnailUrl: () => null,
  }),
}));

describe('AlbumSuggestions', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(photoService.getAlbumSuggestions).mockResolvedValue([
      {
        type: 'date',
        name: 'Day 1',
        description: 'Photos from the first day',
        photoIds: [1, 2, 3],
        confidence: 0.9,
        previewPhotos: [],
        metadata: {},
      },
    ] as unknown as Awaited<ReturnType<typeof photoService.getAlbumSuggestions>>);
  });

  it('starts collapsed and expands when the header is clicked', async () => {
    render(<AlbumSuggestions tripId={7} onAlbumCreated={vi.fn()} />);

    const toggle = await screen.findByRole('button', { name: /smart album suggestions/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Day 1')).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Day 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Album' })).toBeInTheDocument();
  });
});
