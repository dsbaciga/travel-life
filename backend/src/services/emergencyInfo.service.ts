import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { verifyTripAccessWithPermission } from './_shared/tripAccess';
import { buildConditionalUpdateData } from './_shared/prismaUpdateData';
import type { UpdateTripEmergencyInfoInput } from '../types/emergencyInfo.types';

/**
 * Emergency Card (feature #111).
 *
 * Serves the one payload the printable/offline card needs, in a single request:
 * the traveller-entered insurance and embassy details, the companions' medical
 * notes, and the raw location addresses the client uses to work out which
 * country's emergency numbers to print.
 *
 * Country *inference* is deliberately NOT done here. The stored override travels
 * with the payload as `countryCode` (from `Trip.countryCode`), but the lookup
 * table that turns a free-text address into an ISO code ships with the frontend
 * (`frontend/src/constants/countryFacts.ts`) precisely so the card still renders
 * when the device is offline and this endpoint is unreachable. Inferring on the
 * server would move that logic behind the network — the one place it must not be.
 */

/** A companion as it appears on the card. */
export interface EmergencyCardCompanion {
  id: number;
  name: string;
  relationship: string | null;
  phone: string | null;
  /** Null when the requester is not entitled to medical details — see below. */
  medicalNotes: string | null;
  allergies: string[];
  dietaryPreferences: string[];
}

/** The full card payload. */
export interface EmergencyCard {
  tripId: number;
  tripTitle: string;
  /**
   * The trip's stored ISO 3166-1 alpha-2 override, or null to derive one from
   * `locationAddresses`. Read from `Trip.countryCode`, the single column every
   * country-aware feature shares, so correcting the country here also corrects
   * the local-norms card.
   */
  countryCode: string | null;
  info: EmergencyInfoRecord | null;
  /**
   * Every location address on the trip, in creation order, so the client can run
   * its own address -> ISO country resolution and fall back through them.
   */
  locationAddresses: string[];
  /**
   * The structured `Location.countryCode` of every located place on the trip, in creation
   * order (locations with no code are skipped). The client prefers these over parsing
   * `locationAddresses`, which stays for rows that have no code.
   */
  locationCountryCodes: string[];
  companions: EmergencyCardCompanion[];
  /**
   * False when companion medical fields were withheld, so the UI can say
   * "ask the trip owner" instead of implying nobody has any allergies.
   */
  includesMedicalDetails: boolean;
}

/** The stored half of the card. Mirrors the `TripEmergencyInfo` row. */
export interface EmergencyInfoRecord {
  id: number;
  tripId: number;
  insuranceProvider: string | null;
  insurancePolicyNumber: string | null;
  insuranceAssistancePhone: string | null;
  embassyName: string | null;
  embassyPhone: string | null;
  embassyAddress: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Narrows a Prisma `Json` column to the string array it is supposed to hold.
 * The column is schemaless at the database level, so a row written before the
 * Zod schema existed (or by a restore) can legitimately contain anything;
 * dropping the non-strings is better on an emergency card than throwing.
 */
function toStringArray(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

class EmergencyInfoService {
  /**
   * Builds the emergency card for a trip.
   *
   * Requires `view`, like every other trip read. Companion medical notes and
   * allergies are additionally restricted to the trip **owner**: those records
   * belong to the owner's personal companion list (`TravelCompanion.userId`), and
   * a `view` collaborator may be a relative following the itinerary rather than
   * someone travelling. `includesMedicalDetails` tells the client which it got.
   *
   * @param userId - The authenticated user
   * @param tripId - The trip whose card is being built
   * @returns The card payload
   */
  async getEmergencyCard(userId: number, tripId: number): Promise<EmergencyCard> {
    const { trip, isOwner } = await verifyTripAccessWithPermission(userId, tripId, 'view');

    // `verifyTripAccessWithPermission` returns a deliberately narrow trip shape,
    // so the country override is fetched alongside the rest rather than by
    // widening a helper every other service depends on.
    const [tripCountry, info, locations, tripCompanions] = await Promise.all([
      prisma.trip.findUnique({ where: { id: tripId }, select: { countryCode: true } }),
      prisma.tripEmergencyInfo.findUnique({ where: { tripId } }),
      prisma.location.findMany({
        where: { tripId, OR: [{ address: { not: null } }, { countryCode: { not: null } }] },
        select: { address: true, countryCode: true },
        orderBy: { id: 'asc' },
      }),
      prisma.tripCompanion.findMany({
        where: { tripId },
        select: {
          companion: {
            select: {
              id: true,
              name: true,
              relationship: true,
              phone: true,
              medicalNotes: true,
              allergies: true,
              dietaryPreferences: true,
            },
          },
        },
        orderBy: { id: 'asc' },
      }),
    ]);

    const companions: EmergencyCardCompanion[] = tripCompanions.map(({ companion }) => ({
      id: companion.id,
      name: companion.name,
      relationship: companion.relationship,
      phone: companion.phone,
      medicalNotes: isOwner ? companion.medicalNotes : null,
      allergies: isOwner ? toStringArray(companion.allergies) : [],
      dietaryPreferences: isOwner ? toStringArray(companion.dietaryPreferences) : [],
    }));

    return {
      tripId,
      tripTitle: trip.title,
      countryCode: tripCountry?.countryCode ?? null,
      info,
      locationAddresses: locations
        .map((location) => location.address)
        .filter((address): address is string => Boolean(address)),
      locationCountryCodes: locations
        .map((location) => location.countryCode)
        .filter((code): code is string => Boolean(code)),
      companions,
      includesMedicalDetails: isOwner,
    };
  }

  /**
   * Creates or replaces the trip's emergency record.
   *
   * A per-trip singleton behind a single PUT: an absent field leaves the stored
   * value alone, an explicit `null` clears it. Requires `edit` — a policy number
   * and an assistance line are trip data, not settings, so `admin` would lock out
   * the collaborators most likely to be the ones on the ground.
   *
   * @param userId - The authenticated user
   * @param tripId - The trip to write against
   * @param data - Partial emergency details
   * @returns The stored record
   */
  async upsertEmergencyInfo(
    userId: number,
    tripId: number,
    data: UpdateTripEmergencyInfoInput
  ): Promise<EmergencyInfoRecord> {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');

    const updateData: Prisma.TripEmergencyInfoUncheckedUpdateInput =
      buildConditionalUpdateData(data);

    return prisma.tripEmergencyInfo.upsert({
      where: { tripId },
      // The create branch takes the same fields; anything the caller omitted is
      // simply absent, which Prisma writes as the column's NULL default.
      create: { tripId, ...buildConditionalUpdateData(data) },
      update: updateData,
    });
  }

  /**
   * Removes the trip's emergency record entirely.
   *
   * Idempotent: clearing a card that was never filled in is a no-op rather than a
   * 404, because the UI's "clear" button has no way to know whether a row exists.
   *
   * @param userId - The authenticated user
   * @param tripId - The trip to clear
   * @returns `{ success: true }`
   */
  async deleteEmergencyInfo(userId: number, tripId: number): Promise<{ success: true }> {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');

    await prisma.tripEmergencyInfo.deleteMany({ where: { tripId } });

    return { success: true };
  }
}

export default new EmergencyInfoService();
