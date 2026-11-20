/**
 * PDF import accept path: parsed booking dates are anchored in the entity's
 * timezone (entity -> trip -> user), never read as UTC.
 *
 * Regression: a Madrid hotel parsed as checkInDate "2027-03-12" displayed as
 * "Mar 11, 7:00 PM EST" because `new Date('2027-03-12')` is UTC midnight.
 */

jest.mock('@prisma/client', () => ({
  PdfImportStatus: { PENDING: 'PENDING', PROCESSING: 'PROCESSING', COMPLETED: 'COMPLETED', FAILED: 'FAILED', NO_ENTITIES: 'NO_ENTITIES' },
  PendingEntityType: { TRANSPORTATION: 'TRANSPORTATION', LODGING: 'LODGING', ACTIVITY: 'ACTIVITY', LOCATION: 'LOCATION' },
  PendingEntityStatus: { PENDING: 'PENDING', ACCEPTED: 'ACCEPTED', REJECTED: 'REJECTED' },
}));

jest.mock('../pdfParser.service', () => ({ pdfParserService: {} }));

const mockTx = {
  pendingEntity: { updateMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  transportation: { create: jest.fn() },
  lodging: { create: jest.fn() },
  activity: { create: jest.fn() },
  location: { create: jest.fn() },
  entityLink: { create: jest.fn() },
};

const mockPrisma = {
  trip: { findFirst: jest.fn() },
  user: { findUnique: jest.fn() },
  $transaction: jest.fn((cb: (tx: typeof mockTx) => unknown) => cb(mockTx)),
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

import { pdfImportService, parseBookingDateTime } from '../pdfImport.service';
import { AppError } from '../../errors/errors';

const USER_ID = 1;
const TRIP_ID = 10;

function setup(opts: {
  entityType: string;
  parsedData: Record<string, unknown>;
  tripTimezone?: string | null;
  userTimezone?: string | null;
}) {
  mockPrisma.trip.findFirst.mockResolvedValue({ id: TRIP_ID, userId: USER_ID, timezone: opts.tripTimezone ?? null });
  mockPrisma.user.findUnique.mockResolvedValue({ timezone: opts.userTimezone ?? null });
  mockTx.pendingEntity.updateMany.mockResolvedValue({ count: 1 });
  mockTx.pendingEntity.findFirst.mockResolvedValue({
    id: 5,
    userId: USER_ID,
    pdfImportId: 3,
    entityType: opts.entityType,
    parsedData: opts.parsedData,
  });
  for (const model of [mockTx.transportation, mockTx.lodging, mockTx.activity, mockTx.location]) {
    model.create.mockResolvedValue({ id: 99 });
  }
}

function createdData(model: { create: jest.Mock }) {
  return model.create.mock.calls[0][0].data;
}

describe('pdfImportService.acceptPendingEntity date anchoring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('anchors date-only lodging dates on the local day in a west-of-UTC trip', async () => {
    setup({
      entityType: 'LODGING',
      parsedData: { name: 'Hotel Madrid', checkInDate: '2027-03-12', checkOutDate: '2027-03-14' },
      tripTimezone: 'America/New_York',
    });

    await pdfImportService.acceptPendingEntity(USER_ID, 5, TRIP_ID);

    const data = createdData(mockTx.lodging);
    // 15:00 / 11:00 EDT (DST starts 2027-03-14 at 02:00, so check-out is EDT)
    expect(data.checkInDate.toISOString()).toBe('2027-03-12T20:00:00.000Z');
    expect(data.checkOutDate.toISOString()).toBe('2027-03-14T15:00:00.000Z');
    expect(data.timezone).toBeNull();
  });

  it('falls back to the user timezone when the trip has none', async () => {
    setup({
      entityType: 'LODGING',
      parsedData: { name: 'Motel', checkInDate: '2027-01-05', checkOutDate: '2027-01-06' },
      tripTimezone: null,
      userTimezone: 'America/Los_Angeles',
    });

    await pdfImportService.acceptPendingEntity(USER_ID, 5, TRIP_ID);

    const data = createdData(mockTx.lodging);
    expect(data.checkInDate.toISOString()).toBe('2027-01-05T23:00:00.000Z');
    expect(data.checkOutDate.toISOString()).toBe('2027-01-06T19:00:00.000Z');
  });

  it('prefers the lodging own timezone over the trip and stores it', async () => {
    setup({
      entityType: 'LODGING',
      parsedData: { name: 'Hotel', checkInDate: '2027-03-12', checkOutDate: '2027-03-14', timezone: 'Europe/Madrid' },
      tripTimezone: 'America/New_York',
    });

    await pdfImportService.acceptPendingEntity(USER_ID, 5, TRIP_ID);

    const data = createdData(mockTx.lodging);
    expect(data.checkInDate.toISOString()).toBe('2027-03-12T14:00:00.000Z');
    expect(data.timezone).toBe('Europe/Madrid');
  });

  it('reads wall-clock transport times in the trip timezone, not UTC', async () => {
    setup({
      entityType: 'TRANSPORTATION',
      parsedData: { type: 'flight', departureTime: '2027-03-12T08:30:00', arrivalTime: '2027-03-12T11:45' },
      tripTimezone: 'America/Chicago',
    });

    await pdfImportService.acceptPendingEntity(USER_ID, 5, TRIP_ID);

    const data = createdData(mockTx.transportation);
    expect(data.scheduledStart.toISOString()).toBe('2027-03-12T14:30:00.000Z');
    expect(data.scheduledEnd.toISOString()).toBe('2027-03-12T17:45:00.000Z');
  });

  it('keeps explicit offsets as given', async () => {
    setup({
      entityType: 'TRANSPORTATION',
      parsedData: { type: 'train', departureTime: '2027-03-12T08:30:00+01:00', arrivalTime: '2027-03-12T10:00:00Z' },
      tripTimezone: 'America/Chicago',
    });

    await pdfImportService.acceptPendingEntity(USER_ID, 5, TRIP_ID);

    const data = createdData(mockTx.transportation);
    expect(data.scheduledStart.toISOString()).toBe('2027-03-12T07:30:00.000Z');
    expect(data.scheduledEnd.toISOString()).toBe('2027-03-12T10:00:00.000Z');
  });

  it('stores a date-only activity as all-day at local midnight', async () => {
    setup({
      entityType: 'ACTIVITY',
      parsedData: { name: 'Museum', startTime: '2027-03-13' },
      tripTimezone: 'America/New_York',
    });

    await pdfImportService.acceptPendingEntity(USER_ID, 5, TRIP_ID);

    const data = createdData(mockTx.activity);
    expect(data.allDay).toBe(true);
    expect(data.startTime.toISOString()).toBe('2027-03-13T05:00:00.000Z');
    expect(data.endTime).toBeNull();
  });

  it('keeps a timed activity as not all-day', async () => {
    setup({
      entityType: 'ACTIVITY',
      parsedData: { name: 'Tour', startTime: '2027-03-13T09:00:00', endTime: '2027-03-13T12:00:00' },
      tripTimezone: 'America/New_York',
    });

    await pdfImportService.acceptPendingEntity(USER_ID, 5, TRIP_ID);

    const data = createdData(mockTx.activity);
    expect(data.allDay).toBe(false);
    expect(data.startTime.toISOString()).toBe('2027-03-13T14:00:00.000Z');
  });

  it('rejects an unparseable date with a 400', async () => {
    setup({
      entityType: 'LODGING',
      parsedData: { name: 'Hotel', checkInDate: 'next Tuesday', checkOutDate: '2027-03-14' },
      tripTimezone: 'America/New_York',
    });

    await expect(pdfImportService.acceptPendingEntity(USER_ID, 5, TRIP_ID)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mockTx.lodging.create).not.toHaveBeenCalled();
  });
});

describe('parseBookingDateTime', () => {
  it('returns null for empty values', () => {
    expect(parseBookingDateTime(undefined, 'UTC', '00:00', 'x')).toBeNull();
    expect(parseBookingDateTime('  ', 'UTC', '00:00', 'x')).toBeNull();
  });

  it('throws AppError for garbage', () => {
    expect(() => parseBookingDateTime('soon', 'UTC', '00:00', 'x')).toThrow(AppError);
  });
});
