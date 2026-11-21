/**
 * entityLocationLinks tests: synthetic link id encode/decode and the synthetic link query.
 */

jest.mock('../../../config/database', () => ({
  __esModule: true,
  default: {
    activity: { findMany: jest.fn() },
    lodging: { findMany: jest.fn() },
  },
}));

import prisma from '../../../config/database';
import {
  decodeSyntheticLocationLinkId,
  findSyntheticLocationLinks,
  syntheticLocationLinkId,
} from '../entityLocationLinks';

const mockPrisma = prisma as unknown as {
  activity: { findMany: jest.Mock };
  lodging: { findMany: jest.Mock };
};

describe('entityLocationLinks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.activity.findMany.mockResolvedValue([]);
    mockPrisma.lodging.findMany.mockResolvedValue([]);
  });

  describe('syntheticLocationLinkId / decodeSyntheticLocationLinkId', () => {
    it('encodes activities to even negative ids and lodgings to odd negative ids', () => {
      expect(syntheticLocationLinkId('ACTIVITY', 3)).toBe(-6);
      expect(syntheticLocationLinkId('LODGING', 3)).toBe(-7);
      expect(syntheticLocationLinkId('ACTIVITY', 1)).toBe(-2);
      expect(syntheticLocationLinkId('LODGING', 1)).toBe(-3);
    });

    it('round-trips every entity id for both types', () => {
      for (const type of ['ACTIVITY', 'LODGING'] as const) {
        for (const entityId of [1, 2, 3, 10, 999, 123456]) {
          const linkId = syntheticLocationLinkId(type, entityId);
          expect(linkId).toBeLessThan(0);
          expect(decodeSyntheticLocationLinkId(linkId)).toEqual({ type, entityId });
        }
      }
    });

    it('never gives an activity and a lodging the same id', () => {
      const ids = new Set<number>();
      for (let n = 1; n <= 200; n++) {
        ids.add(syntheticLocationLinkId('ACTIVITY', n));
        ids.add(syntheticLocationLinkId('LODGING', n));
      }
      expect(ids.size).toBe(400);
    });

    it('returns null for real (positive) link ids, zero, -1 and non-integers', () => {
      expect(decodeSyntheticLocationLinkId(5)).toBeNull();
      expect(decodeSyntheticLocationLinkId(1)).toBeNull();
      expect(decodeSyntheticLocationLinkId(0)).toBeNull();
      expect(decodeSyntheticLocationLinkId(-1)).toBeNull();
      expect(decodeSyntheticLocationLinkId(-2.5)).toBeNull();
      expect(decodeSyntheticLocationLinkId(Number.NaN)).toBeNull();
    });
  });

  describe('findSyntheticLocationLinks', () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');

    it('turns activity and lodging locationId values into OCCURRED_AT links', async () => {
      mockPrisma.activity.findMany.mockResolvedValue([{ id: 3, tripId: 9, locationId: 20, createdAt }]);
      mockPrisma.lodging.findMany.mockResolvedValue([{ id: 4, tripId: 9, locationId: 21, createdAt }]);

      const links = await findSyntheticLocationLinks(9);

      expect(mockPrisma.activity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tripId: 9, locationId: { not: null } } })
      );
      expect(links).toEqual([
        expect.objectContaining({ id: -6, tripId: 9, sourceType: 'ACTIVITY', sourceId: 3, targetType: 'LOCATION', targetId: 20, relationship: 'OCCURRED_AT', sortOrder: null, notes: null }),
        expect.objectContaining({ id: -9, tripId: 9, sourceType: 'LODGING', sourceId: 4, targetType: 'LOCATION', targetId: 21, relationship: 'OCCURRED_AT' }),
      ]);
    });

    it('narrows to a single entity and queries only its table', async () => {
      mockPrisma.lodging.findMany.mockResolvedValue([{ id: 4, tripId: 9, locationId: 21, createdAt }]);

      const links = await findSyntheticLocationLinks(9, { entity: { type: 'LODGING', id: 4 } });

      expect(mockPrisma.activity.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.lodging.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tripId: 9, locationId: { not: null }, id: 4 } })
      );
      expect(links).toHaveLength(1);
      expect(links[0].sourceType).toBe('LODGING');
    });

    it('narrows to one location', async () => {
      await findSyntheticLocationLinks(9, { locationId: 20 });

      expect(mockPrisma.activity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tripId: 9, locationId: 20 } })
      );
      expect(mockPrisma.lodging.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tripId: 9, locationId: 20 } })
      );
    });
  });
});
