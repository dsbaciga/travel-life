import { z } from 'zod';
import {
  requiredStringWithMax,
  optionalStringWithMax,
  optionalBoolean,
  optionalNotes,
  countryCode,
  optionalCountryCode,
} from '../validation/zodHelpers';

// Document types matching Prisma enum
export const DOCUMENT_TYPES = [
  'PASSPORT',
  'VISA',
  'ID_CARD',
  'GLOBAL_ENTRY',
  'VACCINATION',
] as const;

export type DocumentType = typeof DOCUMENT_TYPES[number];

/**
 * Masks a document number to show only the last 4 characters.
 * Returns null if the input is null or undefined.
 * Example: "AB1234567" -> "***4567"
 */
export function maskDocumentNumber(documentNumber: string | null | undefined): string | null {
  if (!documentNumber) return null;

  const trimmed = documentNumber.trim();
  if (trimmed.length <= 4) {
    // If 4 or fewer characters, show all as masked
    return '*'.repeat(trimmed.length);
  }

  const lastFour = trimmed.slice(-4);
  return `***${lastFour}`;
}

// Create schema
export const createTravelDocumentSchema = z.object({
  type: z.enum(DOCUMENT_TYPES),
  issuingCountry: requiredStringWithMax(100),
  // ISO 3166-1 alpha-2; omit and the backend derives it from issuingCountry when it can.
  issuingCountryCode: countryCode().optional().nullable(),
  documentNumber: z.string().max(255).optional(),
  issueDate: z.string().optional(),
  expiryDate: z.string().optional(),
  name: requiredStringWithMax(500),
  notes: z.string().optional(),
  isPrimary: z.boolean().optional().default(false),
  alertDaysBefore: z.number().int().min(0).max(365).optional().default(180),
});

// Update schema
export const updateTravelDocumentSchema = z.object({
  type: z.enum(DOCUMENT_TYPES).optional(),
  // issuingCountry and name are NOT NULL in the database: omit to leave unchanged,
  // but they can never be cleared
  issuingCountry: requiredStringWithMax(100).optional(),
  // Changing issuingCountry without a code re-derives the code from the new name.
  issuingCountryCode: optionalCountryCode(),
  documentNumber: optionalStringWithMax(255),
  issueDate: z.string().optional().nullable(),
  expiryDate: z.string().optional().nullable(),
  name: requiredStringWithMax(500).optional(),
  notes: optionalNotes(),
  isPrimary: optionalBoolean(),
  // NOT NULL with a DB default, so it can be omitted but not cleared
  alertDaysBefore: z.number().int().min(0).max(365).optional(),
});

export type CreateTravelDocumentInput = z.infer<typeof createTravelDocumentSchema>;
export type UpdateTravelDocumentInput = z.infer<typeof updateTravelDocumentSchema>;

// Response type with masked document number
export interface TravelDocumentResponse {
  id: number;
  userId: number;
  type: DocumentType;
  issuingCountry: string;
  /** ISO 3166-1 alpha-2 of issuingCountry, or null when the name is not recognised. */
  issuingCountryCode: string | null;
  documentNumber: string | null; // Always masked in responses
  issueDate: string | null;
  expiryDate: string | null;
  name: string;
  notes: string | null;
  isPrimary: boolean;
  alertDaysBefore: number;
  createdAt: string;
  updatedAt: string;
  // Computed fields
  expirationStatus?: 'expired' | 'critical' | 'warning' | 'caution' | 'valid';
  daysUntilExpiry?: number | null;
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

export interface DocumentValidityIssue {
  documentId: number;
  documentType: DocumentType;
  documentName: string;
  issue: 'expired' | 'expires_during_trip' | 'expires_soon' | 'no_expiry_date';
  expiryDate: string | null;
  daysUntilExpiry: number | null;
  message: string;
}

// Alert response
export interface DocumentAlert {
  document: TravelDocumentResponse;
  alertType: 'expired' | 'critical' | 'warning' | 'caution';
  message: string;
}
