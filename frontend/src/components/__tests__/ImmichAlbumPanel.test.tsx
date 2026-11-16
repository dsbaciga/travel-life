/**
 * ImmichAlbumPanel - link, manual sync, opt-in export to Immich
 *
 * Test cases:
 * - AP-001: Renders nothing when Immich is not configured
 * - AP-002: An unlinked album can be linked to a chosen Immich album
 * - AP-003: Sync reports what changed, including photos no longer in the Immich album
 * - AP-004: Export asks first, says what will be written, and writes nothing on Cancel
 * - AP-005: Confirming the export writes once and reports the result
 * - AP-006: Export errors (for example a key without permission) are shown as returned
 * - AP-007: Nothing is sent to Immich on render: sync and export are button-only
 * - AP-008: Escape in the export confirmation closes only it, not the album modal behind it
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { PhotoAlbum } from '../../types/photo';

const h = vi.hoisted(() => ({
  immich: {
    getSettings: vi.fn(),
    getAlbums: vi.fn(),
    setAlbumLink: vi.fn(),
    syncAlbum: vi.fn(),
    previewAlbumExport: vi.fn(),
    exportAlbum: vi.fn(),
  },
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock('../../services/immich.service', () => ({ default: h.immich }));
vi.mock('react-hot-toast', () => ({ default: h.toast }));
vi.mock('../../hooks/useTripLinkSummary', () => ({
  useTripLinkSummary: () => ({ getLinkSummary: vi.fn().mockReturnValue(null), invalidate: vi.fn(), isLoading: false }),
}));
vi.mock('../LinkButton', () => ({ default: () => null }));
vi.mock('../MarkdownEditor', () => ({ default: () => <div data-testid="markdown-editor" /> }));

import ImmichAlbumPanel from '../ImmichAlbumPanel';
import AlbumModal from '../AlbumModal';

const album = (over: Partial<PhotoAlbum> = {}): PhotoAlbum => ({
  id: 7,
  tripId: 42,
  name: 'Beach',
  description: null,
  coverPhotoId: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  immichAlbumId: null,
  immichAlbumSyncedAt: null,
  ...over,
});

describe('ImmichAlbumPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.immich.getSettings.mockResolvedValue({ immichConfigured: true });
    h.immich.getAlbums.mockResolvedValue({
      albums: [
        { id: 'alb-1', albumName: 'Beach day', assetCount: 3 },
        { id: 'alb-2', albumName: 'Hike', assetCount: 9 },
      ],
    });
  });

  it('AP-001: renders nothing when Immich is not configured', async () => {
    h.immich.getSettings.mockResolvedValue({ immichConfigured: false });
    const { container } = render(<ImmichAlbumPanel album={album()} />);
    await waitFor(() => expect(h.immich.getSettings).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(h.immich.getAlbums).not.toHaveBeenCalled();
  });

  it('AP-002: links the chosen Immich album', async () => {
    h.immich.setAlbumLink.mockResolvedValue({ id: 7, immichAlbumId: 'alb-2', immichAlbumSyncedAt: null });
    const onChanged = vi.fn();
    render(<ImmichAlbumPanel album={album()} onChanged={onChanged} />);

    await screen.findByRole('option', { name: 'Hike' });
    const link = screen.getByRole('button', { name: 'Link' });
    expect(link).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Immich album to link'), { target: { value: 'alb-2' } });
    fireEvent.click(link);

    await screen.findByText('Hike');
    expect(h.immich.setAlbumLink).toHaveBeenCalledWith(7, 'alb-2');
    expect(onChanged).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sync from Immich' })).toBeInTheDocument();
  });

  it('AP-003: sync reports changes and photos no longer in the Immich album', async () => {
    h.immich.syncAlbum.mockResolvedValue({
      immichAlbumName: 'Beach day',
      immichAssetCount: 12,
      newlyLinked: 4,
      addedToAlbum: 5,
      alreadyInAlbum: 7,
      failed: 0,
      errors: [],
      notInImmichAlbum: 2,
      capped: false,
      syncedAt: '2026-02-01T12:00:00.000Z',
    });
    render(<ImmichAlbumPanel album={album({ immichAlbumId: 'alb-1' })} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Sync from Immich' }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('4 new photos linked');
    expect(status).toHaveTextContent('5 photos added to this album');
    expect(status).toHaveTextContent('2 photos here no longer in the Immich album (left untouched)');
    expect(h.immich.syncAlbum).toHaveBeenCalledWith(7);
  });

  it('AP-004: export asks first and writes nothing on Cancel', async () => {
    h.immich.previewAlbumExport.mockResolvedValue({
      albumName: 'Beach',
      immichAssetCount: 12,
      skippedUploaded: 3,
      linkedImmichAlbumId: null,
      willCreate: true,
    });
    render(<ImmichAlbumPanel album={album()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Create album in Immich...' }));

    const dialog = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
    expect(dialog).toHaveTextContent('create a new album named "Beach" in your Immich library');
    expect(dialog).toHaveTextContent('add 12 photos');
    expect(dialog).toHaveTextContent('Nothing in Immich is deleted or changed');
    expect(dialog).toHaveTextContent('3 uploaded photos will be skipped');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText(/Nothing in Immich is deleted/)).not.toBeInTheDocument());
    expect(h.immich.exportAlbum).not.toHaveBeenCalled();
  });

  it('AP-005: confirming writes once and reports the result', async () => {
    h.immich.previewAlbumExport.mockResolvedValue({
      albumName: 'Beach',
      immichAssetCount: 12,
      skippedUploaded: 3,
      linkedImmichAlbumId: null,
      willCreate: true,
    });
    h.immich.exportAlbum.mockResolvedValue({
      immichAlbumId: 'new-1',
      created: true,
      added: 12,
      alreadyInAlbum: 0,
      failed: [],
      skippedUploaded: 3,
    });
    const onChanged = vi.fn();
    render(<ImmichAlbumPanel album={album()} onChanged={onChanged} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Create album in Immich...' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Create in Immich' }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Created the Immich album');
    expect(status).toHaveTextContent('12 photos added');
    expect(status).toHaveTextContent('3 uploaded photos skipped (not uploaded to Immich)');
    expect(h.immich.exportAlbum).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalled();
    // Now linked, so the next action is an update rather than a create.
    expect(screen.getByRole('button', { name: 'Update album in Immich...' })).toBeInTheDocument();
  });

  it("AP-006: shows Immich's permission error as returned", async () => {
    h.immich.previewAlbumExport.mockResolvedValue({
      albumName: 'Beach',
      immichAssetCount: 2,
      skippedUploaded: 0,
      linkedImmichAlbumId: null,
      willCreate: true,
    });
    h.immich.exportAlbum.mockRejectedValue(
      new Error('Immich refused to create the album (Missing required permission: album.create). Check that your Immich API key has the required permission.')
    );
    render(<ImmichAlbumPanel album={album()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Create album in Immich...' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Create in Immich' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('album.create');
  });

  it('AP-007: nothing is written or synced just by rendering', async () => {
    render(<ImmichAlbumPanel album={album({ immichAlbumId: 'alb-1' })} />);
    await screen.findByRole('button', { name: 'Sync from Immich' });
    expect(h.immich.syncAlbum).not.toHaveBeenCalled();
    expect(h.immich.exportAlbum).not.toHaveBeenCalled();
    expect(h.immich.setAlbumLink).not.toHaveBeenCalled();
  });

  it('AP-008: Escape in the export confirmation closes only it, not the album modal behind it', async () => {
    h.immich.previewAlbumExport.mockResolvedValue({
      albumName: 'Beach',
      immichAssetCount: 12,
      skippedUploaded: 0,
      linkedImmichAlbumId: null,
      willCreate: true,
    });
    const onClose = vi.fn();
    render(<AlbumModal album={album()} tripId={42} onSave={vi.fn()} onClose={onClose} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Create album in Immich...' }));
    await screen.findByText(/Nothing in Immich is deleted/);

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText(/Nothing in Immich is deleted/)).not.toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    expect(h.immich.exportAlbum).not.toHaveBeenCalled();

    // With the confirmation gone, Escape reaches the album modal again.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
