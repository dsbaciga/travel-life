/**
 * Checklist Service Tests
 *
 * Test cases:
 * - CKL-001: Get checklists by user ID
 * - CKL-002: Get checklists by trip ID
 * - CKL-003: Get checklist by ID
 * - CKL-004: Get checklist by ID - not found
 * - CKL-005: Create a checklist
 * - CKL-006: Create a checklist with items
 * - CKL-007: Update a checklist
 * - CKL-008: Update a checklist - not found
 * - CKL-009: Delete a checklist
 * - CKL-010: Delete a checklist - not found
 * - CKL-011: Add checklist item
 * - CKL-012: Add checklist item - checklist not found
 * - CKL-013: Update checklist item
 * - CKL-014: Update checklist item - not found
 * - CKL-015: Delete checklist item
 * - CKL-016: Delete checklist item - not found
 * - CKL-017: Initialize default checklists
 * - CKL-018: Initialize default checklists - already initialized
 */

// Mock @prisma/client BEFORE any imports that depend on it
jest.mock('@prisma/client', () => ({
  Prisma: {
    Decimal: class MockDecimal {
      private value: string;
      constructor(value: string | number) { this.value = String(value); }
      toString(): string { return this.value; }
      toNumber(): number { return parseFloat(this.value); }
      valueOf(): number { return this.toNumber(); }
    },
    JsonNull: 'DbNull',
  },
  EntityType: {
    PHOTO: 'PHOTO',
    LOCATION: 'LOCATION',
    ACTIVITY: 'ACTIVITY',
    LODGING: 'LODGING',
    TRANSPORTATION: 'TRANSPORTATION',
    JOURNAL_ENTRY: 'JOURNAL_ENTRY',
    PHOTO_ALBUM: 'PHOTO_ALBUM',
  },
}));

// Mock checklist default data
jest.mock('../../data/checklist-defaults', () => ({
  DEFAULT_AIRPORTS: [
    { name: 'Los Angeles International', code: 'LAX', city: 'Los Angeles', country: 'USA' },
    { name: 'John F. Kennedy International', code: 'JFK', city: 'New York', country: 'USA' },
  ],
  DEFAULT_COUNTRIES: ['United States', 'Canada', 'Mexico'],
  DEFAULT_CITIES: [
    { name: 'New York', country: 'USA', state: 'NY' },
    { name: 'Los Angeles', country: 'USA', state: 'CA' },
  ],
  DEFAULT_US_STATES: [
    { code: 'NY', name: 'New York' },
    { code: 'CA', name: 'California' },
  ],
}));

// Mock the config module to avoid DATABASE_URL requirement
jest.mock('../../config/index', () => ({
  config: {
    nodeEnv: 'test',
    port: 5000,
    baseUrl: 'http://localhost:5000',
    databaseUrl: 'postgresql://test:test@localhost:5432/test',
    jwt: { secret: 'test', expiresIn: '15m', refreshSecret: 'test', refreshExpiresIn: '7d' },
    cookie: { secure: false, sameSite: 'lax' },
    nominatimUrl: 'http://localhost:8080',
  },
}));

// Mock logger to avoid transports trying to write
jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock the database config
const mockPrisma = {
  checklist: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  },
  checklistItem: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    updateMany: jest.fn(),
  },
  trip: {
    findMany: jest.fn(),
  },
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

import checklistService from '../checklist.service';

describe('ChecklistService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockChecklistItem = {
    id: 1,
    checklistId: 1,
    name: 'Pack sunscreen',
    description: null,
    isChecked: false,
    isDefault: false,
    sortOrder: 0,
    metadata: null,
    checkedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockChecklist = {
    id: 1,
    userId: 1,
    tripId: null,
    name: 'Packing List',
    description: 'Things to pack',
    type: 'custom',
    isDefault: false,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [mockChecklistItem],
  };

  // ============================================================
  // CKL-001: Get checklists by user ID
  // ============================================================
  describe('CKL-001: Get checklists by user ID', () => {
    it('should return all checklists for a user with stats', async () => {
      mockPrisma.checklist.findMany.mockResolvedValue([mockChecklist]);

      const result = await checklistService.getChecklistsByUserId(1);

      expect(mockPrisma.checklist.findMany).toHaveBeenCalledWith({
        where: { userId: 1 },
        include: {
          items: {
            orderBy: expect.any(Array),
          },
        },
        orderBy: expect.any(Array),
      });
      expect(result).toHaveLength(1);
      expect(result[0].stats).toBeDefined();
      expect(result[0].stats.total).toBe(1);
      expect(result[0].stats.checked).toBe(0);
      expect(result[0].stats.percentage).toBe(0);
    });

    it('should calculate stats correctly with checked items', async () => {
      const checklistWithChecked = {
        ...mockChecklist,
        items: [
          { ...mockChecklistItem, isChecked: true },
          { ...mockChecklistItem, id: 2, isChecked: false },
          { ...mockChecklistItem, id: 3, isChecked: true },
        ],
      };
      mockPrisma.checklist.findMany.mockResolvedValue([checklistWithChecked]);

      const result = await checklistService.getChecklistsByUserId(1);

      expect(result[0].stats.total).toBe(3);
      expect(result[0].stats.checked).toBe(2);
      expect(result[0].stats.percentage).toBe(67);
    });

    it('should return empty array when no checklists exist', async () => {
      mockPrisma.checklist.findMany.mockResolvedValue([]);

      const result = await checklistService.getChecklistsByUserId(1);

      expect(result).toEqual([]);
    });
  });

  // ============================================================
  // CKL-002: Get checklists by trip ID
  // ============================================================
  describe('CKL-002: Get checklists by trip ID', () => {
    it('should return checklists for a specific trip', async () => {
      const tripChecklist = { ...mockChecklist, tripId: 100 };
      mockPrisma.checklist.findMany.mockResolvedValue([tripChecklist]);

      const result = await checklistService.getChecklistsByTripId(100, 1);

      expect(mockPrisma.checklist.findMany).toHaveBeenCalledWith({
        where: { userId: 1, tripId: 100 },
        include: {
          items: {
            orderBy: expect.any(Array),
          },
        },
        orderBy: expect.any(Array),
      });
      expect(result).toHaveLength(1);
      expect(result[0].stats).toBeDefined();
    });
  });

  // ============================================================
  // CKL-003: Get checklist by ID
  // ============================================================
  describe('CKL-003: Get checklist by ID', () => {
    it('should return a checklist with items and stats', async () => {
      mockPrisma.checklist.findFirst.mockResolvedValue(mockChecklist);

      const result = await checklistService.getChecklistById(1, 1);

      expect(mockPrisma.checklist.findFirst).toHaveBeenCalledWith({
        where: { id: 1, userId: 1 },
        include: {
          items: {
            orderBy: expect.any(Array),
          },
        },
      });
      expect(result.name).toBe('Packing List');
      expect(result.stats).toBeDefined();
    });
  });

  // ============================================================
  // CKL-004: Get checklist by ID - not found
  // ============================================================
  describe('CKL-004: Get checklist by ID - not found', () => {
    it('should throw 404 when checklist not found', async () => {
      mockPrisma.checklist.findFirst.mockResolvedValue(null);

      await expect(checklistService.getChecklistById(999, 1)).rejects.toThrow(
        'Checklist not found'
      );
    });
  });

  // ============================================================
  // CKL-005: Create a checklist
  // ============================================================
  describe('CKL-005: Create a checklist', () => {
    it('should create a new checklist', async () => {
      mockPrisma.checklist.create.mockResolvedValue(mockChecklist);
      // getChecklistById is called after create
      mockPrisma.checklist.findFirst.mockResolvedValue(mockChecklist);

      const result = await checklistService.createChecklist(1, {
        name: 'Packing List',
        description: 'Things to pack',
        type: 'custom',
      } as any);

      expect(mockPrisma.checklist.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Packing List',
          description: 'Things to pack',
          type: 'custom',
          user: { connect: { id: 1 } },
        }),
        include: expect.any(Object),
      });
      expect(result.name).toBe('Packing List');
    });
  });

  // ============================================================
  // CKL-006: Create a checklist with items
  // ============================================================
  describe('CKL-006: Create a checklist with items', () => {
    it('should create a checklist with initial items', async () => {
      const checklistWithItems = {
        ...mockChecklist,
        items: [
          { ...mockChecklistItem, name: 'Passport' },
          { ...mockChecklistItem, id: 2, name: 'Tickets' },
        ],
      };
      mockPrisma.checklist.create.mockResolvedValue(checklistWithItems);
      mockPrisma.checklist.findFirst.mockResolvedValue(checklistWithItems);

      const result = await checklistService.createChecklist(1, {
        name: 'Travel Docs',
        type: 'custom',
        items: [
          { name: 'Passport' },
          { name: 'Tickets' },
        ],
      } as any);

      expect(mockPrisma.checklist.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          items: {
            create: expect.arrayContaining([
              expect.objectContaining({ name: 'Passport' }),
              expect.objectContaining({ name: 'Tickets' }),
            ]),
          },
        }),
        include: expect.any(Object),
      });
      expect(result.items).toHaveLength(2);
    });
  });

  // ============================================================
  // CKL-007: Update a checklist
  // ============================================================
  describe('CKL-007: Update a checklist', () => {
    it('should update a checklist name and description', async () => {
      mockPrisma.checklist.findFirst.mockResolvedValue(mockChecklist);
      mockPrisma.checklist.update.mockResolvedValue({
        ...mockChecklist,
        name: 'Updated List',
      });
      // Re-mock for getChecklistById call
      mockPrisma.checklist.findFirst.mockResolvedValue({
        ...mockChecklist,
        name: 'Updated List',
      });

      const result = await checklistService.updateChecklist(1, 1, {
        name: 'Updated List',
      });

      expect(mockPrisma.checklist.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          name: 'Updated List',
        }),
      });
      expect(result.name).toBe('Updated List');
    });
  });

  // ============================================================
  // CKL-008: Update a checklist - not found
  // ============================================================
  describe('CKL-008: Update a checklist - not found', () => {
    it('should throw 404 when checklist not found', async () => {
      mockPrisma.checklist.findFirst.mockResolvedValue(null);

      await expect(
        checklistService.updateChecklist(999, 1, { name: 'Test' })
      ).rejects.toThrow('Checklist not found');
    });
  });

  // ============================================================
  // CKL-009: Delete a checklist
  // ============================================================
  describe('CKL-009: Delete a checklist', () => {
    it('should delete a checklist', async () => {
      mockPrisma.checklist.findFirst.mockResolvedValue(mockChecklist);
      mockPrisma.checklist.delete.mockResolvedValue(mockChecklist);

      await checklistService.deleteChecklist(1, 1);

      expect(mockPrisma.checklist.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });
  });

  // ============================================================
  // CKL-010: Delete a checklist - not found
  // ============================================================
  describe('CKL-010: Delete a checklist - not found', () => {
    it('should throw 404 when checklist not found', async () => {
      mockPrisma.checklist.findFirst.mockResolvedValue(null);

      await expect(checklistService.deleteChecklist(999, 1)).rejects.toThrow(
        'Checklist not found'
      );
    });
  });

  // ============================================================
  // CKL-011: Add checklist item
  // ============================================================
  describe('CKL-011: Add checklist item', () => {
    it('should add an item to a checklist', async () => {
      mockPrisma.checklist.findFirst.mockResolvedValue(mockChecklist);
      mockPrisma.checklistItem.findFirst.mockResolvedValue({ sortOrder: 2 });
      const newItem = {
        ...mockChecklistItem,
        id: 5,
        name: 'New Item',
        sortOrder: 3,
      };
      mockPrisma.checklistItem.create.mockResolvedValue(newItem);

      const result = await checklistService.addChecklistItem(1, 1, {
        name: 'New Item',
      });

      expect(mockPrisma.checklistItem.create).toHaveBeenCalledWith({
        data: {
          checklistId: 1,
          name: 'New Item',
          description: undefined,
          metadata: undefined,
          sortOrder: 3,
        },
      });
      expect(result.name).toBe('New Item');
      expect(result.sortOrder).toBe(3);
    });

    it('should set sortOrder to 0 when checklist is empty', async () => {
      mockPrisma.checklist.findFirst.mockResolvedValue(mockChecklist);
      mockPrisma.checklistItem.findFirst.mockResolvedValue(null);
      const newItem = { ...mockChecklistItem, id: 5, name: 'First Item', sortOrder: 0 };
      mockPrisma.checklistItem.create.mockResolvedValue(newItem);

      const result = await checklistService.addChecklistItem(1, 1, {
        name: 'First Item',
      });

      expect(mockPrisma.checklistItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sortOrder: 0,
        }),
      });
      expect(result.sortOrder).toBe(0);
    });
  });

  // ============================================================
  // CKL-012: Add checklist item - checklist not found
  // ============================================================
  describe('CKL-012: Add checklist item - checklist not found', () => {
    it('should throw 404 when checklist not found', async () => {
      mockPrisma.checklist.findFirst.mockResolvedValue(null);

      await expect(
        checklistService.addChecklistItem(999, 1, { name: 'Test' })
      ).rejects.toThrow('Checklist not found');
    });
  });

  // ============================================================
  // CKL-013: Update checklist item
  // ============================================================
  describe('CKL-013: Update checklist item', () => {
    it('should update a checklist item name', async () => {
      mockPrisma.checklistItem.findFirst.mockResolvedValue(mockChecklistItem);
      const updated = { ...mockChecklistItem, name: 'Updated Item' };
      mockPrisma.checklistItem.update.mockResolvedValue(updated);

      const result = await checklistService.updateChecklistItem(1, 1, {
        name: 'Updated Item',
      });

      expect(mockPrisma.checklistItem.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          name: 'Updated Item',
        }),
      });
      expect(result.name).toBe('Updated Item');
    });

    it('should mark item as checked with checkedAt timestamp', async () => {
      mockPrisma.checklistItem.findFirst.mockResolvedValue(mockChecklistItem);
      const updated = {
        ...mockChecklistItem,
        isChecked: true,
        checkedAt: new Date(),
      };
      mockPrisma.checklistItem.update.mockResolvedValue(updated);

      const result = await checklistService.updateChecklistItem(1, 1, {
        isChecked: true,
      });

      expect(mockPrisma.checklistItem.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          isChecked: true,
          checkedAt: expect.any(Date),
        }),
      });
      expect(result.isChecked).toBe(true);
    });

    it('should uncheck item and clear checkedAt', async () => {
      const checkedItem = { ...mockChecklistItem, isChecked: true, checkedAt: new Date() };
      mockPrisma.checklistItem.findFirst.mockResolvedValue(checkedItem);
      const updated = { ...checkedItem, isChecked: false, checkedAt: null };
      mockPrisma.checklistItem.update.mockResolvedValue(updated);

      const result = await checklistService.updateChecklistItem(1, 1, {
        isChecked: false,
      });

      expect(mockPrisma.checklistItem.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          isChecked: false,
          checkedAt: null,
        }),
      });
      expect(result.isChecked).toBe(false);
      expect(result.checkedAt).toBeNull();
    });
  });

  // ============================================================
  // CKL-014: Update checklist item - not found
  // ============================================================
  describe('CKL-014: Update checklist item - not found', () => {
    it('should throw 404 when checklist item not found', async () => {
      mockPrisma.checklistItem.findFirst.mockResolvedValue(null);

      await expect(
        checklistService.updateChecklistItem(999, 1, { name: 'Test' })
      ).rejects.toThrow('Checklist item not found');
    });
  });

  // ============================================================
  // CKL-015: Delete checklist item
  // ============================================================
  describe('CKL-015: Delete checklist item', () => {
    it('should delete a checklist item', async () => {
      mockPrisma.checklistItem.findFirst.mockResolvedValue(mockChecklistItem);
      mockPrisma.checklistItem.delete.mockResolvedValue(mockChecklistItem);

      await checklistService.deleteChecklistItem(1, 1);

      expect(mockPrisma.checklistItem.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });
  });

  // ============================================================
  // CKL-016: Delete checklist item - not found
  // ============================================================
  describe('CKL-016: Delete checklist item - not found', () => {
    it('should throw 404 when checklist item not found', async () => {
      mockPrisma.checklistItem.findFirst.mockResolvedValue(null);

      await expect(checklistService.deleteChecklistItem(999, 1)).rejects.toThrow(
        'Checklist item not found'
      );
    });
  });

  // ============================================================
  // CKL-017: Initialize default checklists
  // ============================================================
  describe('CKL-017: Initialize default checklists', () => {
    it('should create default checklists when none exist', async () => {
      mockPrisma.checklist.count.mockResolvedValue(0);
      mockPrisma.checklist.create.mockResolvedValue(mockChecklist);

      await checklistService.initializeDefaultChecklists(1);

      expect(mockPrisma.checklist.count).toHaveBeenCalledWith({
        where: { userId: 1, isDefault: true },
      });
      // Should create 4 default checklists (airports, countries, cities, us_states)
      expect(mockPrisma.checklist.create).toHaveBeenCalledTimes(4);
    });
  });

  // ============================================================
  // CKL-018: Initialize default checklists - already initialized
  // ============================================================
  describe('CKL-018: Initialize default checklists - already initialized', () => {
    it('should skip when user already has default checklists', async () => {
      mockPrisma.checklist.count.mockResolvedValue(4);

      await checklistService.initializeDefaultChecklists(1);

      expect(mockPrisma.checklist.create).not.toHaveBeenCalled();
    });
  });
});
