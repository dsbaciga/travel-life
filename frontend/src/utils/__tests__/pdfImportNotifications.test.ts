import { describe, it, expect } from 'vitest';
import {
  createdEntityPath,
  describeFinishedImport,
  pdfImportReviewPath,
} from '../pdfImportNotifications';
import { PDF_IMPORT_GIVE_UP_MS, isPdfImportFinished, pdfImportPollDelayMs } from '../pdfImportPolling';

const base = { id: 7, errorMessage: null, _count: { pendingEntities: 2 } };

describe('describeFinishedImport', () => {
  it('offers a Review link with the booking count when parsed', () => {
    const content = describeFinishedImport('hotel.pdf', { ...base, status: 'PARSED' });
    expect(content.tone).toBe('success');
    expect(content.title).toBe('hotel.pdf is ready');
    expect(content.body).toBe('Found 2 bookings to review.');
    expect(content.action).toEqual({ label: 'Review', to: '/saved-links?reviewImport=7' });
  });

  it('uses the singular for one booking', () => {
    const content = describeFinishedImport('a.pdf', {
      ...base,
      status: 'PARSED',
      _count: { pendingEntities: 1 },
    });
    expect(content.body).toBe('Found 1 booking to review.');
  });

  it('shows the server error and a Details link when parsing failed', () => {
    const content = describeFinishedImport('a.pdf', {
      ...base,
      status: 'PARSE_FAILED',
      errorMessage: 'LLM request failed: timeout of 300000ms exceeded',
    });
    expect(content.tone).toBe('error');
    expect(content.body).toContain('timeout of 300000ms');
    expect(content.action).toMatchObject({ to: '/saved-links?reviewImport=7' });
  });

  it('has no action when nothing was found', () => {
    const content = describeFinishedImport('a.pdf', { ...base, status: 'NO_ENTITIES' });
    expect(content.tone).toBe('neutral');
    expect(content.action).toBeUndefined();
  });

  it('points at the Inbox when polling gave up', () => {
    const content = describeFinishedImport('a.pdf', null);
    expect(content.title).toBe('Still working on a.pdf');
    expect(content.action).toMatchObject({ to: '/saved-links' });
  });
});

describe('deep links', () => {
  it('builds the inbox review path', () => {
    expect(pdfImportReviewPath(12)).toBe('/saved-links?reviewImport=12');
  });

  it('opens the right trip tab and highlights the created entity', () => {
    expect(createdEntityPath(39, 'LODGING', 5)).toBe('/trips/39?tab=lodging#lodging-5');
    expect(createdEntityPath(39, 'TRANSPORTATION', 8)).toBe(
      '/trips/39?tab=transportation#transportation-8'
    );
  });
});

describe('polling schedule', () => {
  it('polls every 2s for the first 20s, then every 5s', () => {
    expect(pdfImportPollDelayMs(0)).toBe(2000);
    expect(pdfImportPollDelayMs(19_999)).toBe(2000);
    expect(pdfImportPollDelayMs(20_000)).toBe(5000);
  });

  it('keeps polling past the 5-minute LLM timeout', () => {
    expect(PDF_IMPORT_GIVE_UP_MS).toBeGreaterThan(5 * 60 * 1000);
  });

  it('treats only parsed, failed and empty as finished', () => {
    expect(isPdfImportFinished('PARSED')).toBe(true);
    expect(isPdfImportFinished('PARSE_FAILED')).toBe(true);
    expect(isPdfImportFinished('NO_ENTITIES')).toBe(true);
    expect(isPdfImportFinished('PARSING')).toBe(false);
    expect(isPdfImportFinished(undefined)).toBe(false);
  });
});
