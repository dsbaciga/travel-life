/**
 * Travel-day document vault (#110): files copied into the app's private
 * document directory so boarding passes and confirmations open with no signal.
 */
import { Directory, File, Paths } from 'expo-file-system';
import type { SqlDriver } from '../db/driver';

export const VAULT_DOC_TYPES = ['boarding_pass', 'lodging', 'visa', 'passport', 'ticket', 'insurance', 'other'] as const;
export type VaultDocType = (typeof VAULT_DOC_TYPES)[number];

export const VAULT_DOC_LABELS: Readonly<Record<VaultDocType, string>> = {
  boarding_pass: 'Boarding pass',
  lodging: 'Lodging confirmation',
  visa: 'Visa',
  passport: 'Passport',
  ticket: 'Ticket',
  insurance: 'Insurance',
  other: 'Other',
};

export interface VaultDocument {
  id: string;
  tripId: number | null;
  title: string;
  docType: VaultDocType;
  localUri: string;
  mimeType: string | null;
  neededAt: string | null;
  createdAt: string;
}

interface VaultRow {
  id: string;
  trip_id: number | null;
  title: string;
  doc_type: string;
  local_uri: string;
  mime_type: string | null;
  needed_at: string | null;
  created_at: string;
}

const toDocument = (row: VaultRow): VaultDocument => ({
  id: row.id,
  tripId: row.trip_id,
  title: row.title,
  docType: (VAULT_DOC_TYPES as readonly string[]).includes(row.doc_type)
    ? (row.doc_type as VaultDocType)
    : 'other',
  localUri: row.local_uri,
  mimeType: row.mime_type,
  neededAt: row.needed_at,
  createdAt: row.created_at,
});

/**
 * Order documents by what is needed next: upcoming `neededAt` soonest first,
 * then undated ones, then anything whose moment has passed.
 */
export function sortByNeededNext<T extends { neededAt: string | null }>(
  documents: readonly T[],
  now: Date = new Date()
): T[] {
  const nowMs = now.getTime();
  const rank = (doc: T): [number, number] => {
    if (!doc.neededAt) return [1, 0];
    const at = new Date(doc.neededAt).getTime();
    // A boarding pass stays "current" for a few hours after departure.
    return at >= nowMs - 3 * 3600000 ? [0, at] : [2, -at];
  };
  return documents.slice().sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    return ra[0] - rb[0] || ra[1] - rb[1];
  });
}

export async function listVaultDocuments(db: SqlDriver, tripId: number | null): Promise<VaultDocument[]> {
  const rows = await db.all<VaultRow>(
    'SELECT * FROM vault_documents WHERE trip_id IS ? OR trip_id IS NULL',
    [tripId]
  );
  return sortByNeededNext(rows.map(toDocument));
}

/** Copy a picked file into private storage and record it. */
export async function addVaultDocument(
  db: SqlDriver,
  input: {
    id: string;
    tripId: number | null;
    title: string;
    docType: VaultDocType;
    sourceUri: string;
    fileName: string;
    mimeType: string | null;
    neededAt: string | null;
  }
): Promise<void> {
  const directory = new Directory(Paths.document, 'vault');
  if (!directory.exists) directory.create({ intermediates: true });
  // The id prefix keeps two "boarding-pass.pdf" files from colliding.
  const safeName = input.fileName.replace(/[^\w.-]+/g, '_').slice(-80);
  const destination = new File(directory, `${input.id}-${safeName}`);
  new File(input.sourceUri).copy(destination);

  await db.run(
    `INSERT INTO vault_documents (id, trip_id, title, doc_type, local_uri, mime_type, needed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.tripId,
      input.title,
      input.docType,
      destination.uri,
      input.mimeType,
      input.neededAt,
      new Date().toISOString(),
    ]
  );
}

export async function removeVaultDocument(db: SqlDriver, document: VaultDocument): Promise<void> {
  try {
    const file = new File(document.localUri);
    if (file.exists) file.delete();
  } catch {
    // The row is removed regardless; an orphaned file is harmless.
  }
  await db.run('DELETE FROM vault_documents WHERE id = ?', [document.id]);
}
