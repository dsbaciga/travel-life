/**
 * TravelDocument Service Tests
 *
 * Test cases:
 * - TD-001: Create a travel document
 * - TD-002: Create a primary document (unsets other primaries)
 * - TD-003: Get all documents for a user
 * - TD-004: Get a document by ID
 * - TD-005: Update a travel document
 * - TD-006: Delete a travel document
 * - TD-007: Get documents requiring attention (expiring)
 * - TD-008: Check document validity for a trip
 * - TD-009: Get primary passport
 * - TD-010: Error cases (not found, access denied)
 */

// Mock the database config
const mockPrisma = {
  travelDocument: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
  trip: {
    findFirst: jest.fn(),
  },
  $transaction: jest.fn(),
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

// Mock serviceHelpers to avoid complex import chains
jest.mock('../../utils/serviceHelpers', () => ({
  buildConditionalUpdateData: jest.fn((data: Record<string, unknown>) => {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  }),
  tripDateTransformer: jest.fn((val: string | null) => (val ? new Date(val) : null)),
}));

import travelDocumentService from '../travelDocument.service';

describe('TravelDocumentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: $transaction executes the callback with mockPrisma
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => {
      return callback(mockPrisma);
    });
  });

  // Helper to create a mock TravelDocument (Prisma model)
  const createMockDocument = (overrides: Partial<{
    id: number;
    userId: number;
    type: string;
    issuingCountry: string;
    documentNumber: string | null;
    issueDate: Date | null;
    expiryDate: Date | null;
    name: string;
    notes: string | null;
    isPrimary: boolean;
    alertDaysBefore: number;
    createdAt: Date;
    updatedAt: Date;
  }> = {}) => ({
    id: 1,
    userId: 1,
    type: 'PASSPORT',
    issuingCountry: 'United States',
    documentNumber: 'AB1234567',
    issueDate: new Date('2020-01-01'),
    expiryDate: new Date('2030-01-01'),
    name: 'US Passport',
    notes: null,
    isPrimary: true,
    alertDaysBefore: 180,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  });

  // ============================================================
  // TD-001: Create a travel document
  // ============================================================
  describe('TD-001: Create a travel document', () => {
    it('should create a new travel document', async () => {
      const userId = 1;
      const input = {
        type: 'PASSPORT' as const,
        issuingCountry: 'United States',
        documentNumber: 'AB1234567',
        name: 'US Passport',
        issueDate: '2020-01-01',
        expiryDate: '2030-01-01',
      };

      const mockDoc = createMockDocument();
      mockPrisma.travelDocument.create.mockResolvedValue(mockDoc);

      const result = await travelDocumentService.create(userId, input);

      expect(result.id).toBe(1);
      expect(result.type).toBe('PASSPORT');
      expect(result.issuingCountry).toBe('United States');
      // Document number should be masked
      expect(result.documentNumber).toBe('***4567');
      expect(result.name).toBe('US Passport');
      expect(result.expirationStatus).toBeDefined();
    });

    it('should create a document without optional fields', async () => {
      const userId = 1;
      const input = {
        type: 'ID_CARD' as const,
        issuingCountry: 'France',
        name: 'French ID Card',
      };

      const mockDoc = createMockDocument({
        type: 'ID_CARD',
        issuingCountry: 'France',
        name: 'French ID Card',
        documentNumber: null,
        issueDate: null,
        expiryDate: null,
        isPrimary: false,
      });

      mockPrisma.travelDocument.create.mockResolvedValue(mockDoc);

      const result = await travelDocumentService.create(userId, input);

      expect(result.documentNumber).toBeNull();
      expect(result.issueDate).toBeNull();
      expect(result.expiryDate).toBeNull();
    });
  });

  // ============================================================
  // TD-002: Create a primary document (unsets other primaries)
  // ============================================================
  describe('TD-002: Create a primary document', () => {
    it('should unset other primary documents of the same type when creating a primary', async () => {
      const userId = 1;
      const input = {
        type: 'PASSPORT' as const,
        issuingCountry: 'United Kingdom',
        name: 'UK Passport',
        isPrimary: true,
      };

      const mockDoc = createMockDocument({
        id: 2,
        issuingCountry: 'United Kingdom',
        name: 'UK Passport',
      });

      mockPrisma.travelDocument.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.travelDocument.create.mockResolvedValue(mockDoc);

      await travelDocumentService.create(userId, input);

      expect(mockPrisma.travelDocument.updateMany).toHaveBeenCalledWith({
        where: { userId, type: 'PASSPORT', isPrimary: true },
        data: { isPrimary: false },
      });
    });

    it('should not unset primaries when isPrimary is false', async () => {
      const userId = 1;
      const input = {
        type: 'PASSPORT' as const,
        issuingCountry: 'Canada',
        name: 'Canadian Passport',
        isPrimary: false,
      };

      const mockDoc = createMockDocument({
        id: 3,
        isPrimary: false,
        issuingCountry: 'Canada',
        name: 'Canadian Passport',
      });

      mockPrisma.travelDocument.create.mockResolvedValue(mockDoc);

      await travelDocumentService.create(userId, input);

      expect(mockPrisma.travelDocument.updateMany).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // TD-003: Get all documents for a user
  // ============================================================
  describe('TD-003: Get all documents for a user', () => {
    it('should return all documents ordered by type, primary, and expiry', async () => {
      const userId = 1;
      const mockDocs = [
        createMockDocument({ id: 1, type: 'PASSPORT', isPrimary: true }),
        createMockDocument({ id: 2, type: 'PASSPORT', isPrimary: false }),
        createMockDocument({ id: 3, type: 'VISA', isPrimary: false }),
      ];

      mockPrisma.travelDocument.findMany.mockResolvedValue(mockDocs);

      const result = await travelDocumentService.getAll(userId);

      expect(mockPrisma.travelDocument.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: [
          { type: 'asc' },
          { isPrimary: 'desc' },
          { expiryDate: 'asc' },
        ],
      });
      expect(result.length).toBe(3);
    });

    it('should return empty array when user has no documents', async () => {
      mockPrisma.travelDocument.findMany.mockResolvedValue([]);

      const result = await travelDocumentService.getAll(1);

      expect(result).toEqual([]);
    });
  });

  // ============================================================
  // TD-004: Get a document by ID
  // ============================================================
  describe('TD-004: Get a document by ID', () => {
    it('should return a document by ID for the owning user', async () => {
      const mockDoc = createMockDocument();
      mockPrisma.travelDocument.findFirst.mockResolvedValue(mockDoc);

      const result = await travelDocumentService.getById(1, 1);

      expect(mockPrisma.travelDocument.findFirst).toHaveBeenCalledWith({
        where: { id: 1, userId: 1 },
      });
      expect(result.id).toBe(1);
      expect(result.documentNumber).toBe('***4567');
    });

    it('should throw 404 if document not found', async () => {
      mockPrisma.travelDocument.findFirst.mockResolvedValue(null);

      await expect(travelDocumentService.getById(1, 999)).rejects.toThrow(
        'Travel document not found'
      );
    });

    it('should throw 404 if document belongs to another user', async () => {
      mockPrisma.travelDocument.findFirst.mockResolvedValue(null);

      await expect(travelDocumentService.getById(2, 1)).rejects.toThrow(
        'Travel document not found'
      );
    });
  });

  // ============================================================
  // TD-005: Update a travel document
  // ============================================================
  describe('TD-005: Update a travel document', () => {
    it('should update document fields', async () => {
      const existing = createMockDocument();
      const updated = createMockDocument({ name: 'Updated Passport', notes: 'Renewed' });

      mockPrisma.travelDocument.findFirst.mockResolvedValue(existing);
      mockPrisma.travelDocument.update.mockResolvedValue(updated);

      const result = await travelDocumentService.update(1, 1, {
        name: 'Updated Passport',
        notes: 'Renewed',
      });

      expect(result.name).toBe('Updated Passport');
    });

    it('should throw 404 when updating non-existent document', async () => {
      mockPrisma.travelDocument.findFirst.mockResolvedValue(null);

      await expect(
        travelDocumentService.update(1, 999, { name: 'Test' })
      ).rejects.toThrow('Travel document not found');
    });

    it('should unset other primaries when setting as primary during update', async () => {
      const existing = createMockDocument({ isPrimary: false });
      const updated = createMockDocument({ isPrimary: true });

      mockPrisma.travelDocument.findFirst.mockResolvedValue(existing);
      mockPrisma.travelDocument.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.travelDocument.update.mockResolvedValue(updated);

      await travelDocumentService.update(1, 1, { isPrimary: true });

      expect(mockPrisma.travelDocument.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 1,
          type: 'PASSPORT',
          isPrimary: true,
          id: { not: 1 },
        },
        data: { isPrimary: false },
      });
    });
  });

  // ============================================================
  // TD-006: Delete a travel document
  // ============================================================
  describe('TD-006: Delete a travel document', () => {
    it('should delete a document belonging to the user', async () => {
      const mockDoc = createMockDocument();
      mockPrisma.travelDocument.findFirst.mockResolvedValue(mockDoc);
      mockPrisma.travelDocument.delete.mockResolvedValue(mockDoc);

      await travelDocumentService.delete(1, 1);

      expect(mockPrisma.travelDocument.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('should throw 404 when deleting non-existent document', async () => {
      mockPrisma.travelDocument.findFirst.mockResolvedValue(null);

      await expect(travelDocumentService.delete(1, 999)).rejects.toThrow(
        'Travel document not found'
      );
    });
  });

  // ============================================================
  // TD-007: Get documents requiring attention
  // ============================================================
  describe('TD-007: Get documents requiring attention', () => {
    it('should return alerts for documents within their alert window', async () => {
      const expiringSoon = createMockDocument({
        id: 1,
        name: 'Expiring Passport',
        expiryDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days from now
        alertDaysBefore: 180,
      });

      mockPrisma.travelDocument.findMany.mockResolvedValue([expiringSoon]);

      const result = await travelDocumentService.getDocumentsRequiringAttention(1);

      expect(result.length).toBe(1);
      expect(result[0].alertType).toBe('critical');
      expect(result[0].document.name).toBe('Expiring Passport');
    });

    it('should not return alerts for documents not within their alert window', async () => {
      const farFuture = createMockDocument({
        id: 1,
        name: 'Valid Passport',
        expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
        alertDaysBefore: 30, // Only alert within 30 days
      });

      mockPrisma.travelDocument.findMany.mockResolvedValue([farFuture]);

      const result = await travelDocumentService.getDocumentsRequiringAttention(1);

      expect(result.length).toBe(0);
    });

    it('should return expired alert for expired documents', async () => {
      const expired = createMockDocument({
        id: 1,
        name: 'Expired Passport',
        expiryDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
        alertDaysBefore: 180,
      });

      mockPrisma.travelDocument.findMany.mockResolvedValue([expired]);

      const result = await travelDocumentService.getDocumentsRequiringAttention(1);

      expect(result.length).toBe(1);
      expect(result[0].alertType).toBe('expired');
    });

    it('should skip documents without expiry dates', async () => {
      const noExpiry = createMockDocument({
        id: 1,
        name: 'No Expiry Doc',
        expiryDate: null,
      });

      mockPrisma.travelDocument.findMany.mockResolvedValue([noExpiry]);

      const result = await travelDocumentService.getDocumentsRequiringAttention(1);

      expect(result.length).toBe(0);
    });
  });

  // ============================================================
  // TD-008: Check document validity for a trip
  // ============================================================
  describe('TD-008: Check document validity for trip', () => {
    it('should return issues for expired passports', async () => {
      const trip = {
        id: 1,
        title: 'Test Trip',
        startDate: new Date('2025-06-01'),
        endDate: new Date('2025-06-15'),
        userId: 1,
        collaborators: [],
      };

      const expiredPassport = createMockDocument({
        id: 1,
        type: 'PASSPORT',
        name: 'Expired Passport',
        expiryDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      });

      mockPrisma.trip.findFirst.mockResolvedValue(trip);
      mockPrisma.travelDocument.findMany.mockResolvedValue([expiredPassport]);

      const result = await travelDocumentService.checkDocumentValidityForTrip(1, 1);

      expect(result.passesCheck).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0].issue).toBe('expired');
    });

    it('should pass check when all documents are valid', async () => {
      const trip = {
        id: 1,
        title: 'Test Trip',
        startDate: new Date('2025-06-01'),
        endDate: new Date('2025-06-15'),
        userId: 1,
        collaborators: [],
      };

      const validPassport = createMockDocument({
        type: 'PASSPORT',
        expiryDate: new Date('2030-01-01'),
      });

      mockPrisma.trip.findFirst.mockResolvedValue(trip);
      mockPrisma.travelDocument.findMany.mockResolvedValue([validPassport]);

      const result = await travelDocumentService.checkDocumentValidityForTrip(1, 1);

      expect(result.passesCheck).toBe(true);
    });

    it('should throw 404 if trip not found', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(
        travelDocumentService.checkDocumentValidityForTrip(1, 999)
      ).rejects.toThrow('Trip not found');
    });

    it('should flag documents with no expiry date', async () => {
      const trip = {
        id: 1,
        title: 'Test Trip',
        startDate: new Date('2025-06-01'),
        endDate: new Date('2025-06-15'),
        userId: 1,
      };

      const noExpiryPassport = createMockDocument({
        type: 'PASSPORT',
        expiryDate: null,
      });

      mockPrisma.trip.findFirst.mockResolvedValue(trip);
      mockPrisma.travelDocument.findMany.mockResolvedValue([noExpiryPassport]);

      const result = await travelDocumentService.checkDocumentValidityForTrip(1, 1);

      expect(result.issues.some(i => i.issue === 'no_expiry_date')).toBe(true);
    });
  });

  // ============================================================
  // TD-009: Get primary passport
  // ============================================================
  describe('TD-009: Get primary passport', () => {
    it('should return the primary passport', async () => {
      const primaryPassport = createMockDocument({ isPrimary: true, type: 'PASSPORT' });
      mockPrisma.travelDocument.findFirst.mockResolvedValue(primaryPassport);

      const result = await travelDocumentService.getPrimaryPassport(1);

      expect(result).not.toBeNull();
      expect(result!.isPrimary).toBe(true);
      expect(result!.type).toBe('PASSPORT');
    });

    it('should return first passport if no primary is set', async () => {
      const firstPassport = createMockDocument({ isPrimary: false, type: 'PASSPORT' });

      // First call for primary returns null, second call returns first passport
      mockPrisma.travelDocument.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(firstPassport);

      const result = await travelDocumentService.getPrimaryPassport(1);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('PASSPORT');
    });

    it('should return null if user has no passports', async () => {
      mockPrisma.travelDocument.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await travelDocumentService.getPrimaryPassport(1);

      expect(result).toBeNull();
    });
  });
});
