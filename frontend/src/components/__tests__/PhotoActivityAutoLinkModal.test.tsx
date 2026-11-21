/**
 * PhotoActivityAutoLinkModal - review and apply photo to activity suggestions
 *
 * Test cases:
 * - PAL-UI-001: Lists each suggested activity with its photo count and match breakdown
 * - PAL-UI-002: Applies every suggestion by default and refreshes the link caches
 * - PAL-UI-003: An unticked activity is left out of the request
 * - PAL-UI-004: With nothing ticked the apply button is disabled
 * - PAL-UI-005: No suggestions explains why photos were left out
 * - PAL-UI-006: A failed apply shows an error and keeps the dialog open
 * - PAL-UI-007: Activity times are shown in the activity's own timezone
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PhotoActivitySuggestionsResponse } from '../../types/photoAutoLink';

const h = vi.hoisted(() => ({
  links: {
    getPhotoActivitySuggestions: vi.fn(),
    applyPhotoActivityLinks: vi.fn(),
  },
  toast: { error: vi.fn(), success: vi.fn() },
  invalidate: vi.fn(),
}));
vi.mock('../../services/entityLink.service', () => ({
  entityLinkService: h.links,
  default: h.links,
}));
vi.mock('react-hot-toast', () => ({ default: h.toast }));
vi.mock('../../hooks/useInvalidateEntityLinks', () => ({
  useInvalidateEntityLinks: () => h.invalidate,
}));
vi.mock('../../hooks/useImmichThumbnail', () => ({
  useImmichThumbnailCache: () => ({
    loadThumbnails: vi.fn().mockResolvedValue(undefined),
    getThumbnailUrl: () => null,
  }),
}));

import PhotoActivityAutoLinkModal from '../PhotoActivityAutoLinkModal';

const preview = (id: number) => ({
  id,
  thumbnailPath: `/uploads/thumbnails/${id}.jpg`,
  source: 'local',
  mediaType: 'image',
  caption: null,
});

const response = (
  over: Partial<PhotoActivitySuggestionsResponse> = {}
): PhotoActivitySuggestionsResponse => ({
  suggestions: [
    {
      activity: {
        id: 1,
        name: 'Colosseum tour',
        category: 'sightseeing',
        allDay: false,
        startTime: '2026-06-10T07:00:00Z',
        endTime: '2026-06-10T09:00:00Z',
        timezone: 'Europe/Rome',
      },
      photoIds: [10, 11, 12],
      previewPhotos: [preview(10), preview(11), preview(12)],
      matchCounts: { during: 2, near: 1, same_day: 0 },
      firstTakenAt: '2026-06-10T07:10:00Z',
      lastTakenAt: '2026-06-10T09:20:00Z',
    },
    {
      activity: {
        id: 2,
        name: 'Dinner in Trastevere',
        category: 'dining',
        allDay: false,
        startTime: '2026-06-10T18:00:00Z',
        endTime: null,
        timezone: 'Europe/Rome',
      },
      photoIds: [20],
      previewPhotos: [preview(20)],
      matchCounts: { during: 1, near: 0, same_day: 0 },
      firstTakenAt: '2026-06-10T18:30:00Z',
      lastTakenAt: '2026-06-10T18:30:00Z',
    },
  ],
  summary: {
    totalPhotos: 9,
    matchedPhotos: 4,
    alreadyLinkedPhotos: 2,
    photosWithoutTime: 1,
    unmatchedPhotos: 2,
    activitiesWithoutTime: 0,
  },
  ...over,
});

function renderModal(props: { onClose?: () => void; onLinked?: () => void } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PhotoActivityAutoLinkModal
        isOpen
        onClose={props.onClose ?? vi.fn()}
        onLinked={props.onLinked}
        tripId={42}
        tripTimezone="Europe/Rome"
      />
    </QueryClientProvider>
  );
}

describe('PhotoActivityAutoLinkModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.links.getPhotoActivitySuggestions.mockResolvedValue(response());
    h.links.applyPhotoActivityLinks.mockResolvedValue({ created: 4, skipped: 0 });
  });

  it('PAL-UI-001: lists each suggested activity with its photos and match breakdown', async () => {
    renderModal();

    expect(await screen.findByText('Colosseum tour')).toBeInTheDocument();
    expect(screen.getByText('Dinner in Trastevere')).toBeInTheDocument();
    expect(screen.getByText(/3 photos taken .*2 during · 1 within 30 min/)).toBeInTheDocument();
    expect(screen.getByText(/1 photo taken .*1 during/)).toBeInTheDocument();
    expect(screen.getByText(/2 photos already linked to an activity/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Link 4 photos' })).toBeEnabled();
    expect(h.links.getPhotoActivitySuggestions).toHaveBeenCalledWith(42);
  });

  it('PAL-UI-002: applies every suggestion by default and refreshes link caches', async () => {
    const onClose = vi.fn();
    const onLinked = vi.fn();
    renderModal({ onClose, onLinked });

    fireEvent.click(await screen.findByRole('button', { name: 'Link 4 photos' }));

    await waitFor(() =>
      expect(h.links.applyPhotoActivityLinks).toHaveBeenCalledWith(42, {
        links: [
          { activityId: 1, photoIds: [10, 11, 12] },
          { activityId: 2, photoIds: [20] },
        ],
      })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(h.toast.success).toHaveBeenCalledWith('Linked 4 photos to 2 activities');
    expect(h.invalidate).toHaveBeenCalledWith(42);
    expect(onLinked).toHaveBeenCalled();
  });

  it('PAL-UI-003: leaves an unticked activity out of the request', async () => {
    h.links.applyPhotoActivityLinks.mockResolvedValue({ created: 1, skipped: 0 });
    renderModal();

    fireEvent.click(
      await screen.findByRole('checkbox', { name: 'Link 3 photos to Colosseum tour' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Link 1 photo' }));

    await waitFor(() =>
      expect(h.links.applyPhotoActivityLinks).toHaveBeenCalledWith(42, {
        links: [{ activityId: 2, photoIds: [20] }],
      })
    );
  });

  it('PAL-UI-004: disables apply when nothing is ticked', async () => {
    renderModal();

    fireEvent.click(await screen.findByRole('checkbox', { name: /Select all/ }));

    expect(screen.getByRole('button', { name: 'Link photos' })).toBeDisabled();
    expect(h.links.applyPhotoActivityLinks).not.toHaveBeenCalled();
  });

  it('PAL-UI-005: explains why there is nothing to link', async () => {
    h.links.getPhotoActivitySuggestions.mockResolvedValue(
      response({
        suggestions: [],
        summary: {
          totalPhotos: 5,
          matchedPhotos: 0,
          alreadyLinkedPhotos: 0,
          photosWithoutTime: 3,
          unmatchedPhotos: 2,
          activitiesWithoutTime: 1,
        },
      })
    );
    renderModal();

    expect(await screen.findByText('No photos to link')).toBeInTheDocument();
    expect(
      screen.getByText(
        '2 photos not taken around any activity · 3 photos with no capture time · 1 activity with no start time.'
      )
    ).toBeInTheDocument();
  });

  it('PAL-UI-006: reports a failed apply and stays open', async () => {
    h.links.applyPhotoActivityLinks.mockRejectedValue(new Error('boom'));
    const onClose = vi.fn();
    renderModal({ onClose });

    fireEvent.click(await screen.findByRole('button', { name: 'Link 4 photos' }));

    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith('Failed to link photos'));
    expect(onClose).not.toHaveBeenCalled();
    expect(h.invalidate).not.toHaveBeenCalled();
  });

  it('PAL-UI-007: shows activity times in the activity timezone', async () => {
    renderModal();

    // 07:00Z to 09:00Z is 9:00 AM to 11:00 AM in Rome (UTC+2 in June)
    expect(await screen.findByText('Jun 10, 9:00 AM – 11:00 AM')).toBeInTheDocument();
  });
});
