import prisma from '../config/database';
import { AppError } from '../errors/errors';
import { CreateTripSeriesInput, UpdateTripSeriesInput } from '../types/tripSeries.types';
import { convertDecimals } from '../services/_shared/decimalConversion';

export class TripSeriesService {
  /**
   * Verify that a series belongs to the given user
   */
  private async checkOwnership(userId: number, seriesId: number) {
    const series = await prisma.tripSeries.findFirst({
      where: { id: seriesId, userId },
    });
    if (!series) {
      throw new AppError("We couldn't find that trip series.", 404);
    }
    return series;
  }

  /**
   * Re-number all trips in a series sequentially (1, 2, 3...)
   */
  private async normalizeSeriesOrder(seriesId: number) {
    const trips = await prisma.trip.findMany({
      where: { seriesId },
      orderBy: { seriesOrder: 'asc' },
      select: { id: true },
    });

    await prisma.$transaction(
      trips.map((trip, index) =>
        prisma.trip.update({
          where: { id: trip.id },
          data: { seriesOrder: index + 1 },
        })
      )
    );
  }

  /**
   * Create a new trip series
   */
  async create(userId: number, data: CreateTripSeriesInput) {
    const series = await prisma.tripSeries.create({
      data: {
        userId,
        name: data.name,
        description: data.description || null,
      },
      include: {
        _count: {
          select: { trips: true },
        },
      },
    });

    return series;
  }

  /**
   * Get all series for a user with trip count and date range
   */
  async getAll(userId: number) {
    const seriesList = await prisma.tripSeries.findMany({
      where: { userId },
      include: {
        _count: {
          select: { trips: true },
        },
        trips: {
          select: {
            id: true,
            title: true,
            startDate: true,
            endDate: true,
            status: true,
            seriesOrder: true,
          },
          orderBy: { seriesOrder: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return seriesList.map((series) => {
      const tripDates = series.trips
        .map((t) => t.startDate)
        .filter((d): d is Date => d !== null)
        .sort((a, b) => a.getTime() - b.getTime());

      return {
        ...series,
        trips: series.trips.map((t) => convertDecimals(t)),
        earliestDate: tripDates.length > 0 ? tripDates[0] : null,
        latestDate: tripDates.length > 0 ? tripDates[tripDates.length - 1] : null,
      };
    });
  }

  /**
   * Get a series by ID with ordered trips and aggregate stats
   */
  async getById(userId: number, seriesId: number) {
    await this.checkOwnership(userId, seriesId);

    const series = await prisma.tripSeries.findUnique({
      where: { id: seriesId },
      include: {
        _count: {
          select: { trips: true },
        },
        trips: {
          orderBy: { seriesOrder: 'asc' },
          include: {
            coverPhoto: true,
            tagAssignments: {
              include: {
                tag: true,
              },
            },
            _count: {
              select: {
                locations: true,
                photos: true,
                transportation: true,
                activities: true,
                lodging: true,
                journalEntries: true,
              },
            },
          },
        },
      },
    });

    if (!series) {
      throw new AppError("We couldn't find that trip series.", 404);
    }

    return {
      ...series,
      trips: series.trips.map((t) => convertDecimals(t)),
    };
  }

  /**
   * Update series name/description
   */
  async update(userId: number, seriesId: number, data: UpdateTripSeriesInput) {
    await this.checkOwnership(userId, seriesId);

    const updated = await prisma.tripSeries.update({
      where: { id: seriesId },
      data: {
        name: data.name,
        description: data.description,
      },
      include: {
        _count: {
          select: { trips: true },
        },
      },
    });

    return updated;
  }

  /**
   * Delete a series (onDelete: SetNull handles trips)
   */
  async delete(userId: number, seriesId: number) {
    await this.checkOwnership(userId, seriesId);

    await prisma.tripSeries.delete({
      where: { id: seriesId },
    });

    return { message: 'Trip series deleted successfully' };
  }

  /**
   * Add a trip to a series at the next order position
   */
  async addTrip(userId: number, seriesId: number, tripId: number) {
    await this.checkOwnership(userId, seriesId);

    // Verify the trip belongs to the user
    const trip = await prisma.trip.findFirst({
      where: { id: tripId, userId },
    });
    if (!trip) {
      throw new AppError("We couldn't find that trip.", 404);
    }

    // Check if trip is already in this series
    if (trip.seriesId === seriesId) {
      throw new AppError('Trip is already in this series', 400);
    }

    // Get the next order position
    const maxOrder = await prisma.trip.aggregate({
      where: { seriesId },
      _max: { seriesOrder: true },
    });
    const nextOrder = (maxOrder._max.seriesOrder || 0) + 1;

    const updatedTrip = await prisma.trip.update({
      where: { id: tripId },
      data: {
        seriesId,
        seriesOrder: nextOrder,
      },
      include: {
        series: {
          select: { id: true, name: true },
        },
      },
    });

    return convertDecimals(updatedTrip);
  }

  /**
   * Remove a trip from a series
   */
  async removeTrip(userId: number, seriesId: number, tripId: number) {
    await this.checkOwnership(userId, seriesId);

    // Verify the trip belongs to this series
    const trip = await prisma.trip.findFirst({
      where: { id: tripId, userId, seriesId },
    });
    if (!trip) {
      throw new AppError("That trip isn't in this series.", 404);
    }

    await prisma.trip.update({
      where: { id: tripId },
      data: {
        seriesId: null,
        seriesOrder: null,
      },
    });

    // Normalize remaining trip order
    await this.normalizeSeriesOrder(seriesId);

    return { message: 'Trip removed from series' };
  }

  /**
   * Reorder trips in a series
   */
  async reorderTrips(userId: number, seriesId: number, tripIds: number[]) {
    await this.checkOwnership(userId, seriesId);

    // Validate all trip IDs belong to this series
    const seriesTrips = await prisma.trip.findMany({
      where: { seriesId },
      select: { id: true },
    });
    const seriesTripIds = new Set(seriesTrips.map((t) => t.id));

    for (const tripId of tripIds) {
      if (!seriesTripIds.has(tripId)) {
        throw new AppError(`Trip ${tripId} does not belong to this series`, 400);
      }
    }

    // Verify all series trips are accounted for
    if (tripIds.length !== seriesTrips.length) {
      throw new AppError('Include every trip in the series when you reorder.', 400);
    }

    // Update order atomically
    await prisma.$transaction(
      tripIds.map((tripId, index) =>
        prisma.trip.update({
          where: { id: tripId },
          data: { seriesOrder: index + 1 },
        })
      )
    );

    return { message: 'Trips reordered successfully' };
  }
}

export default new TripSeriesService();
