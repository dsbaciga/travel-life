export type PdfImportStatus = 'UPLOADED' | 'PARSING' | 'PARSED' | 'PARSE_FAILED' | 'NO_ENTITIES';
export type PendingEntityType = 'TRANSPORTATION' | 'LODGING' | 'ACTIVITY' | 'LOCATION';
export type PendingEntityStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface PdfImport {
  id: number;
  userId: number;
  originalName: string;
  storedPath: string;
  fileSizeBytes: number;
  status: PdfImportStatus;
  errorMessage: string | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { pendingEntities: number };
  /** 0 while being read, n = PDFs ahead of it in line, null/absent = not queued. */
  queuePosition?: number | null;
}

export interface PendingEntity {
  id: number;
  pdfImportId: number | null;
  userId: number;
  entityType: PendingEntityType;
  parsedData: Record<string, unknown>;
  confidence: number;
  matchedTripId: number | null;
  status: PendingEntityStatus;
  createdEntityId: number | null;
  createdEntityType: PendingEntityType | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  matchedTrip?: { id: number; title: string } | null;
}
