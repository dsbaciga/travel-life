/**
 * BulkImportModal tests
 *
 * Test cases:
 * - BIM-001: Upload, auto-mapping, server dry run preview, import and result
 * - BIM-002: Duplicates are unticked by default and excluded from the import request
 * - BIM-003: Double-clicking Import sends one real request
 * - BIM-004: Missing required mapping blocks the preview
 * - BIM-005: Oversized and over-long files are rejected before any request
 * - BIM-006: A failed import reports an error and stays on the preview so it can be retried
 * - BIM-007: Lodging and transportation can be chosen, mapped and previewed with their own columns
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BulkImportModal from '../BulkImportModal';
import type { BulkImportResult } from '../../types/bulkImport';

const mockImportRows = vi.fn();
vi.mock('../../services/bulkImport.service', () => {
  const mockService = { importRows: (...args: unknown[]) => mockImportRows(...args) };
  return { bulkImportService: mockService, default: mockService };
});

const dryRunResult: BulkImportResult = {
  dryRun: true,
  total: 2,
  valid: 2,
  invalid: 0,
  excluded: 0,
  created: 0,
  tripTimezoneSet: null,
  defaultTimezone: null,
  rows: [
    { index: 0, status: 'valid', errors: [], warnings: [], normalized: { name: 'Louvre', latitude: 48.86, longitude: 2.33, address: null, category: null } },
    {
      index: 1,
      status: 'valid',
      errors: [],
      warnings: [{ field: 'name', code: 'duplicate_existing', message: 'Looks like a duplicate of the existing location "Orsay"' }],
      normalized: { name: 'Orsay', latitude: 48.86, longitude: 2.32, address: null, category: null },
    },
  ],
};

function renderModal(onComplete = vi.fn(), onClose = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <BulkImportModal isOpen onClose={onClose} tripId={5} onComplete={onComplete} />
    </QueryClientProvider>
  );
  return { onComplete, onClose };
}

async function upload(user: ReturnType<typeof userEvent.setup>, content: string, name = 'places.csv') {
  const input = screen.getByLabelText('CSV file') as HTMLInputElement;
  await user.upload(input, new File([content], name, { type: 'text/csv' }));
}

const CSV = 'Title,Lat,Lng\nLouvre,48.86,2.33\nOrsay,48.86,2.32\n';

describe('BulkImportModal', () => {
  beforeEach(() => {
    mockImportRows.mockReset();
  });

  it('BIM-001: walks upload -> mapping -> preview -> result', async () => {
    const user = userEvent.setup();
    const { onComplete } = renderModal();
    mockImportRows.mockResolvedValueOnce(dryRunResult);
    mockImportRows.mockResolvedValueOnce({ ...dryRunResult, dryRun: false, created: 1, excluded: 1, rows: [
      { ...dryRunResult.rows[0], status: 'created' },
      { ...dryRunResult.rows[1], status: 'excluded' },
    ] });

    await upload(user, CSV);
    expect(await screen.findByText(/2 rows, 3 columns/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next: map columns' }));

    // Title/Lat/Lng matched automatically
    expect(screen.getByLabelText(/^Name/)).toHaveValue('0');
    expect(screen.getByLabelText('Latitude')).toHaveValue('1');
    expect(screen.getByLabelText('Longitude')).toHaveValue('2');
    await user.click(screen.getByRole('button', { name: 'Next: preview' }));

    expect(mockImportRows).toHaveBeenNthCalledWith(1, 5, 'locations', {
      rows: [
        { name: 'Louvre', latitude: '48.86', longitude: '2.33' },
        { name: 'Orsay', latitude: '48.86', longitude: '2.32' },
      ],
      dryRun: true,
      excludeRows: [],
    });
    expect(await screen.findByText(/Looks like a duplicate/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import 1 row' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Import 1 row' }));
    expect(await screen.findByText(/1 location was imported\./)).toBeInTheDocument();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Download error report (CSV)' })).toBeInTheDocument();
  });

  it('BIM-002: duplicates are unticked by default, can be re-ticked, and are excluded in the request', async () => {
    const user = userEvent.setup();
    renderModal();
    mockImportRows.mockResolvedValueOnce(dryRunResult);
    mockImportRows.mockResolvedValueOnce({ ...dryRunResult, dryRun: false, created: 2 });

    await upload(user, CSV);
    await screen.findByText(/2 rows/);
    await user.click(screen.getByRole('button', { name: 'Next: map columns' }));
    await user.click(screen.getByRole('button', { name: 'Next: preview' }));

    const dup = await screen.findByLabelText('Include row 2');
    expect(dup).not.toBeChecked();
    expect(screen.getByLabelText('Include row 1')).toBeChecked();

    await user.click(dup);
    expect(screen.getByRole('button', { name: 'Import 2 rows' })).toBeInTheDocument();
    await user.click(dup);
    await user.click(screen.getByRole('button', { name: 'Import 1 row' }));

    await waitFor(() => expect(mockImportRows).toHaveBeenCalledTimes(2));
    expect(mockImportRows.mock.calls[1][2]).toMatchObject({ dryRun: false, excludeRows: [1] });
  });

  it('BIM-003: a double click sends one real import', async () => {
    const user = userEvent.setup();
    renderModal();
    let resolveImport: (value: BulkImportResult) => void = () => undefined;
    mockImportRows.mockResolvedValueOnce(dryRunResult);
    mockImportRows.mockReturnValueOnce(new Promise<BulkImportResult>((resolve) => { resolveImport = resolve; }));

    await upload(user, CSV);
    await screen.findByText(/2 rows/);
    await user.click(screen.getByRole('button', { name: 'Next: map columns' }));
    await user.click(screen.getByRole('button', { name: 'Next: preview' }));
    const importButton = await screen.findByRole('button', { name: 'Import 1 row' });

    await user.dblClick(importButton);
    expect(mockImportRows).toHaveBeenCalledTimes(2); // one dry run + exactly one real run

    resolveImport({ ...dryRunResult, dryRun: false, created: 1 });
    expect(await screen.findByText(/was imported/)).toBeInTheDocument();
    expect(mockImportRows).toHaveBeenCalledTimes(2);
  });

  it('BIM-004: blocks the preview until the required Name field is mapped', async () => {
    const user = userEvent.setup();
    renderModal();

    await upload(user, 'foo,bar\n1,2\n');
    await screen.findByText(/1 row, 2 columns/);
    await user.click(screen.getByRole('button', { name: 'Next: map columns' }));

    expect(screen.getByRole('button', { name: 'Next: preview' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a column for: Name');

    await user.selectOptions(screen.getByLabelText(/^Name/), 'foo');
    expect(screen.getByRole('button', { name: 'Next: preview' })).toBeEnabled();
    expect(mockImportRows).not.toHaveBeenCalled();
  });

  it('BIM-005: rejects files that are too large or have too many rows', async () => {
    const user = userEvent.setup();
    renderModal();

    const rows = Array.from({ length: 501 }, (_, i) => `Place ${i}`).join('\n');
    await upload(user, `name\n${rows}\n`);
    expect(await screen.findByRole('alert')).toHaveTextContent(/at most 500 can be imported/);

    await upload(user, `name,notes\nA,${'x'.repeat(20001)}\n`);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/too long to import/));
    expect(screen.getByRole('button', { name: 'Next: map columns' })).toBeDisabled();
    expect(mockImportRows).not.toHaveBeenCalled();
  });

  it('BIM-006: a failed import stays on the preview so it can be retried', async () => {
    const user = userEvent.setup();
    const { onComplete } = renderModal();
    mockImportRows.mockResolvedValueOnce(dryRunResult);
    mockImportRows.mockRejectedValueOnce(new Error('boom'));

    await upload(user, CSV);
    await screen.findByText(/2 rows/);
    await user.click(screen.getByRole('button', { name: 'Next: map columns' }));
    await user.click(screen.getByRole('button', { name: 'Next: preview' }));
    await user.click(await screen.findByRole('button', { name: 'Import 1 row' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Import 1 row' })).toBeEnabled());
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByText('Preview import')).toBeInTheDocument();
  });

  it('BIM-007: lodging and transportation use their own columns and endpoint', async () => {
    const user = userEvent.setup();
    renderModal();

    const stayRow = {
      index: 0,
      status: 'valid' as const,
      errors: [],
      warnings: [],
      normalized: {
        type: 'hotel',
        name: 'Lutetia',
        checkInDate: '2026-04-05T13:00:00.000Z',
        checkOutDate: '2026-04-08T09:00:00.000Z',
        timezone: 'Europe/Paris',
        cost: '480.00',
        currency: 'EUR',
      },
    };
    mockImportRows.mockResolvedValueOnce({ ...dryRunResult, total: 1, valid: 1, rows: [stayRow] });
    mockImportRows.mockResolvedValueOnce({ ...dryRunResult, dryRun: false, total: 1, valid: 1, created: 1, rows: [{ ...stayRow, status: 'created' }] });

    await user.click(screen.getByLabelText('Lodging'));
    expect(screen.getByRole('button', { name: 'Download transportation template' })).toBeInTheDocument();
    await upload(user, 'Hotel,Type,Check In,Check Out,Total,Currency\nLutetia,Hotel,2026-04-05 15:00,2026-04-08 11:00,480,EUR\n', 'stays.csv');
    await screen.findByText(/1 row, 6 columns/);
    await user.click(screen.getByRole('button', { name: 'Next: map columns' }));

    expect(screen.getByLabelText(/^Name/)).toHaveValue('0');
    expect(screen.getByLabelText(/^Type/)).toHaveValue('1');
    expect(screen.getByLabelText(/^Check-in/)).toHaveValue('2');
    expect(screen.getByLabelText(/^Check-out/)).toHaveValue('3');
    await user.click(screen.getByRole('button', { name: 'Next: preview' }));

    expect(mockImportRows).toHaveBeenNthCalledWith(1, 5, 'lodging', {
      rows: [{ type: 'Hotel', name: 'Lutetia', checkInDate: '2026-04-05 15:00', checkOutDate: '2026-04-08 11:00', cost: '480', currency: 'EUR' }],
      dryRun: true,
      excludeRows: [],
    });
    expect(await screen.findByText('Check-in')).toBeInTheDocument();
    expect(screen.getByText('480.00 EUR')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Import 1 row' }));
    expect(await screen.findByText(/1 stay was imported\./)).toBeInTheDocument();
  });

  it('BIM-007: the transportation preview shows from, to, departure and arrival', async () => {
    const user = userEvent.setup();
    renderModal();
    mockImportRows.mockResolvedValueOnce({
      ...dryRunResult,
      total: 1,
      valid: 1,
      rows: [
        {
          index: 0,
          status: 'valid',
          errors: [],
          warnings: [{ field: 'endTimezone', code: 'timezone_assumed', message: 'No end timezone: the arrival was read as Europe/Paris time' }],
          normalized: { type: 'flight', fromLocationName: 'CDG', toLocationName: 'JFK', departureTime: '2026-04-10T09:00:00.000Z', arrivalTime: '2026-04-10T17:30:00.000Z', startTimezone: 'Europe/Paris', endTimezone: 'America/New_York', cost: null, currency: null },
        },
      ],
    });

    await user.click(screen.getByLabelText('Transportation'));
    await upload(user, 'type,from,to,departure,arrival\nflight,CDG,JFK,2026-04-10 11:00,2026-04-10 13:30\n', 'legs.csv');
    await screen.findByText(/1 row, 5 columns/);
    await user.click(screen.getByRole('button', { name: 'Next: map columns' }));
    await user.click(screen.getByRole('button', { name: 'Next: preview' }));

    expect(mockImportRows).toHaveBeenCalledWith(5, 'transportation', expect.objectContaining({ dryRun: true }));
    expect(await screen.findByText('CDG')).toBeInTheDocument();
    expect(screen.getByText('JFK')).toBeInTheDocument();
    expect(screen.getByText(/No end timezone/)).toBeInTheDocument();
    expect(screen.getByText('Arrival')).toBeInTheDocument();
  });
});
