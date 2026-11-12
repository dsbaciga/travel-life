/**
 * FoodLogManager - Immich photo attachment
 *
 * Test cases:
 * - FLI-001: "Add from Immich" is hidden when Immich is not configured
 * - FLI-002: It is shown when configured, and opens the browser in images-only mode with the trip dates
 * - FLI-003: Picked photos are staged (videos dropped) and sent to the server after the entry is saved
 * - FLI-004: Removing a staged photo before saving means it is not sent
 * - FLI-005: Picking more than the remaining slots is trimmed to the cap with an error toast
 * - FLI-006: Assets already on the entry are hidden from the browser
 * - FLI-007: If attaching fails the entry is still saved and the user is told the photo failed
 * - FLI-008: Nothing is sent to Immich endpoints when no Immich photo was picked
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ImmichAsset } from '../../types/immich';
import type { FoodLogEntry } from '../../types/foodLog';

const h = vi.hoisted(() => ({
  foodLog: {
    getEntriesByTrip: vi.fn(),
    createEntry: vi.fn(),
    updateEntry: vi.fn(),
    deleteEntry: vi.fn(),
    attachPhotos: vi.fn(),
    attachImmichAssets: vi.fn(),
    removePhoto: vi.fn(),
  },
  immich: { getSettings: vi.fn() },
  photo: { uploadPhoto: vi.fn() },
  toast: { error: vi.fn(), success: vi.fn() },
  // What the mocked ImmichBrowser was given, and what "picking" in it returns.
  browser: { props: null as null | Record<string, unknown>, toPick: [] as unknown[] },
}));

vi.mock('../../services/foodLog.service', () => ({ default: h.foodLog, foodLogService: h.foodLog }));
vi.mock('../../services/immich.service', () => ({ default: h.immich }));
vi.mock('../../services/photo.service', () => ({ default: h.photo }));
vi.mock('../../services/activity.service', () => ({
  default: { getActivitiesByTrip: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../services/location.service', () => ({
  default: { getLocationsByTrip: vi.fn().mockResolvedValue([]) },
}));
vi.mock('react-hot-toast', () => ({ default: h.toast }));
vi.mock('../ImmichBrowser', () => ({
  default: (props: Record<string, unknown> & { onSelect: (a: unknown[]) => Promise<void> }) => {
    h.browser.props = props;
    return (
      <div data-testid="immich-browser">
        <button type="button" onClick={() => props.onSelect(h.browser.toPick)}>
          mock-pick
        </button>
      </div>
    );
  },
}));

import FoodLogManager from '../FoodLogManager';

const TRIP_ID = 42;

const asset = (id: string, over: Partial<ImmichAsset> = {}): ImmichAsset =>
  ({
    id,
    type: 'IMAGE',
    originalFileName: `${id}.jpg`,
    fileCreatedAt: '2026-07-01T12:00:00.000Z',
    exifInfo: { dateTimeOriginal: '2026-07-01T10:30:00.000Z', latitude: 41.9, longitude: 12.5 },
    ...over,
  }) as ImmichAsset;

const entry = (over: Partial<FoodLogEntry> = {}): FoodLogEntry => ({
  id: 7,
  tripId: TRIP_ID,
  activityId: null,
  locationId: null,
  restaurantName: 'Trattoria',
  dish: 'Carbonara',
  rating: 5,
  notes: null,
  orderAgain: false,
  photos: [],
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-01T00:00:00Z',
  ...over,
});

function renderManager() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FoodLogManager tripId={TRIP_ID} tripStartDate="2026-07-01" tripEndDate="2026-07-10" />
    </QueryClientProvider>
  );
}

async function openForm() {
  // One entry exists, so the empty state (and its duplicate button) is not rendered.
  fireEvent.click(await screen.findByRole('button', { name: 'Log a Dish' }));
}

async function pick(assets: ImmichAsset[]) {
  h.browser.toPick = assets;
  fireEvent.click(await screen.findByRole('button', { name: 'Add from Immich' }));
  fireEvent.click(await screen.findByText('mock-pick'));
}

async function fillAndSave() {
  fireEvent.change(screen.getByLabelText('Restaurant'), { target: { value: 'Trattoria' } });
  fireEvent.change(screen.getByLabelText('Dish'), { target: { value: 'Carbonara' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Dish' }));
}

describe('FoodLogManager - Immich photos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.browser.props = null;
    h.browser.toPick = [];
    h.foodLog.getEntriesByTrip.mockResolvedValue([entry()]);
    h.foodLog.createEntry.mockResolvedValue(entry({ id: 99 }));
    h.foodLog.updateEntry.mockResolvedValue(entry());
    h.foodLog.attachImmichAssets.mockResolvedValue(entry({ id: 99 }));
    h.immich.getSettings.mockResolvedValue({ immichApiUrl: 'https://immich.test', immichApiKeySet: true, immichConfigured: true });
  });

  it('FLI-001: hides "Add from Immich" when Immich is not configured', async () => {
    h.immich.getSettings.mockResolvedValue({ immichApiUrl: null, immichApiKeySet: false, immichConfigured: false });
    renderManager();
    await openForm();

    expect(await screen.findByRole('button', { name: 'Add photos' })).toBeInTheDocument();
    await waitFor(() => expect(h.immich.getSettings).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Add from Immich' })).not.toBeInTheDocument();
  });

  it('FLI-002: opens the browser in images-only mode with the trip dates', async () => {
    renderManager();
    await openForm();
    fireEvent.click(await screen.findByRole('button', { name: 'Add from Immich' }));

    expect(await screen.findByTestId('immich-browser')).toBeInTheDocument();
    expect(h.browser.props).toMatchObject({
      imagesOnly: true,
      tripStartDate: '2026-07-01',
      tripEndDate: '2026-07-10',
    });
  });

  it('FLI-003: stages picked photos (dropping videos) and attaches them after saving', async () => {
    renderManager();
    await openForm();
    await pick([asset('a'), asset('v', { type: 'VIDEO' }), asset('b')]);

    // Staged previews for the two photos only; the video never appears.
    expect(screen.getByRole('button', { name: 'Remove a.jpg' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove b.jpg' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove v.jpg' })).not.toBeInTheDocument();
    expect(screen.getByText('2/12')).toBeInTheDocument();
    expect(screen.queryByTestId('immich-browser')).not.toBeInTheDocument(); // closes after picking
    expect(h.foodLog.attachImmichAssets).not.toHaveBeenCalled(); // nothing sent until Save

    await fillAndSave();

    await waitFor(() => expect(h.foodLog.attachImmichAssets).toHaveBeenCalledTimes(1));
    // Created first, then attached to the NEW entry's id.
    expect(h.foodLog.createEntry).toHaveBeenCalledTimes(1);
    expect(h.foodLog.attachImmichAssets).toHaveBeenCalledWith(TRIP_ID, 99, [
      { immichAssetId: 'a', takenAt: '2026-07-01T10:30:00.000Z', latitude: 41.9, longitude: 12.5 },
      { immichAssetId: 'b', takenAt: '2026-07-01T10:30:00.000Z', latitude: 41.9, longitude: 12.5 },
    ]);
    await waitFor(() => expect(h.toast.success).toHaveBeenCalledWith('Dish logged'));
  });

  it('FLI-004: a staged photo that is removed before saving is not sent', async () => {
    renderManager();
    await openForm();
    await pick([asset('a'), asset('b')]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove a.jpg' }));
    expect(screen.getByText('1/12')).toBeInTheDocument();

    await fillAndSave();

    await waitFor(() => expect(h.foodLog.attachImmichAssets).toHaveBeenCalledTimes(1));
    const sent = h.foodLog.attachImmichAssets.mock.calls[0][2] as Array<{ immichAssetId: string }>;
    expect(sent.map((a) => a.immichAssetId)).toEqual(['b']);
  });

  it('FLI-005: trims a pick that exceeds the remaining slots and says so', async () => {
    renderManager();
    await openForm();
    await pick(Array.from({ length: 14 }, (_, i) => asset(`p${i}`)));

    expect(h.toast.error).toHaveBeenCalledWith('An entry can have at most 12 photos');
    expect(screen.getByText('12/12')).toBeInTheDocument();
    // At the cap, both add buttons are disabled.
    expect(screen.getByRole('button', { name: 'Add more photos' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add from Immich' })).toBeDisabled();
  });

  it('FLI-006: hides assets already on the entry from the browser, and re-picking one is ignored', async () => {
    h.foodLog.getEntriesByTrip.mockResolvedValue([
      entry({
        photos: [
          { id: 5, source: 'immich', mediaType: 'image', immichAssetId: 'already', localPath: null, thumbnailPath: '/api/immich/assets/already/thumbnail', caption: null },
        ],
      }),
    ]);
    renderManager();
    // Edit the existing entry so its attached photo is "kept" in the form.
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    h.browser.toPick = [asset('already'), asset('fresh')];
    fireEvent.click(await screen.findByRole('button', { name: 'Add from Immich' }));

    const excluded = h.browser.props?.excludeAssetIds as Set<string>;
    expect(excluded.has('already')).toBe(true);

    fireEvent.click(await screen.findByText('mock-pick'));
    // Only the genuinely new asset is staged; the one already attached is not duplicated.
    expect(screen.getByRole('button', { name: 'Remove fresh.jpg' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove already.jpg' })).not.toBeInTheDocument();
    expect(screen.getByText('2/12')).toBeInTheDocument(); // 1 kept + 1 staged
  });

  it('FLI-007: still saves the entry when attaching fails, and reports the photo failure', async () => {
    h.foodLog.attachImmichAssets.mockRejectedValue(new Error('immich down'));
    renderManager();
    await openForm();
    await pick([asset('a'), asset('b')]);
    await fillAndSave();

    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(
        'Saved, but 2 photo changes failed. Edit the entry to retry.'
      )
    );
    expect(h.foodLog.createEntry).toHaveBeenCalledTimes(1);
    expect(h.toast.success).not.toHaveBeenCalled();
    // The form closed: the entry was saved, not lost.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save Dish' })).not.toBeInTheDocument());
  });

  it('FLI-008: makes no Immich request when no Immich photo was picked', async () => {
    renderManager();
    await openForm();
    await fillAndSave();

    await waitFor(() => expect(h.foodLog.createEntry).toHaveBeenCalledTimes(1));
    expect(h.foodLog.attachImmichAssets).not.toHaveBeenCalled();
    await waitFor(() => expect(h.toast.success).toHaveBeenCalledWith('Dish logged'));
    // Sanity: the list item for the existing entry is untouched by the form.
    expect(within(screen.getByRole('list')).getByText('Carbonara')).toBeInTheDocument();
  });
});
