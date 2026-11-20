import { unlinkSync, mkdirSync, writeFileSync } from 'fs';
import { join, resolve, sep } from 'path';
import { randomUUID } from 'crypto';
import prisma from '../config/database';
import { config } from '../config';
import logger from '../config/logger';
import { AppError } from '../errors/errors';
import { TransportationType, type TransportationTypeEnum } from '../types/transportation.types';
import { LodgingType, type LodgingTypeEnum } from '../types/lodging.types';
import { pdfParserService } from './pdfParser.service';
import { cleanupEntityLinks } from './_shared/entityLinkCleanup';
import type { UpdatePendingEntityInput } from '../types/pdfImport.types';
import {
  PdfImportStatus,
  PendingEntityType,
  PendingEntityStatus,
} from '@prisma/client';

// multer file shape
interface MulterFile {
  originalname: string;
  buffer?: Buffer;
  path?: string;
  size: number;
  mimetype: string;
}

const TRANSPORTATION_TYPE_VALUES = Object.values(TransportationType) as readonly string[];
const LODGING_TYPE_VALUES = Object.values(LodgingType) as readonly string[];

function normalizeTransportationType(raw: unknown): TransportationTypeEnum {
  if (typeof raw === 'string' && TRANSPORTATION_TYPE_VALUES.includes(raw)) {
    return raw as TransportationTypeEnum;
  }
  return TransportationType.OTHER;
}

function normalizeLodgingType(raw: unknown): LodgingTypeEnum {
  if (typeof raw === 'string' && LODGING_TYPE_VALUES.includes(raw)) {
    return raw as LodgingTypeEnum;
  }
  return LodgingType.OTHER;
}

/** Extracts an optional string from parsed LLM data, returning undefined for non-strings. */
function optStr(raw: unknown): string | undefined {
  return typeof raw === 'string' ? raw : undefined;
}

/**
 * Validate that storedPath does not escape the uploads directory.
 * Both sides are resolved to absolute paths so prefix-containment is sound
 * regardless of whether UPLOAD_DIR is configured as a relative or absolute path.
 */
function resolveStoredPath(storedPath: string): string {
  const uploadsDir = resolve(config.upload.dir);
  const absolute = resolve(uploadsDir, storedPath);
  if (absolute !== uploadsDir && !absolute.startsWith(uploadsDir + sep)) {
    throw new AppError('Invalid stored path', 400);
  }
  return absolute;
}

/**
 * Only one PDF is read at a time per LLM server. The LLM may be a self-hosted
 * model on modest hardware (e.g. Ollama on a NAS), where two documents at once
 * would just make both slow or time out.
 *
 * Keyed by endpoint (see llmService.endpointKey), not global: everyone on the
 * instance-wide LLM shares one slot, but a user whose Settings point at their
 * own (possibly slow or unresponsive) server can only ever block themselves.
 *
 * In-process on purpose: the backend runs as a single container, and a slot
 * held by a process that has since died must not block uploads after restart.
 */
export const PDF_PARSE_BUSY_MESSAGE =
  'Another PDF is still being read. Try again when it finishes.';

interface ParsingSlot {
  /** Set once the background parse starts, so Cancel can abort it. */
  active?: { pdfImportId: number; controller: AbortController };
}

const parsingSlots = new Map<string, ParsingSlot>();

function claimParsingSlot(endpoint: string): void {
  // Synchronous check-and-set: no await between them, so two requests cannot both win.
  if (parsingSlots.has(endpoint)) throw new AppError(PDF_PARSE_BUSY_MESSAGE, 409);
  parsingSlots.set(endpoint, {});
}

function releaseParsingSlot(endpoint: string): void {
  parsingSlots.delete(endpoint);
}

/** Test hook: whether a PDF is being read right now (on one endpoint, or any). */
export function isPdfParsingBusy(endpoint?: string): boolean {
  return endpoint === undefined ? parsingSlots.size > 0 : parsingSlots.has(endpoint);
}

/** Resolves the user's LLM endpoint, refusing up front when there is none. */
async function requireLlmEndpoint(userId: number): Promise<string> {
  const endpoint = await pdfParserService.endpointKey(userId);
  if (!endpoint) {
    throw new AppError('LLM not configured — cannot process PDFs. Set LLM_API_KEY to enable.', 503);
  }
  return endpoint;
}

class PdfImportService {
  /**
   * Validates PDF magic bytes (%PDF) and uploads/processes the file.
   * Returns immediately after creating the DB record — processing is async.
   * Refused with 409 while another PDF is being read (see claimParsingSlot).
   */
  async uploadAndProcess(userId: number, file: MulterFile, hintTripId?: number) {
    const endpoint = await requireLlmEndpoint(userId);
    claimParsingSlot(endpoint);
    try {
      return await this.storeAndStartParsing(userId, file, endpoint, hintTripId);
    } catch (err) {
      // Never got as far as the background job, which would release it.
      releaseParsingSlot(endpoint);
      throw err;
    }
  }

  /** Runs the parse and frees the slot whichever way it ends, including a cancel. */
  private launchParsing(
    endpoint: string,
    pdfImportId: number,
    userId: number,
    absolutePath: string,
    filename: string,
    hintTripId?: number
  ): void {
    const controller = new AbortController();
    parsingSlots.set(endpoint, { active: { pdfImportId, controller } });
    this.processInBackground(
      pdfImportId,
      userId,
      absolutePath,
      filename,
      hintTripId,
      controller.signal
    )
      .catch((err) => logger.error('PDF background processing failed', { pdfImportId, err }))
      .finally(() => {
        if (parsingSlots.get(endpoint)?.active?.controller === controller) {
          releaseParsingSlot(endpoint);
        }
      });
  }

  private async storeAndStartParsing(
    userId: number,
    file: MulterFile,
    endpoint: string,
    hintTripId?: number
  ) {
    // Validate PDF magic bytes
    if (!file.buffer) {
      throw new AppError('File buffer is missing', 400);
    }
    const buffer = file.buffer;
    if (!buffer.slice(0, 4).toString('ascii').startsWith('%PDF')) {
      throw new AppError('Uploaded file is not a valid PDF', 400);
    }

    // Ensure upload directory exists
    const pdfDir = join(config.upload.dir, 'pdfs', String(userId));
    mkdirSync(pdfDir, { recursive: true });

    const storedFilename = `${randomUUID()}.pdf`;
    // Use forward slashes explicitly so the value stored in the DB is portable
    // across Windows (dev) and Linux (Docker / prod). resolveStoredPath() uses
    // path.resolve() which normalizes either separator on each platform.
    const storedPath = ['pdfs', String(userId), storedFilename].join('/');
    const absolutePath = join(config.upload.dir, storedPath);

    // Create DB record FIRST so we can clean up on failure
    const pdfImport = await prisma.pdfImport.create({
      data: {
        userId,
        originalName: file.originalname,
        storedPath,
        fileSizeBytes: file.size,
        status: PdfImportStatus.UPLOADED,
      },
    });

    // Write file to disk — if this fails, mark import as PARSE_FAILED
    try {
      writeFileSync(absolutePath, buffer);
    } catch (err) {
      await prisma.pdfImport.update({
        where: { id: pdfImport.id },
        data: {
          status: PdfImportStatus.PARSE_FAILED,
          errorMessage: 'Failed to save uploaded file',
        },
      });
      throw new AppError('Failed to save uploaded file', 500);
    }

    // Atomically transition to PARSING (guard against concurrent calls)
    const updated = await prisma.pdfImport.updateMany({
      where: { id: pdfImport.id, status: PdfImportStatus.UPLOADED },
      data: { status: PdfImportStatus.PARSING },
    });
    if (updated.count === 0) {
      throw new AppError('Import already in progress', 409);
    }

    // Fire background processing (don't await)
    this.launchParsing(endpoint, pdfImport.id, userId, absolutePath, file.originalname, hintTripId);

    return pdfImport;
  }

  /**
   * Background processing: extract text, call LLM, create PendingEntity records.
   */
  private async processInBackground(
    pdfImportId: number,
    userId: number,
    absolutePath: string,
    filename: string,
    hintTripId?: number,
    signal?: AbortSignal
  ): Promise<void> {
    try {
      const text = await pdfParserService.extractText(absolutePath);
      if (signal?.aborted) return;
      const { entities } = await pdfParserService.parseDocument(text, filename, userId, signal);
      // Cancelled while the model was answering: the import row is being deleted.
      if (signal?.aborted) return;

      if (entities.length === 0) {
        await prisma.pdfImport.update({
          where: { id: pdfImportId },
          data: { status: PdfImportStatus.NO_ENTITIES, processedAt: new Date() },
        });
        return;
      }

      // Match trip for each entity or use hint. Use allSettled so a single
      // DB write failure does not lose every parsed entity — partial success
      // is preferred over throwing away all of the LLM's work.
      const results = await Promise.allSettled(
        entities.map(async (entity) => {
          const matchedTripId = hintTripId ?? await this.matchTrip(userId, entity.data);
          return prisma.pendingEntity.create({
            data: {
              pdfImportId,
              userId,
              entityType: entity.type as PendingEntityType,
              parsedData: entity.data as Record<string, unknown>,
              confidence: entity.confidence,
              matchedTripId: matchedTripId ?? null,
            },
          });
        })
      );

      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected'
      );

      // Log every failure individually so they show up in alerts/logs.
      for (const failure of rejected) {
        logger.warn('PDF pendingEntity creation failed (partial)', {
          pdfImportId,
          err: failure.reason,
        });
      }

      if (succeeded === 0) {
        // Every entity failed — mark the whole import as failed.
        const firstErr = rejected[0]?.reason;
        await prisma.pdfImport.update({
          where: { id: pdfImportId },
          data: {
            status: PdfImportStatus.PARSE_FAILED,
            errorMessage: firstErr instanceof Error
              ? `All ${entities.length} parsed entities failed to save: ${firstErr.message}`
              : `All ${entities.length} parsed entities failed to save`,
            processedAt: new Date(),
          },
        });
        return;
      }

      // At least one entity made it. Mark as PARSED and surface the partial
      // failure count via errorMessage so the UI can show a warning.
      const partialFailureMessage =
        rejected.length > 0
          ? `${succeeded} of ${entities.length} entities saved; ${rejected.length} failed (see server logs)`
          : null;

      await prisma.pdfImport.update({
        where: { id: pdfImportId },
        data: {
          status: PdfImportStatus.PARSED,
          processedAt: new Date(),
          errorMessage: partialFailureMessage,
        },
      });
    } catch (err) {
      if (signal?.aborted) {
        logger.info('PDF processing cancelled', { pdfImportId });
        return;
      }
      logger.error('PDF processing failed', { pdfImportId, err });
      await prisma.pdfImport.update({
        where: { id: pdfImportId },
        data: {
          status: PdfImportStatus.PARSE_FAILED,
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
          processedAt: new Date(),
        },
      });
    }
  }

  /**
   * Match a trip by date overlap from entity data dates.
   * Returns the most recently started trip that overlaps the entity dates.
   */
  private async matchTrip(userId: number, entityData: Record<string, unknown>): Promise<number | null> {
    const dateFields = ['checkInDate', 'checkOutDate', 'departureTime', 'arrivalTime', 'startTime', 'endTime', 'visitDate'];
    const dates: Date[] = [];
    for (const field of dateFields) {
      const val = entityData[field];
      if (typeof val === 'string') {
        const d = new Date(val);
        if (!isNaN(d.getTime())) dates.push(d);
      }
    }
    if (dates.length === 0) return null;

    const earliest = new Date(Math.min(...dates.map((d) => d.getTime())));
    const latest = new Date(Math.max(...dates.map((d) => d.getTime())));

    const trip = await prisma.trip.findFirst({
      where: {
        userId,
        startDate: { lte: latest },
        endDate: { gte: earliest },
      },
      orderBy: { startDate: 'desc' },
      select: { id: true },
    });
    return trip?.id ?? null;
  }

  async getPdfImports(userId: number, status?: string, limit = 20, offset = 0) {
    return prisma.pdfImport.findMany({
      where: { userId, ...(status ? { status: status as PdfImportStatus } : {}) },
      include: { _count: { select: { pendingEntities: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  async getPdfImportById(userId: number, id: number) {
    const record = await prisma.pdfImport.findFirst({
      where: { id, userId },
      include: { _count: { select: { pendingEntities: true } } },
    });
    if (!record) throw new AppError('PDF import not found', 404);
    return record;
  }

  async getPendingEntities(userId: number, opts: { pdfImportId?: number; status?: string; entityType?: string }) {
    return prisma.pendingEntity.findMany({
      where: {
        userId,
        ...(opts.pdfImportId !== undefined ? { pdfImportId: opts.pdfImportId } : {}),
        ...(opts.status ? { status: opts.status as PendingEntityStatus } : {}),
        ...(opts.entityType ? { entityType: opts.entityType as PendingEntityType } : {}),
      },
      include: { matchedTrip: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getPendingCount(userId: number): Promise<number> {
    return prisma.pendingEntity.count({
      where: { userId, status: PendingEntityStatus.PENDING },
    });
  }

  async updatePendingEntity(userId: number, id: number, input: UpdatePendingEntityInput) {
    const entity = await prisma.pendingEntity.findFirst({ where: { id, userId } });
    if (!entity) throw new AppError('Pending entity not found', 404);
    if (entity.status !== PendingEntityStatus.PENDING) throw new AppError('Entity has already been reviewed', 400);

    return prisma.pendingEntity.update({
      where: { id },
      data: {
        ...(input.parsedData !== undefined ? { parsedData: input.parsedData as Record<string, unknown> } : {}),
        ...(input.matchedTripId !== undefined ? { matchedTripId: input.matchedTripId } : {}),
      },
    });
  }

  /**
   * Accept a pending entity: create the actual trip entity + EntityLink back
   * to PDF, recording the result on the pending entity row.
   *
   * The whole happy path runs inside `prisma.$transaction`, so if anything
   * after the atomic claim throws, the claim itself is rolled back along with
   * any partial entity / link writes. The legacy manual-rollback block is
   * gone — Prisma handles it via abort.
   *
   * We inline the Prisma `.create()` calls for each entity type because the
   * domain services (transportationService.createTransportation, etc.) take
   * the global prisma client and have no transactional variant. Inlining
   * costs us a few side-effects from those services (e.g. async route
   * distance calculation for transportation, decimal conversion in the
   * response) — that's an accepted trade-off for correctness here.
   */
  async acceptPendingEntity(
    userId: number,
    id: number,
    tripId: number,
    overrides?: Record<string, unknown>
  ) {
    // Verify user owns the trip BEFORE entering the transaction. We don't
    // want to claim the pending entity only to roll back because of an auth
    // failure that we could have detected up front.
    const trip = await prisma.trip.findFirst({ where: { id: tripId, userId } });
    if (!trip) {
      throw new AppError('Trip not found or access denied', 404);
    }

    return prisma.$transaction(async (tx) => {
      // Atomically claim the entity — only succeeds if it's still PENDING.
      // This is the first statement in the transaction; if any later step
      // throws, the claim is rolled back automatically.
      const claimed = await tx.pendingEntity.updateMany({
        where: { id, userId, status: PendingEntityStatus.PENDING },
        data: { status: PendingEntityStatus.ACCEPTED, reviewedAt: new Date() },
      });
      if (claimed.count === 0) {
        const existing = await tx.pendingEntity.findFirst({ where: { id, userId } });
        if (!existing) throw new AppError('Pending entity not found', 404);
        throw new AppError('Entity has already been reviewed', 400);
      }

      const entity = await tx.pendingEntity.findFirst({
        where: { id, userId },
      });
      if (!entity) throw new AppError('Pending entity not found', 404);

      const data = { ...(entity.parsedData as Record<string, unknown>), ...overrides };
      let createdEntityId: number;
      const createdEntityType = entity.entityType;

      switch (entity.entityType) {
        case PendingEntityType.TRANSPORTATION: {
          const created = await tx.transportation.create({
            data: {
              tripId,
              type: normalizeTransportationType(data.type),
              startLocationText: optStr(data.fromLocationName) ?? null,
              endLocationText: optStr(data.toLocationName) ?? null,
              scheduledStart: optStr(data.departureTime) ? new Date(optStr(data.departureTime)!) : null,
              scheduledEnd: optStr(data.arrivalTime) ? new Date(optStr(data.arrivalTime)!) : null,
              company: optStr(data.carrier) ?? null,
              referenceNumber: optStr(data.vehicleNumber) ?? null,
              bookingReference: optStr(data.confirmationNumber) ?? null,
              notes: optStr(data.notes) ?? null,
            },
            select: { id: true },
          });
          createdEntityId = created.id;
          break;
        }
        case PendingEntityType.LODGING: {
          if (typeof data.checkInDate !== 'string' || typeof data.checkOutDate !== 'string') {
            throw new AppError('Lodging requires checkInDate and checkOutDate', 400);
          }
          const created = await tx.lodging.create({
            data: {
              tripId,
              type: normalizeLodgingType(data.type),
              name: typeof data.name === 'string' ? data.name : 'Unnamed Lodging',
              address: optStr(data.address) ?? null,
              checkInDate: new Date(data.checkInDate),
              checkOutDate: new Date(data.checkOutDate),
              confirmationNumber: optStr(data.confirmationNumber) ?? null,
              notes: optStr(data.notes) ?? null,
            },
            select: { id: true },
          });
          createdEntityId = created.id;
          break;
        }
        case PendingEntityType.ACTIVITY: {
          if (typeof data.name !== 'string') {
            throw new AppError('Activity requires a name', 400);
          }
          const created = await tx.activity.create({
            data: {
              tripId,
              name: data.name,
              description: optStr(data.description) ?? null,
              startTime: optStr(data.startTime) ? new Date(optStr(data.startTime)!) : null,
              endTime: optStr(data.endTime) ? new Date(optStr(data.endTime)!) : null,
              bookingReference: optStr(data.bookingReference) ?? null,
              notes: optStr(data.notes) ?? null,
            },
            select: { id: true },
          });
          createdEntityId = created.id;
          break;
        }
        case PendingEntityType.LOCATION: {
          if (typeof data.name !== 'string') {
            throw new AppError('Location requires a name', 400);
          }
          const created = await tx.location.create({
            data: {
              tripId,
              name: data.name,
              address: optStr(data.address) ?? null,
            },
            select: { id: true },
          });
          createdEntityId = created.id;
          break;
        }
        default:
          throw new AppError('Unknown entity type', 400);
      }

      // Create EntityLink back to the source PdfImport row.
      await tx.entityLink.create({
        data: {
          tripId,
          sourceType: 'PDF_IMPORT',
          sourceId: entity.pdfImportId,
          targetType: entity.entityType,
          targetId: createdEntityId,
          relationship: 'RELATED',
        },
      });

      // Record the created entity on the pending entity row.
      await tx.pendingEntity.update({
        where: { id },
        data: { createdEntityId, createdEntityType },
      });

      return { createdEntityId, createdEntityType };
    });
  }

  async rejectPendingEntity(userId: number, id: number) {
    const claimed = await prisma.pendingEntity.updateMany({
      where: { id, userId, status: PendingEntityStatus.PENDING },
      data: { status: PendingEntityStatus.REJECTED, reviewedAt: new Date() },
    });
    if (claimed.count === 0) {
      const entity = await prisma.pendingEntity.findFirst({ where: { id, userId } });
      if (!entity) throw new AppError('Pending entity not found', 404);
      throw new AppError('Entity has already been reviewed', 400);
    }
    return prisma.pendingEntity.findFirst({ where: { id } });
  }

  async reparseImport(userId: number, id: number) {
    const record = await prisma.pdfImport.findFirst({ where: { id, userId } });
    if (!record) throw new AppError('PDF import not found', 404);
    if (record.status === PdfImportStatus.PARSING) {
      throw new AppError('Import is currently being parsed', 409);
    }

    const endpoint = await requireLlmEndpoint(userId);
    claimParsingSlot(endpoint);
    try {
      const absolutePath = resolveStoredPath(record.storedPath);

      // Delete existing PENDING entities (keep ACCEPTED/REJECTED)
      await prisma.pendingEntity.deleteMany({
        where: { pdfImportId: id, status: PendingEntityStatus.PENDING },
      });

      // Transition back to PARSING
      await prisma.pdfImport.update({
        where: { id },
        data: { status: PdfImportStatus.PARSING, errorMessage: null, processedAt: null },
      });

      this.launchParsing(endpoint, id, userId, absolutePath, record.originalName);
    } catch (err) {
      releaseParsingSlot(endpoint);
      throw err;
    }
  }

  /**
   * Deletes an import. If it is still being read, the LLM request is aborted
   * first (which also stops a local model such as Ollama generating), freeing
   * the parsing slot for the next PDF. This is what "Cancel" calls.
   */
  async deletePdfImport(userId: number, id: number) {
    const record = await prisma.pdfImport.findFirst({ where: { id, userId } });
    if (!record) throw new AppError('PDF import not found', 404);

    for (const slot of parsingSlots.values()) {
      if (slot.active?.pdfImportId === id) {
        logger.info('Cancelling PDF parse in progress', { pdfImportId: id });
        slot.active.controller.abort();
      }
    }

    const absolutePath = resolveStoredPath(record.storedPath);
    try {
      unlinkSync(absolutePath);
    } catch (err) {
      logger.warn('Could not delete PDF file from disk', { path: absolutePath, err });
    }

    // EntityLink has no FK to pdf_imports (sourceId/targetId are plain Ints), so
    // the database cannot cascade. Accepting a pending entity creates a
    // PDF_IMPORT link (see acceptPendingEntity), and one import can have entities
    // accepted into several trips — clean up every trip that references it, in the
    // same transaction as the row delete so the two cannot diverge.
    const linkedTrips = await prisma.entityLink.findMany({
      where: {
        OR: [
          { sourceType: 'PDF_IMPORT', sourceId: id },
          { targetType: 'PDF_IMPORT', targetId: id },
        ],
      },
      distinct: ['tripId'],
      select: { tripId: true },
    });

    await prisma.$transaction(async (tx) => {
      for (const { tripId } of linkedTrips) {
        await cleanupEntityLinks(tripId, 'PDF_IMPORT', id, tx);
      }
      await tx.pdfImport.delete({ where: { id } });
    });
  }

  /**
   * Reset imports stuck in PARSING for more than 10 minutes.
   * Awaited on startup before the server listens, and re-run hourly by the
   * cron scheduler (config/cron.ts) so a job that hangs while the process stays
   * up is not stuck until the next restart.
   */
  async resetStaleParsing(): Promise<void> {
    // Never reset a job that may still be waiting on the LLM: allow at least
    // twice the LLM timeout, and no less than ten minutes.
    const staleAfterMs = Math.max(10 * 60 * 1000, 2 * config.llm.timeoutMs);
    const cutoff = new Date(Date.now() - staleAfterMs);
    const stale = await prisma.pdfImport.findMany({
      where: {
        status: PdfImportStatus.PARSING,
        updatedAt: { lt: cutoff },
      },
      select: { id: true },
    });

    for (const record of stale) {
      logger.warn('Resetting stale PDF import stuck in PARSING', { pdfImportId: record.id });
    }

    if (stale.length > 0) {
      await prisma.pdfImport.updateMany({
        where: {
          id: { in: stale.map((r) => r.id) },
          status: PdfImportStatus.PARSING,
        },
        data: {
          status: PdfImportStatus.PARSE_FAILED,
          errorMessage: 'Processing timed out and was reset',
        },
      });
    }
  }
}

export const pdfImportService = new PdfImportService();
