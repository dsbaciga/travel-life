/**
 * PdfParseQueue unit tests (no database, no LLM)
 *
 * Test cases:
 * - PPQ-001: One job at a time per machine key; other keys run in parallel
 * - PPQ-002: Jobs on one key run in arrival order, and position() counts the line
 * - PPQ-003: reserveUser allows one place per user and refuses a second with 409
 * - PPQ-004: A failing job still frees the machine and the user's place
 * - PPQ-005: cancel() aborts a running job, removes a waiting one, and is false for unknown ids
 * - PPQ-006: A released reservation (upload failed before queueing) frees the place
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { PdfParseQueue, PDF_USER_BUSY_MESSAGE, type ParseJob } from '../pdfParseQueue';

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
};

/** A job that runs until finished or aborted; records when it started. */
function heldJob(pdfImportId: number, userId: number, key = 'ollama.lan') {
  const state = { started: false, signal: undefined as AbortSignal | undefined, finish: () => {}, fail: () => {} };
  const job: ParseJob = {
    pdfImportId,
    userId,
    key,
    run: (signal) =>
      new Promise<void>((resolve, reject) => {
        state.started = true;
        state.signal = signal;
        state.finish = resolve;
        state.fail = () => reject(new Error('model crashed'));
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      }),
  };
  return { job, state };
}

let queue: PdfParseQueue;

beforeEach(() => {
  queue = new PdfParseQueue();
});

describe('PdfParseQueue', () => {
  it('PPQ-001: one job per machine; different machines run side by side', async () => {
    const a = heldJob(1, 1);
    const b = heldJob(2, 2);
    const c = heldJob(3, 3, 'my-own-llm.example');
    queue.enqueue(a.job);
    queue.enqueue(b.job);
    queue.enqueue(c.job);
    await flush();

    expect(a.state.started).toBe(true);
    expect(b.state.started).toBe(false);
    expect(c.state.started).toBe(true);
    expect(queue.isBusy('ollama.lan')).toBe(true);
    expect(queue.isBusy('my-own-llm.example')).toBe(true);

    a.state.finish();
    await flush();
    expect(b.state.started).toBe(true);
  });

  it('PPQ-002: arrival order, and position() counts what is ahead', async () => {
    const jobs = [heldJob(1, 1), heldJob(2, 2), heldJob(3, 3)];
    jobs.forEach(({ job }) => queue.enqueue(job));
    await flush();

    expect([1, 2, 3].map((id) => queue.position(id))).toEqual([0, 1, 2]);
    expect(queue.position(404)).toBeNull();

    jobs[0].state.finish();
    await flush();
    expect([1, 2, 3].map((id) => queue.position(id))).toEqual([null, 0, 1]);
  });

  it('PPQ-003: one place per user', async () => {
    queue.reserveUser(7);
    expect(() => queue.reserveUser(7)).toThrow(PDF_USER_BUSY_MESSAGE);
    expect(() => queue.reserveUser(8)).not.toThrow();

    const job = heldJob(1, 7);
    queue.enqueue(job.job);
    await flush();
    expect(queue.hasUser(7)).toBe(true);

    job.state.finish();
    await flush();
    expect(queue.hasUser(7)).toBe(false);
  });

  it('PPQ-004: a job that throws still frees the machine and the user', async () => {
    const broken = heldJob(1, 1);
    const next = heldJob(2, 2);
    queue.enqueue(broken.job);
    queue.enqueue(next.job);
    await flush();

    broken.state.fail();
    await flush();
    expect(queue.hasUser(1)).toBe(false);
    expect(next.state.started).toBe(true);
  });

  it('PPQ-005: cancel aborts running, removes waiting, ignores unknown', async () => {
    const running = heldJob(1, 1);
    const waiting = heldJob(2, 2);
    const last = heldJob(3, 3);
    [running, waiting, last].forEach(({ job }) => queue.enqueue(job));
    await flush();

    expect(queue.cancel(2)).toBe(true);
    expect(queue.hasUser(2)).toBe(false);
    expect(queue.position(3)).toBe(1);

    expect(queue.cancel(1)).toBe(true);
    await flush();
    expect(running.state.signal?.aborted).toBe(true);
    expect(waiting.state.started).toBe(false);
    expect(last.state.started).toBe(true);

    expect(queue.cancel(404)).toBe(false);
  });

  it('PPQ-006: releasing a reservation that never became a job frees the place', () => {
    queue.reserveUser(5);
    queue.releaseUser(5);
    expect(() => queue.reserveUser(5)).not.toThrow();
  });
});
