/**
 * Background PDF parsing
 *
 * - PIW-001: Uploading hands the import to the tracker and closes the dialog
 * - PIW-002: A failed upload shows the server's reason, not a generic message
 * - PIW-003: When parsing finishes, a banner links to the review and the import is untracked
 * - PIW-004: An import still parsing is polled until it finishes
 * - PIW-005: An import that no longer exists is dropped without a banner
 * - PIW-006: While parsing, a "Reading…" banner offers Cancel, which deletes the import
 * - PIW-007: A PDF waiting in the server's queue says so once; the result replaces that banner
 * - PIW-008: The "Reading…" banner is short-lived, not pinned until the PDF is done
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import toast, { Toaster } from 'react-hot-toast';

vi.mock('../../services/pdfImport.service', () => ({
  default: {
    uploadPdf: vi.fn(),
    getPdfImportById: vi.fn(),
    deletePdfImport: vi.fn(),
  },
}));
vi.mock('../../services/trip.service', () => ({
  default: { getTrips: vi.fn().mockResolvedValue({ trips: [] }) },
}));

import PdfImportWatcher, { PDF_IMPORT_STARTED_BANNER_MS } from '../PdfImportWatcher';
import PdfUploadModal from '../PdfUploadModal';
import pdfImportService from '../../services/pdfImport.service';
import { useAuthStore } from '../../store/authStore';
import { usePdfImportTrackerStore } from '../../store/pdfImportTrackerStore';
import type { PdfImport } from '../../types/pdfImport';

const service = vi.mocked(pdfImportService);

function makeImport(overrides: Partial<PdfImport> = {}): PdfImport {
  return {
    id: 7,
    userId: 1,
    originalName: 'hotel.pdf',
    storedPath: 'pdfs/1/x.pdf',
    fileSizeBytes: 1000,
    status: 'PARSING',
    errorMessage: null,
    processedAt: null,
    createdAt: '2026-11-20T00:00:00.000Z',
    updatedAt: '2026-11-20T00:00:00.000Z',
    _count: { pendingEntities: 0 },
    ...overrides,
  };
}

function renderWithApp(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Toaster />
        {ui}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // react-hot-toast's Toaster reads prefers-reduced-motion; jsdom has no matchMedia.
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  usePdfImportTrackerStore.getState().clear();
  useAuthStore.setState({ isAuthenticated: true });
});

afterEach(() => {
  act(() => toast.remove());
});

describe('PdfUploadModal', () => {
  it('PIW-001: tracks the upload and closes instead of waiting', async () => {
    service.uploadPdf.mockResolvedValue(makeImport({ id: 42 }));
    const onClose = vi.fn();
    const { container } = renderWithApp(<PdfUploadModal isOpen onClose={onClose} tripId={3} />);

    const input = container.ownerDocument.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, {
      target: { files: [new File(['%PDF-1.4'], 'hotel.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: /upload & parse/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(service.uploadPdf).toHaveBeenCalledWith(expect.any(File), 3);
    expect(usePdfImportTrackerStore.getState().tracked).toEqual([
      expect.objectContaining({ id: 42, name: 'hotel.pdf' }),
    ]);
  });

  it('PIW-002: shows why the upload was refused', async () => {
    service.uploadPdf.mockRejectedValue({
      response: { data: { message: 'LLM not configured — cannot process PDFs.' } },
    });
    const onClose = vi.fn();
    const { container } = renderWithApp(<PdfUploadModal isOpen onClose={onClose} />);

    const input = container.ownerDocument.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, {
      target: { files: [new File(['%PDF-1.4'], 'hotel.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: /upload & parse/i }));

    expect(await screen.findByText(/LLM not configured/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(usePdfImportTrackerStore.getState().tracked).toEqual([]);
  });
});

describe('PdfImportWatcher', () => {
  it('PIW-003: pops a banner linking to the review once parsed', async () => {
    service.getPdfImportById.mockResolvedValue(
      makeImport({ status: 'PARSED', _count: { pendingEntities: 2 } })
    );
    usePdfImportTrackerStore.getState().track(7, 'hotel.pdf');

    renderWithApp(<PdfImportWatcher />);

    expect(await screen.findByText('hotel.pdf is ready')).toBeInTheDocument();
    expect(screen.getByText('Found 2 bookings to review.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /review/i })).toHaveAttribute(
      'href',
      '/saved-links?reviewImport=7'
    );
    expect(usePdfImportTrackerStore.getState().tracked).toEqual([]);
  });

  it('PIW-004: keeps polling while the model is still working', async () => {
    service.getPdfImportById
      .mockResolvedValueOnce(makeImport({ status: 'PARSING' }))
      .mockResolvedValue(makeImport({ status: 'PARSE_FAILED', errorMessage: 'Model timed out' }));
    usePdfImportTrackerStore.getState().track(7, 'hotel.pdf');

    renderWithApp(<PdfImportWatcher />);

    expect(await screen.findByText('Reading hotel.pdf…')).toBeInTheDocument();
    expect(await screen.findByText("Couldn't read hotel.pdf", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('Model timed out')).toBeInTheDocument();
    expect(service.getPdfImportById.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('PIW-005: drops an import that no longer exists', async () => {
    service.getPdfImportById.mockRejectedValue(
      Object.assign(new Error('Not found'), { isAxiosError: true, response: { status: 404 } })
    );
    usePdfImportTrackerStore.getState().track(7, 'hotel.pdf');

    renderWithApp(<PdfImportWatcher />);

    await waitFor(() => expect(usePdfImportTrackerStore.getState().tracked).toEqual([]));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('PIW-007: a queued PDF shows its place in line once, then the result', async () => {
    service.getPdfImportById
      .mockResolvedValueOnce(makeImport({ status: 'UPLOADED', queuePosition: 1 }))
      .mockResolvedValueOnce(makeImport({ status: 'PARSING', queuePosition: 0 }))
      .mockResolvedValue(makeImport({ status: 'PARSED', _count: { pendingEntities: 1 } }));
    usePdfImportTrackerStore.getState().track(7, 'hotel.pdf');

    renderWithApp(<PdfImportWatcher />);

    expect(await screen.findByText('Waiting to read hotel.pdf')).toBeInTheDocument();
    expect(screen.getByText(/1 PDF ahead of it/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(await screen.findByText('hotel.pdf is ready', {}, { timeout: 8000 })).toBeInTheDocument();
    // Moving from the queue to being read does not pop a second banner; the
    // result replaces the first one in place.
    expect(screen.queryByText('Reading hotel.pdf…')).toBeNull();
    expect(screen.getAllByRole('status')).toHaveLength(1);
  }, 10000);

  it('PIW-008: the "Reading…" banner times out instead of staying up', async () => {
    const custom = vi.spyOn(toast, 'custom');
    service.getPdfImportById.mockResolvedValue(makeImport({ status: 'PARSING' }));
    usePdfImportTrackerStore.getState().track(7, 'hotel.pdf');

    renderWithApp(<PdfImportWatcher />);

    expect(await screen.findByText('Reading hotel.pdf…')).toBeInTheDocument();
    expect(custom).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ id: 'pdf-import-7', duration: PDF_IMPORT_STARTED_BANNER_MS })
    );
    expect(PDF_IMPORT_STARTED_BANNER_MS).toBeLessThanOrEqual(8000);
    custom.mockRestore();
  });

  it('PIW-006: Cancel deletes the import and stops tracking it', async () => {
    service.getPdfImportById.mockResolvedValue(makeImport({ status: 'PARSING' }));
    service.deletePdfImport.mockResolvedValue(undefined);
    usePdfImportTrackerStore.getState().track(7, 'hotel.pdf');

    renderWithApp(<PdfImportWatcher />);

    expect(await screen.findByText('Reading hotel.pdf…')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(service.deletePdfImport).toHaveBeenCalledWith(7));
    expect(await screen.findByText('Stopped reading hotel.pdf')).toBeInTheDocument();
    expect(usePdfImportTrackerStore.getState().tracked).toEqual([]);
  });
});
