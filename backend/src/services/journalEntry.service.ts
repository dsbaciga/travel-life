import prisma from '../config/database';
import {
  CreateJournalEntryInput,
  UpdateJournalEntryInput,
} from '../types/journalEntry.types';
import { verifyTripAccessWithPermission, verifyEntityAccessWithPermission, buildConditionalUpdateData, convertDecimals, cleanupEntityLinks } from '../utils/serviceHelpers';
import { fromZonedTime } from 'date-fns-tz';
import { parseISO } from 'date-fns';

class JournalEntryService {
  async createJournalEntry(userId: number, data: CreateJournalEntryInput) {
    // Verify user has edit permission on the trip and get trip timezone
    const { trip } = await verifyTripAccessWithPermission(userId, data.tripId, 'edit');

    // Fetch full trip details including timezone
    const fullTrip = await prisma.trip.findUnique({
      where: { id: trip.id },
      select: { timezone: true },
    });

    // Parse entry date with trip timezone
    let entryDate: Date;
    if (data.entryDate) {
      // If trip has timezone, convert from that timezone to UTC for storage
      if (fullTrip?.timezone) {
        try {
          // Parse the ISO string and interpret it as being in the trip's timezone
          const parsedDate = parseISO(data.entryDate);
          entryDate = fromZonedTime(parsedDate, fullTrip.timezone);
        } catch (error) {
          console.error('Error parsing date with timezone:', error);
          entryDate = new Date(data.entryDate);
        }
      } else {
        entryDate = new Date(data.entryDate);
      }
    } else {
      entryDate = new Date();
    }

    const journalEntry = await prisma.journalEntry.create({
      data: {
        tripId: data.tripId,
        title: data.title || null,
        content: data.content,
        date: entryDate,
        entryType: data.entryType || 'daily',
      },
    });

    return convertDecimals(journalEntry);
  }

  async getJournalEntriesByTrip(userId: number, tripId: number) {
    // Verify user has view permission on the trip
    await verifyTripAccessWithPermission(userId, tripId, 'view');

    const entries = await prisma.journalEntry.findMany({
      where: { tripId },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    return convertDecimals(entries);
  }

  async getJournalEntryById(userId: number, entryId: number) {
    // Verify user has view permission on the journal entry's trip
    await verifyEntityAccessWithPermission('journalEntry', entryId, userId, 'view');

    const entry = await prisma.journalEntry.findUnique({
      where: { id: entryId },
      include: {
        trip: true,
      },
    });

    return convertDecimals(entry);
  }

  async updateJournalEntry(
    userId: number,
    entryId: number,
    data: UpdateJournalEntryInput
  ) {
    // Verify user has edit permission on the journal entry's trip
    await verifyEntityAccessWithPermission('journalEntry', entryId, userId, 'edit');

    const entry = await prisma.journalEntry.findUnique({
      where: { id: entryId },
      include: { trip: true },
    });

    // Create date transformer that handles timezone conversion
    const entryDateTransformer = (dateStr: string | null) => {
      if (!dateStr) return null;

      // Parse date with trip timezone if available
      if (entry?.trip?.timezone) {
        try {
          const parsedDate = parseISO(dateStr);
          return fromZonedTime(parsedDate, entry.trip.timezone);
        } catch (error) {
          console.error('Error parsing date with timezone:', error);
          return new Date(dateStr);
        }
      } else {
        return new Date(dateStr);
      }
    };

    // Extract only the fields that are valid for JournalEntry model
    const { title, content, entryDate } = data;
    const updateData = buildConditionalUpdateData(
      { title, content, date: entryDate },
      {
        transformers: {
          title: (val) => val || null,
          date: entryDateTransformer,
        },
      }
    );

    const updatedEntry = await prisma.journalEntry.update({
      where: { id: entryId },
      data: updateData,
    });

    return convertDecimals(updatedEntry);
  }

  async deleteJournalEntry(userId: number, entryId: number) {
    // Verify user has edit permission on the journal entry's trip
    const { entity: entry } = await verifyEntityAccessWithPermission<{ tripId: number }>(
      'journalEntry',
      entryId,
      userId,
      'edit'
    );

    // Clean up entity links and delete atomically in a transaction
    await prisma.$transaction(async (tx) => {
      await cleanupEntityLinks(entry.tripId, 'JOURNAL_ENTRY', entryId, tx);
      await tx.journalEntry.delete({
        where: { id: entryId },
      });
    });

    return { success: true };
  }
}

export default new JournalEntryService();
