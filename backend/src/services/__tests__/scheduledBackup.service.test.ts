/**
 * Scheduled backup retention tests (pure logic, no disk or database).
 */
import { describe, it, expect } from '@jest/globals';

jest.mock('../../config/database', () => ({ __esModule: true, default: {} }));
jest.mock('../backup.service', () => ({ __esModule: true, default: {} }));

import { selectFilesToKeep } from '../scheduledBackup.service';

const name = (d: string) => `travel-life-backup-${d}.json`;

describe('selectFilesToKeep', () => {
  it('keeps the newest N daily files and one per older week', () => {
    const days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 10, 30 - i));
      return name(d.toISOString().slice(0, 10));
    });
    const keep = selectFilesToKeep(days, 7, 4);
    expect(keep.size).toBe(11);
    expect(keep.has(name('2026-11-30'))).toBe(true);
    expect(keep.has(name('2026-11-24'))).toBe(true);
  });

  it('ignores files that do not match the backup naming pattern', () => {
    const keep = selectFilesToKeep(['notes.txt', name('2026-11-01')], 7, 4);
    expect([...keep]).toEqual([name('2026-11-01')]);
  });

  it('keeps everything when under the daily limit', () => {
    const files = [name('2026-11-01'), name('2026-11-02')];
    expect(selectFilesToKeep(files, 7, 4).size).toBe(2);
  });
});
