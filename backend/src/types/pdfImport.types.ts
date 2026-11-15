import { z } from 'zod';

export const PdfImportStatusEnum = z.enum(['UPLOADED', 'PARSING', 'PARSED', 'PARSE_FAILED', 'NO_ENTITIES']);
export type PdfImportStatus = z.infer<typeof PdfImportStatusEnum>;

export const PendingEntityTypeEnum = z.enum(['TRANSPORTATION', 'LODGING', 'ACTIVITY', 'LOCATION']);
export type PendingEntityType = z.infer<typeof PendingEntityTypeEnum>;

export const PendingEntityStatusEnum = z.enum(['PENDING', 'ACCEPTED', 'REJECTED']);
export type PendingEntityStatus = z.infer<typeof PendingEntityStatusEnum>;

export const acceptPendingEntitySchema = z.object({
  tripId: z.number().int().positive(),
  overrides: z.record(z.string(), z.unknown()).optional(),
});
export type AcceptPendingEntityInput = z.infer<typeof acceptPendingEntitySchema>;

export const updatePendingEntitySchema = z.object({
  parsedData: z.record(z.string(), z.unknown()).optional(),
  matchedTripId: z.number().int().positive().nullable().optional(),
});
export type UpdatePendingEntityInput = z.infer<typeof updatePendingEntitySchema>;

export const listPdfImportsQuerySchema = z.object({
  status: PdfImportStatusEnum.optional(),
  limit: z.coerce.number().int().positive().default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const listPendingEntitiesQuerySchema = z.object({
  pdfImportId: z.coerce.number().int().positive().optional(),
  status: PendingEntityStatusEnum.optional(),
  entityType: PendingEntityTypeEnum.optional(),
});
