/**
 * ImmichBulkImportDialog - count confirmation, progress, result summary
 *
 * Test cases:
 * - BD-001: Counts first and asks to confirm the number that will be linked
 * - BD-002: Warns when more than the cap match
 * - BD-003: Links page by page until the server says it is finished, then summarises
 * - BD-004: A double click starts one run, not two
 * - BD-005: Nothing to link leaves the confirm button disabled
 * - BD-006: A failing page stops the run and says so, keeping what was linked
 * - BD-007: A failed count shows the error and offers Close only
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ImmichBulkPreview } from '../../types/immich';

const h = vi.hoisted(() => ({
  immich: { previewBulkLink: vi.fn(), linkBulkPage: vi.fn() },
}));
vi.mock('../../services/immich.service', () => ({ default: h.immich }));

import ImmichBulkImportDialog from '../ImmichBulkImportDialog';

const preview = (over: Partial<ImmichBulkPreview> = {}): ImmichBulkPreview => ({
  matching: 450,
  alreadyLinked: 50,
  toLink: 400,
  capped: false,
  cap: 5000,
  pageSize: 200,
  pages: 3,
  ...over,
});

function renderDialog() {
  const onFinished = vi.fn();
  const onClose = vi.fn();
  render(
    <ImmichBulkImportDialog
      tripId={42}
      filters={{ dateFrom: '2026-01-05', dateTo: '2026-01-10' }}
      onFinished={onFinished}
      onClose={onClose}
    />
  );
  return { onFinished, onClose };
}

describe('ImmichBulkImportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.immich.previewBulkLink.mockResolvedValue(preview());
  });

  it('BD-001: asks to confirm the count that will be linked', async () => {
    renderDialog();
    expect(await screen.findByText('Link 400 photos to this trip?')).toBeInTheDocument();
    expect(screen.getByText(/450 photos match/)).toHaveTextContent('50 already linked will be skipped');
    expect(h.immich.previewBulkLink).toHaveBeenCalledWith(42, { dateFrom: '2026-01-05', dateTo: '2026-01-10' });
    expect(h.immich.linkBulkPage).not.toHaveBeenCalled();
  });

  it('BD-002: warns when the cap applies', async () => {
    h.immich.previewBulkLink.mockResolvedValue(preview({ matching: 5000, toLink: 5000, alreadyLinked: 0, capped: true, pages: 25 }));
    renderDialog();
    expect(await screen.findByText(/More than 5,000 photos match/)).toBeInTheDocument();
  });

  it('BD-003: links page by page and summarises', async () => {
    h.immich.linkBulkPage
      .mockResolvedValueOnce({ linked: 190, alreadyLinked: 10, failed: 0, errors: [], nextPage: 2 })
      .mockResolvedValueOnce({ linked: 150, alreadyLinked: 40, failed: 10, errors: ['Batch 1: boom'], nextPage: 3 })
      .mockResolvedValueOnce({ linked: 0, alreadyLinked: 0, failed: 0, errors: [], nextPage: null });
    const { onFinished } = renderDialog();

    fireEvent.click(await screen.findByRole('button', { name: 'Link 400 photos' }));

    expect(await screen.findByText('Import complete')).toBeInTheDocument();
    expect(h.immich.linkBulkPage.mock.calls.map((c) => c[2])).toEqual([1, 2, 3]);
    expect(screen.getByText('340 photos linked')).toBeInTheDocument();
    expect(screen.getByText('50 already linked')).toBeInTheDocument();
    expect(screen.getByText('10 failed')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Batch 1: boom');
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(onFinished).toHaveBeenCalledWith(expect.objectContaining({ linked: 340, failed: 10, stopped: false }));
  });

  it('BD-004: a double click runs the import once', async () => {
    let release: (value: unknown) => void = () => undefined;
    h.immich.linkBulkPage.mockImplementation(
      () => new Promise((resolve) => { release = resolve; })
    );
    renderDialog();

    const button = await screen.findByRole('button', { name: 'Link 400 photos' });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(h.immich.linkBulkPage).toHaveBeenCalledTimes(1));

    release({ linked: 1, alreadyLinked: 0, failed: 0, errors: [], nextPage: null });
    await screen.findByText('Import complete');
    expect(h.immich.linkBulkPage).toHaveBeenCalledTimes(1);
  });

  it('BD-005: nothing to link disables the confirm button', async () => {
    h.immich.previewBulkLink.mockResolvedValue(preview({ matching: 3, alreadyLinked: 3, toLink: 0, pages: 1 }));
    renderDialog();
    expect(await screen.findByText(/All 3 matching photos are already linked/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Link' })).toBeDisabled();
  });

  it('BD-006: a failing page stops the run and keeps the count so far', async () => {
    h.immich.linkBulkPage
      .mockResolvedValueOnce({ linked: 200, alreadyLinked: 0, failed: 0, errors: [], nextPage: 2 })
      .mockRejectedValueOnce(new Error('Immich took too long to respond'));
    const { onFinished } = renderDialog();

    fireEvent.click(await screen.findByRole('button', { name: 'Link 400 photos' }));

    expect(await screen.findByText('Import stopped')).toBeInTheDocument();
    expect(screen.getByText('200 photos linked')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Immich took too long to respond');
    expect(onFinished).toHaveBeenCalledWith(expect.objectContaining({ linked: 200, stopped: true }));
  });

  it('BD-007: a failed count shows the error', async () => {
    h.immich.previewBulkLink.mockRejectedValue(new Error('Immich could not be reached'));
    renderDialog();
    expect(await screen.findByRole('alert')).toHaveTextContent('Immich could not be reached');
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});
