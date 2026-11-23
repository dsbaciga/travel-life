import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { TripLanguage, AddTripLanguage } from '../types/languagePhrase.types';

class TripLanguageService {
  /**
   * Get all languages selected for a trip
   */
  async getLanguagesForTrip(tripId: number, userId: number): Promise<TripLanguage[]> {
    // Verify trip ownership or collaboration
    const trip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        OR: [
          { userId },
          { collaborators: { some: { userId } } },
        ],
      },
    });

    if (!trip) {
      throw new AppError("We couldn't find that trip, or you don't have access to it.", 404);
    }

    const languages = await prisma.tripLanguage.findMany({
      where: { tripId },
      orderBy: { id: 'asc' },
    });

    return languages;
  }

  /**
   * Add a language to a trip
   */
  async addLanguageToTrip(
    tripId: number,
    userId: number,
    data: AddTripLanguage
  ): Promise<TripLanguage> {
    // Verify trip ownership or edit permission
    const trip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        OR: [
          { userId },
          { collaborators: { some: { userId, permissionLevel: { in: ['edit', 'admin'] } } } },
        ],
      },
    });

    if (!trip) {
      throw new AppError("We couldn't find that trip, or you don't have access to it.", 404);
    }

    // Check if language already exists for this trip
    const existing = await prisma.tripLanguage.findUnique({
      where: {
        tripId_languageCode: {
          tripId,
          languageCode: data.languageCode,
        },
      },
    });

    if (existing) {
      throw new AppError('Language already added to this trip', 400);
    }

    const language = await prisma.tripLanguage.create({
      data: {
        tripId,
        languageCode: data.languageCode,
        language: data.language,
      },
    });

    return language;
  }

  /**
   * Remove a language from a trip
   */
  async removeLanguageFromTrip(
    tripId: number,
    userId: number,
    languageCode: string
  ): Promise<void> {
    // Verify trip ownership or edit permission
    const trip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        OR: [
          { userId },
          { collaborators: { some: { userId, permissionLevel: { in: ['edit', 'admin'] } } } },
        ],
      },
    });

    if (!trip) {
      throw new AppError("We couldn't find that trip, or you don't have access to it.", 404);
    }

    // Find and delete the language
    const language = await prisma.tripLanguage.findUnique({
      where: {
        tripId_languageCode: {
          tripId,
          languageCode,
        },
      },
    });

    if (!language) {
      throw new AppError("That language isn't on this trip.", 404);
    }

    await prisma.tripLanguage.delete({
      where: { id: language.id },
    });
  }
}

export default new TripLanguageService();
