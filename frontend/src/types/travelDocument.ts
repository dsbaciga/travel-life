import type { IconName } from '../components/ui/Icon';

// Document types matching backend enum
export const DOCUMENT_TYPES = [
  'PASSPORT',
  'VISA',
  'ID_CARD',
  'GLOBAL_ENTRY',
  'VACCINATION',
] as const;

export type DocumentType = typeof DOCUMENT_TYPES[number];

// Human-readable document type labels
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  PASSPORT: 'Passport',
  VISA: 'Visa',
  ID_CARD: 'ID Card',
  GLOBAL_ENTRY: 'Global Entry',
  VACCINATION: 'Vaccination Record',
};

// Expiration status types
export type ExpirationStatus = 'expired' | 'critical' | 'warning' | 'caution' | 'valid';

// Main travel document response type
export interface TravelDocument {
  id: number;
  userId: number;
  type: DocumentType;
  issuingCountry: string;
  documentNumber: string | null; // Always masked (e.g., "***1234")
  issueDate: string | null;
  expiryDate: string | null;
  name: string;
  notes: string | null;
  isPrimary: boolean;
  alertDaysBefore: number;
  createdAt: string;
  updatedAt: string;
  // Computed fields from backend
  expirationStatus?: ExpirationStatus;
  daysUntilExpiry?: number | null;
}

// Create input type
export interface CreateTravelDocumentInput {
  type: DocumentType;
  issuingCountry: string;
  documentNumber?: string;
  issueDate?: string;
  expiryDate?: string;
  name: string;
  notes?: string;
  isPrimary?: boolean;
  alertDaysBefore?: number;
}

// Update input type
export interface UpdateTravelDocumentInput {
  type?: DocumentType;
  // issuingCountry / name / alertDaysBefore reject null with a 400 backend-side —
  // omit them to leave them unchanged.
  issuingCountry?: string;
  documentNumber?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  name?: string;
  notes?: string | null;
  isPrimary?: boolean;
  alertDaysBefore?: number;
}

// Document validity issue for trip check
export interface DocumentValidityIssue {
  documentId: number;
  documentType: DocumentType;
  documentName: string;
  issue: 'expired' | 'expires_during_trip' | 'expires_soon' | 'no_expiry_date';
  expiryDate: string | null;
  daysUntilExpiry: number | null;
  message: string;
}

// Document validity check result for a trip
export interface DocumentValidityCheck {
  tripId: number;
  tripTitle: string;
  tripStartDate: string | null;
  tripEndDate: string | null;
  issues: DocumentValidityIssue[];
  passesCheck: boolean;
}

// Alert type for documents requiring attention
export interface DocumentAlert {
  document: TravelDocument;
  alertType: 'expired' | 'critical' | 'warning' | 'caution';
  message: string;
}

// Helper function to get status badge color classes
export function getExpirationStatusClasses(status: ExpirationStatus | undefined): string {
  switch (status) {
    case 'expired':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    case 'critical':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    case 'warning':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
    case 'caution':
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 'valid':
    default:
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
  }
}

// Helper function to get status label
export function getExpirationStatusLabel(status: ExpirationStatus | undefined, daysUntilExpiry: number | null | undefined): string {
  if (daysUntilExpiry === null || daysUntilExpiry === undefined) {
    return 'No expiry date';
  }

  switch (status) {
    case 'expired':
      return 'Expired';
    case 'critical':
      return `${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'} left`;
    case 'warning':
      return `${Math.ceil(daysUntilExpiry / 30)} month${daysUntilExpiry > 60 ? 's' : ''} left`;
    case 'caution':
      return `${Math.ceil(daysUntilExpiry / 30)} months left`;
    case 'valid':
    default:
      return 'Valid';
  }
}

// Document type icons
export function getDocumentTypeIcon(type: DocumentType): IconName {
  switch (type) {
    case 'PASSPORT':
      return 'passport';
    case 'VISA':
      return 'visa';
    case 'ID_CARD':
      return 'idCard';
    case 'GLOBAL_ENTRY':
      return 'globe';
    case 'VACCINATION':
      return 'vaccine';
    default:
      return 'document';
  }
}
