/**
 * PDFs being read show on the Inbox, not in a pinned banner
 *
 * - IIP-001: Nothing renders when no PDF is being read
 * - IIP-002: A PDF in the server's queue shows its place in line; Cancel deletes it
 * - IIP-003: The Inbox tab in the bottom bar shows a spinner while a PDF is read
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';

vi.mock('../../services/pdfImport.service', () => ({
  default: {
    getPdfImportById: vi.fn(),
    deletePdfImport: vi.fn(),
    getPendingCount: vi.fn(async () => ({ count: 0 })),
  },
}));
vi.mock('../../services/savedLink.service', () => ({
  default: { getInboxCount: vi.fn(async () => ({ count: 0 })) },
}));
vi.mock('../../store/authStore', () => ({
  useUser: () => ({ id: 1, username: 'Daniel' }),
}));
vi.mock('../../store/scrollStore', () => ({ useClearPosition: () => vi.fn() }));
vi.mock('../CaptureSheet', () => ({ default: () => null }));

import ImportsInProgressPanel from '../ImportsInProgressPanel';
import MobileBottomNav from '../MobileBottomNav';
import pdfImportService from '../../services/pdfImport.service';
import { usePdfImportTrackerStore } from '../../store/pdfImportTrackerStore';
import type { PdfImport } from '../../types/pdfImport';

const service = vi.mocked(pdfImportService);

function renderWith(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  usePdfImportTrackerStore.getState().clear();
});

describe('ImportsInProgressPanel', () => {
  it('IIP-001: renders nothing when no PDF is being read', () => {
    const { container } = renderWith(<ImportsInProgressPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('IIP-002: shows the place in line, and Cancel deletes the import', async () => {
    service.getPdfImportById.mockResolvedValue({
      id: 7,
      status: 'UPLOADED',
      queuePosition: 2,
    } as PdfImport);
    service.deletePdfImport.mockResolvedValue(undefined);
    usePdfImportTrackerStore.getState().track(7, 'flight.pdf');

    renderWith(<ImportsInProgressPanel />);

    expect(screen.getByRole('heading', { name: 'Reading PDFs' })).toBeInTheDocument();
    expect(screen.getByText('flight.pdf')).toBeInTheDocument();
    expect(await screen.findByText('Waiting: 2 PDFs ahead of it')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(service.deletePdfImport).toHaveBeenCalledWith(7));
    await waitFor(() => expect(usePdfImportTrackerStore.getState().tracked).toEqual([]));
    expect(screen.queryByRole('heading', { name: 'Reading PDFs' })).toBeNull();
  });

  it('IIP-003: the bottom bar Inbox tab spins while a PDF is read', () => {
    renderWith(<MobileBottomNav />);
    expect(screen.queryByTestId('nav-busy')).toBeNull();

    act(() => usePdfImportTrackerStore.getState().track(7, 'flight.pdf'));
    expect(screen.getByTestId('nav-busy')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Inbox, reading a PDF/ })).toBeInTheDocument();
  });
});
