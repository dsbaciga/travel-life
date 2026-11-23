/**
 * Emergency Info Service Tests (feature #111 - Emergency Card)
 *
 * Test cases:
 * - EMG-001: Card assembles stored info, location addresses and companions
 * - EMG-002: Card returns location addresses raw, without resolving a country
 * - EMG-003: Companion medical details are withheld from non-owner collaborators
 * - EMG-004: Non-string entries in a Json array column are dropped, not thrown on
 * - EMG-005: Upsert leaves omitted fields unchanged and clears explicit nulls
 * - EMG-006: Delete is idempotent
 * - EMG-007: Access control - view/edit permission is enforced
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock the database config
const mockPrisma = {
  trip: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
  tripEmergencyInfo: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
  location: {
    findMany: jest.fn(),
  },
  tripCompanion: {
    findMany: jest.fn(),
  },
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

import emergencyInfoService from '../emergencyInfo.service';

/** A trip owned by user 1, as returned by verifyTripAccessWithPermission. */
function ownedTrip(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    userId: 1,
    title: 'Lisbon',
    privacyLevel: 'private',
    collaborators: [],
    ...overrides,
  };
}

/** A `tripCompanion.findMany` row as the service selects it. */
function companionRow(overrides: Record<string, unknown> = {}) {
  return {
    companion: {
      id: 5,
      name: 'Ana',
      relationship: 'Partner',
      phone: '+351 900 000 000',
      medicalNotes: 'Asthma - carries a blue inhaler',
      allergies: ['penicillin'],
      dietaryPreferences: ['vegetarian'],
      ...overrides,
    },
  };
}

/** Stub every read `getEmergencyCard` performs with an empty result. */
function stubEmptyCardData() {
  mockPrisma.trip.findUnique.mockResolvedValue({ countryCode: null });
  mockPrisma.tripEmergencyInfo.findUnique.mockResolvedValue(null);
  mockPrisma.location.findMany.mockResolvedValue([]);
  mockPrisma.tripCompanion.findMany.mockResolvedValue([]);
}

describe('EmergencyInfoService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.trip.findFirst.mockResolvedValue(ownedTrip());
    stubEmptyCardData();
  });

  // ============================================================
  // EMG-001: Card assembly
  // ============================================================
  describe('EMG-001: Card assembly', () => {
    it('should combine stored info, addresses and companions into one payload', async () => {
      mockPrisma.tripEmergencyInfo.findUnique.mockResolvedValue({
        id: 1,
        tripId: 10,
        insuranceProvider: 'Acme Travel',
        insurancePolicyNumber: 'AC-12345',
        insuranceAssistancePhone: '+1 800 555 0100',
        embassyName: 'US Embassy Lisbon',
        embassyPhone: '+351 21 727 3300',
        embassyAddress: 'Av. das Forcas Armadas, Lisbon',
        notes: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      });
      mockPrisma.location.findMany.mockResolvedValue([{ address: 'Rua Augusta, Lisbon, Portugal' }]);
      mockPrisma.tripCompanion.findMany.mockResolvedValue([companionRow()]);

      const card = await emergencyInfoService.getEmergencyCard(1, 10);

      expect(card.tripId).toBe(10);
      expect(card.tripTitle).toBe('Lisbon');
      expect(card.info?.insurancePolicyNumber).toBe('AC-12345');
      expect(card.locationAddresses).toEqual(['Rua Augusta, Lisbon, Portugal']);
      expect(card.locationCountryCodes).toEqual([]);
      expect(card.companions).toEqual([
        {
          id: 5,
          name: 'Ana',
          relationship: 'Partner',
          phone: '+351 900 000 000',
          medicalNotes: 'Asthma - carries a blue inhaler',
          allergies: ['penicillin'],
          dietaryPreferences: ['vegetarian'],
        },
      ]);
      expect(card.includesMedicalDetails).toBe(true);
    });

    it('should return a null info record for a trip that has never been filled in', async () => {
      const card = await emergencyInfoService.getEmergencyCard(1, 10);

      expect(card.info).toBeNull();
      expect(card.companions).toEqual([]);
      expect(card.locationAddresses).toEqual([]);
    });
  });

  // ============================================================
  // EMG-002: Country resolution stays on the client
  // ============================================================
  describe('EMG-002: Country resolution stays on the client', () => {
    it('should pass addresses through untouched and skip locations with no address', async () => {
      // The address -> ISO lookup table ships with the frontend so the card still
      // renders offline. The server must therefore not pre-resolve or normalise
      // anything, only skip rows that have nothing to resolve from.
      mockPrisma.location.findMany.mockResolvedValue([
        { address: '1-1 Yoyogikamizonocho, Shibuya City, Tokyo, Japan' },
        { address: null },
        { address: 'Kyoto, Japan' },
      ]);

      const card = await emergencyInfoService.getEmergencyCard(1, 10);

      expect(card.locationAddresses).toEqual([
        '1-1 Yoyogikamizonocho, Shibuya City, Tokyo, Japan',
        'Kyoto, Japan',
      ]);
      // Addresses come back raw and the country stays null: the server hands over
      // the stored override only, and never infers a country from an address. That
      // inference lives in the client so the card still works offline.
      expect(card.countryCode).toBeNull();
    });

    it('should expose the structured location country codes in trip order, skipping uncoded rows', async () => {
      mockPrisma.location.findMany.mockResolvedValue([
        { address: 'Kyoto, Japan', countryCode: 'JP' },
        { address: 'Somewhere', countryCode: null },
        { address: null, countryCode: 'FR' },
      ]);

      const card = await emergencyInfoService.getEmergencyCard(1, 10);

      expect(card.locationCountryCodes).toEqual(['JP', 'FR']);
      expect(card.locationAddresses).toEqual(['Kyoto, Japan', 'Somewhere']);
    });

    it('should carry the override from Trip.countryCode, not from the emergency record', async () => {
      mockPrisma.trip.findUnique.mockResolvedValue({ countryCode: 'PT' });
      mockPrisma.location.findMany.mockResolvedValue([{ address: 'Kyoto, Japan' }]);

      const card = await emergencyInfoService.getEmergencyCard(1, 10);

      // The stored override wins over anything the addresses imply, and it is read
      // from the trip — the single column the local-norms card reads too, so the
      // two can never disagree about which country you are in.
      expect(card.countryCode).toBe('PT');
      expect(mockPrisma.trip.findUnique).toHaveBeenCalledWith({
        where: { id: 10 },
        select: { countryCode: true },
      });
    });
  });

  // ============================================================
  // EMG-003: Medical privacy
  // ============================================================
  describe('EMG-003: Medical privacy', () => {
    it('should withhold companion medical details from a view collaborator', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(
        ownedTrip({ userId: 2, collaborators: [{ permissionLevel: 'view' }] })
      );
      mockPrisma.tripCompanion.findMany.mockResolvedValue([companionRow()]);

      const card = await emergencyInfoService.getEmergencyCard(1, 10);

      expect(card.includesMedicalDetails).toBe(false);
      expect(card.companions[0].name).toBe('Ana');
      expect(card.companions[0].medicalNotes).toBeNull();
      expect(card.companions[0].allergies).toEqual([]);
      expect(card.companions[0].dietaryPreferences).toEqual([]);
    });

    it('should withhold medical details from an edit collaborator too', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(
        ownedTrip({ userId: 2, collaborators: [{ permissionLevel: 'edit' }] })
      );
      mockPrisma.tripCompanion.findMany.mockResolvedValue([companionRow()]);

      const card = await emergencyInfoService.getEmergencyCard(1, 10);

      expect(card.includesMedicalDetails).toBe(false);
      expect(card.companions[0].medicalNotes).toBeNull();
    });
  });

  // ============================================================
  // EMG-004: Json column narrowing
  // ============================================================
  describe('EMG-004: Json column narrowing', () => {
    it('should drop non-string entries rather than throw', async () => {
      mockPrisma.tripCompanion.findMany.mockResolvedValue([
        companionRow({ allergies: ['peanuts', 42, null, { note: 'x' }], dietaryPreferences: 'halal' }),
      ]);

      const card = await emergencyInfoService.getEmergencyCard(1, 10);

      expect(card.companions[0].allergies).toEqual(['peanuts']);
      // A non-array value (e.g. from a hand-edited restore) degrades to empty.
      expect(card.companions[0].dietaryPreferences).toEqual([]);
    });
  });

  // ============================================================
  // EMG-005: Upsert semantics
  // ============================================================
  describe('EMG-005: Upsert semantics', () => {
    it('should omit absent fields and pass explicit nulls through as clears', async () => {
      mockPrisma.tripEmergencyInfo.upsert.mockResolvedValue({ id: 1, tripId: 10 });

      await emergencyInfoService.upsertEmergencyInfo(1, 10, {
        insurancePolicyNumber: 'AC-12345',
        embassyPhone: null,
      });

      const args = mockPrisma.tripEmergencyInfo.upsert.mock.calls[0][0] as {
        where: { tripId: number };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      };

      expect(args.where).toEqual({ tripId: 10 });
      expect(args.update).toEqual({
        insurancePolicyNumber: 'AC-12345',
        embassyPhone: null,
      });
      expect(args.create).toEqual({
        tripId: 10,
        insurancePolicyNumber: 'AC-12345',
        embassyPhone: null,
      });
      expect(args.update).not.toHaveProperty('insuranceProvider');
    });

    it('should convert an empty string to null so a cleared form field clears the column', async () => {
      mockPrisma.tripEmergencyInfo.upsert.mockResolvedValue({ id: 1, tripId: 10 });

      await emergencyInfoService.upsertEmergencyInfo(1, 10, { embassyName: '' });

      const args = mockPrisma.tripEmergencyInfo.upsert.mock.calls[0][0] as {
        update: Record<string, unknown>;
      };
      expect(args.update).toEqual({ embassyName: null });
    });
  });

  // ============================================================
  // EMG-006: Idempotent delete
  // ============================================================
  describe('EMG-006: Idempotent delete', () => {
    it('should succeed even when no record exists', async () => {
      mockPrisma.tripEmergencyInfo.deleteMany.mockResolvedValue({ count: 0 });

      await expect(emergencyInfoService.deleteEmergencyInfo(1, 10)).resolves.toEqual({
        success: true,
      });
      expect(mockPrisma.tripEmergencyInfo.deleteMany).toHaveBeenCalledWith({
        where: { tripId: 10 },
      });
    });
  });

  // ============================================================
  // EMG-007: Access control
  // ============================================================
  describe('EMG-007: Access control', () => {
    it('should reject a card read for an inaccessible trip', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(emergencyInfoService.getEmergencyCard(99, 10)).rejects.toThrow(
        "We couldn't find that trip, or you don't have access to it."
      );
      expect(mockPrisma.tripEmergencyInfo.findUnique).not.toHaveBeenCalled();
    });

    it('should reject an upsert from a view-only collaborator', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(
        ownedTrip({ userId: 2, collaborators: [{ permissionLevel: 'view' }] })
      );

      await expect(
        emergencyInfoService.upsertEmergencyInfo(1, 10, { insuranceProvider: 'Acme' })
      ).rejects.toThrow("You don't have permission to do that.");
      expect(mockPrisma.tripEmergencyInfo.upsert).not.toHaveBeenCalled();
    });

    it('should allow an upsert from an edit collaborator', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(
        ownedTrip({ userId: 2, collaborators: [{ permissionLevel: 'edit' }] })
      );
      mockPrisma.tripEmergencyInfo.upsert.mockResolvedValue({ id: 1, tripId: 10 });

      await expect(
        emergencyInfoService.upsertEmergencyInfo(1, 10, { insuranceProvider: 'Acme' })
      ).resolves.toEqual({ id: 1, tripId: 10 });
    });

    it('should reject a delete from a view-only collaborator', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(
        ownedTrip({ userId: 2, collaborators: [{ permissionLevel: 'view' }] })
      );

      await expect(emergencyInfoService.deleteEmergencyInfo(1, 10)).rejects.toThrow(
        "You don't have permission to do that."
      );
      expect(mockPrisma.tripEmergencyInfo.deleteMany).not.toHaveBeenCalled();
    });
  });
});
