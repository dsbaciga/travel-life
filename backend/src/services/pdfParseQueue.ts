import logger from '../config/logger';
import { AppError } from '../errors/errors';

/**
 * Fair queue for reading PDFs with an LLM.
 *
 * - One PDF is read at a time per LLM machine (`key`, see llmEndpointKey). The
 *   LLM may be a self-hosted model on modest hardware (e.g. Ollama on a NAS),
 *   where two documents at once just make both slow or time out.
 * - Each user has at most one PDF waiting or being read. With one entry per
 *   user, first-in-first-out is already round-robin: nobody gets a second turn
 *   until everyone else waiting has had theirs, so no user can hold a machine
 *   for long however they upload (or whatever endpoint they point at).
 *
 * In-process on purpose: the backend runs as a single container. Entries are
 * lost on restart, so pdfImportService.requeueAfterRestart() rebuilds the queue
 * from the database at startup.
 */

export const PDF_USER_BUSY_MESSAGE =
  'You already have a PDF waiting or being read. Wait for it to finish, or cancel it.';

export interface ParseJob {
  pdfImportId: number;
  userId: number;
  /** The LLM machine this job runs on; jobs with the same key take turns. */
  key: string;
  /** Does the work. Must stop promptly when the signal aborts (Cancel). */
  run: (signal: AbortSignal) => Promise<void>;
}

interface RunningJob {
  job: ParseJob;
  controller: AbortController;
}

export class PdfParseQueue {
  private readonly waiting = new Map<string, ParseJob[]>();
  private readonly running = new Map<string, RunningJob>();
  /** Users with a job reserved, waiting or running (at most one each). */
  private readonly users = new Set<number>();

  /**
   * Holds the user's one place before any slow work (storing the upload), so
   * two quick uploads cannot both get in. Synchronous check-and-set: no await
   * between them. Throws 409 if the user already has a PDF in the queue.
   */
  reserveUser(userId: number): void {
    if (this.users.has(userId)) throw new AppError(PDF_USER_BUSY_MESSAGE, 409);
    this.users.add(userId);
  }

  /** Gives back a reservation that never became a job (e.g. the upload failed). */
  releaseUser(userId: number): void {
    this.users.delete(userId);
  }

  hasUser(userId: number): boolean {
    return this.users.has(userId);
  }

  /** Adds a job for a user who holds a reservation; starts it if its machine is idle. */
  enqueue(job: ParseJob): void {
    this.users.add(job.userId);
    if (!this.running.has(job.key)) {
      this.start(job);
      return;
    }
    const line = this.waiting.get(job.key) ?? [];
    line.push(job);
    this.waiting.set(job.key, line);
  }

  /**
   * Removes an import from the queue: aborts it if it is being read, drops it
   * from the line if it is waiting. Returns whether it was in the queue.
   */
  cancel(pdfImportId: number): boolean {
    for (const { job, controller } of this.running.values()) {
      if (job.pdfImportId === pdfImportId) {
        // finally() in start() frees the machine and the user's place.
        controller.abort();
        return true;
      }
    }
    for (const [key, line] of this.waiting) {
      const index = line.findIndex((job) => job.pdfImportId === pdfImportId);
      if (index === -1) continue;
      const [job] = line.splice(index, 1);
      if (line.length === 0) this.waiting.delete(key);
      this.users.delete(job.userId);
      return true;
    }
    return false;
  }

  /**
   * How many PDFs are ahead of this one on its machine: 0 while it is being
   * read, 1 for first in line, and so on. Null when it is not in the queue.
   */
  position(pdfImportId: number): number | null {
    for (const { job } of this.running.values()) {
      if (job.pdfImportId === pdfImportId) return 0;
    }
    for (const line of this.waiting.values()) {
      const index = line.findIndex((job) => job.pdfImportId === pdfImportId);
      if (index !== -1) return index + 1;
    }
    return null;
  }

  /** Whether a PDF is being read (on one machine, or on any). */
  isBusy(key?: string): boolean {
    return key === undefined ? this.running.size > 0 : this.running.has(key);
  }

  /** Test hook: drop everything (does not abort running work). */
  reset(): void {
    this.waiting.clear();
    this.running.clear();
    this.users.clear();
  }

  private start(job: ParseJob): void {
    const controller = new AbortController();
    this.running.set(job.key, { job, controller });
    // Run on a later tick so enqueue() never re-enters itself through a job
    // that finishes synchronously.
    Promise.resolve()
      .then(() => job.run(controller.signal))
      .catch((err) =>
        logger.error('PDF parse job failed', { pdfImportId: job.pdfImportId, err })
      )
      .finally(() => {
        if (this.running.get(job.key)?.controller === controller) {
          this.running.delete(job.key);
        }
        this.users.delete(job.userId);
        this.startNext(job.key);
      });
  }

  private startNext(key: string): void {
    if (this.running.has(key)) return;
    const line = this.waiting.get(key);
    const next = line?.shift();
    if (line && line.length === 0) this.waiting.delete(key);
    if (next) this.start(next);
  }
}

export const pdfParseQueue = new PdfParseQueue();
