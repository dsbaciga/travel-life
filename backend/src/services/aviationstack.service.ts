import prisma from '../config/database';
import { AppError } from '../utils/errors';
import config from '../config';
import axios, { AxiosRequestConfig } from 'axios';
import { verifyTripAccess } from '../utils/serviceHelpers';
import { isAxiosError } from '../types/prisma-helpers';

/**
 * AviationStack API Response Types
 * Documentation: https://aviationstack.com/documentation
 */
interface AviationstackFlight {
  flight_date: string;
  flight_status: 'scheduled' | 'active' | 'landed' | 'cancelled' | 'incident' | 'diverted';
  departure: {
    airport: string;
    timezone: string;
    iata: string;
    icao: string;
    terminal: string | null;
    gate: string | null;
    delay: number | null;
    scheduled: string;
    estimated: string | null;
    actual: string | null;
    estimated_runway: string | null;
    actual_runway: string | null;
  };
  arrival: {
    airport: string;
    timezone: string;
    iata: string;
    icao: string;
    terminal: string | null;
    gate: string | null;
    baggage: string | null;
    delay: number | null;
    scheduled: string;
    estimated: string | null;
    actual: string | null;
    estimated_runway: string | null;
    actual_runway: string | null;
  };
  airline: {
    name: string;
    iata: string;
    icao: string;
  };
  flight: {
    number: string;
    iata: string;
    icao: string;
    codeshared: {
      airline_name: string;
      airline_iata: string;
      airline_icao: string;
      flight_number: string;
      flight_iata: string;
      flight_icao: string;
    } | null;
  };
  aircraft: {
    registration: string;
    iata: string;
    icao: string;
    icao24: string;
  } | null;
  live: {
    updated: string;
    latitude: number;
    longitude: number;
    altitude: number;
    direction: number;
    speed_horizontal: number;
    speed_vertical: number;
    is_ground: boolean;
  } | null;
}

interface AviationstackResponse {
  pagination: {
    limit: number;
    offset: number;
    count: number;
    total: number;
  };
  data: AviationstackFlight[];
}

interface FlightTrackingResult {
  id: number;
  transportationId: number;
  flightNumber: string | null;
  airlineCode: string | null;
  status: string | null;
  gate: string | null;
  terminal: string | null;
  baggageClaim: string | null;
  departureDelay: number | null;
  arrivalDelay: number | null;
  scheduledDeparture: Date | null;
  actualDeparture: Date | null;
  scheduledArrival: Date | null;
  actualArrival: Date | null;
  lastUpdatedAt: Date;
  createdAt: Date;
}

class AviationstackService {
  private readonly API_KEY = config.aviationStack.apiKey;
  // Note: AviationStack free tier only supports HTTP. HTTPS requires paid subscription.
  // The API key is sent as query parameter (required by AviationStack API design).
  // SECURITY: Using HTTPS by default. If changed to HTTP for free tier, the API key
  // will be transmitted in the clear. Prefer HTTPS (paid tier) for production use.
  private readonly BASE_URL = 'https://api.aviationstack.com/v1';
  private readonly CACHE_MINUTES = 15; // Cache flight data for 15 minutes

  /**
   * Get flight tracking data for a transportation record
   * Returns cached data if available and fresh, otherwise fetches from API
   */
  async getFlightStatus(
    userId: number,
    transportationId: number
  ): Promise<FlightTrackingResult | null> {
    // Get transportation with trip info to verify access
    const transportation = await prisma.transportation.findUnique({
      where: { id: transportationId },
      include: {
        trip: {
          include: {
            user: {
              select: {
                aviationstackApiKey: true,
              },
            },
          },
        },
        flightTracking: true,
      },
    });

    if (!transportation) {
      throw new AppError('Transportation not found', 404);
    }

    // Verify user has access to this trip
    await verifyTripAccess(userId, transportation.tripId);

    // Only track flights
    if (transportation.type.toLowerCase() !== 'flight') {
      return null;
    }

    // Get API key (user's key or system key)
    const apiKey = transportation.trip.user.aviationstackApiKey || this.API_KEY;

    if (!apiKey) {
      // No API key available - return existing cached data or null
      if (transportation.flightTracking) {
        return this.mapFlightTrackingToResult(transportation.flightTracking);
      }
      return null;
    }

    // Check if we have fresh cached data
    if (transportation.flightTracking) {
      const cached = transportation.flightTracking;
      const minutesSinceUpdate =
        (Date.now() - cached.lastUpdatedAt.getTime()) / (1000 * 60);

      // Use cached data if it's fresh enough
      // For completed flights, cache indefinitely
      if (
        cached.status === 'landed' ||
        cached.status === 'cancelled' ||
        minutesSinceUpdate < this.CACHE_MINUTES
      ) {
        return this.mapFlightTrackingToResult(cached);
      }
    }

    // Extract flight number from transportation
    const flightNumber = this.extractFlightNumber(transportation);
    if (!flightNumber) {
      // No flight number to track
      return transportation.flightTracking
        ? this.mapFlightTrackingToResult(transportation.flightTracking)
        : null;
    }

    // Fetch fresh data from API
    try {
      const flightData = await this.fetchFlightFromAPI(
        flightNumber,
        transportation.scheduledStart,
        apiKey
      );

      if (!flightData) {
        // Flight not found in API - return existing cached data
        if (transportation.flightTracking) {
          return this.mapFlightTrackingToResult(transportation.flightTracking);
        }
        return null;
      }

      // Update or create flight tracking record
      const flightTracking = await this.upsertFlightTracking(
        transportationId,
        flightData
      );

      return this.mapFlightTrackingToResult(flightTracking);
    } catch (error) {
      console.error('Failed to fetch flight status:', error);
      // Return cached data if available
      if (transportation.flightTracking) {
        return this.mapFlightTrackingToResult(transportation.flightTracking);
      }
      throw error;
    }
  }

  /**
   * Refresh flight status for all flights in a trip
   */
  async refreshFlightsForTrip(
    userId: number,
    tripId: number
  ): Promise<FlightTrackingResult[]> {
    // Verify user has access
    await verifyTripAccess(userId, tripId);

    // Get all flight transportations for this trip (case-insensitive)
    const transportations = await prisma.transportation.findMany({
      where: {
        tripId,
        type: { equals: 'flight', mode: 'insensitive' },
      },
      select: { id: true },
    });

    const results: FlightTrackingResult[] = [];

    for (const transport of transportations) {
      try {
        const result = await this.getFlightStatus(userId, transport.id);
        if (result) {
          results.push(result);
        }
      } catch (error) {
        console.error(
          `Failed to refresh flight status for transportation ${transport.id}:`,
          error
        );
      }
    }

    return results;
  }

  /**
   * Manually update flight tracking info (for when user knows current status)
   */
  async updateFlightTracking(
    userId: number,
    transportationId: number,
    data: {
      flightNumber?: string | null;
      airlineCode?: string | null;
      gate?: string | null;
      terminal?: string | null;
      baggageClaim?: string | null;
      status?: string | null;
    }
  ): Promise<FlightTrackingResult> {
    // Verify access
    const transportation = await prisma.transportation.findUnique({
      where: { id: transportationId },
      include: { trip: true },
    });

    if (!transportation) {
      throw new AppError('Transportation not found', 404);
    }

    await verifyTripAccess(userId, transportation.tripId);

    // Upsert flight tracking
    const flightTracking = await prisma.flightTracking.upsert({
      where: { transportationId },
      create: {
        transportationId,
        flightNumber: data.flightNumber || null,
        airlineCode: data.airlineCode || null,
        gate: data.gate || null,
        terminal: data.terminal || null,
        baggageClaim: data.baggageClaim || null,
        status: data.status || null,
        lastUpdatedAt: new Date(),
      },
      update: {
        flightNumber: data.flightNumber !== undefined ? data.flightNumber : undefined,
        airlineCode: data.airlineCode !== undefined ? data.airlineCode : undefined,
        gate: data.gate !== undefined ? data.gate : undefined,
        terminal: data.terminal !== undefined ? data.terminal : undefined,
        baggageClaim: data.baggageClaim !== undefined ? data.baggageClaim : undefined,
        status: data.status !== undefined ? data.status : undefined,
        lastUpdatedAt: new Date(),
      },
    });

    const result = this.mapFlightTrackingToResult(flightTracking);
    if (!result) {
      throw new AppError('Failed to map flight tracking data', 500);
    }
    return result;
  }

  /**
   * Extract flight number from transportation record
   * Tries referenceNumber (vehicleNumber) first, then company + referenceNumber
   */
  private extractFlightNumber(transportation: {
    referenceNumber: string | null;
    company: string | null;
  }): string | null {
    if (!transportation.referenceNumber) {
      return null;
    }

    // Clean up the reference number
    const refNum = transportation.referenceNumber.trim().toUpperCase();

    // If it already looks like a flight number (e.g., "UA123", "AA1234")
    if (/^[A-Z]{2,3}\d{1,4}[A-Z]?$/.test(refNum)) {
      return refNum;
    }

    // If we have a carrier and a numeric reference, combine them
    if (transportation.company && /^\d{1,4}[A-Z]?$/.test(refNum)) {
      // Try to get IATA code from carrier name (simplified mapping)
      const carrierCode = this.getCarrierCode(transportation.company);
      if (carrierCode) {
        return `${carrierCode}${refNum}`;
      }
    }

    // Return as-is if it might be a valid flight number
    if (/^[A-Z0-9]{2,7}$/.test(refNum)) {
      return refNum;
    }

    return null;
  }

  /**
   * Simple carrier name to IATA code mapping
   */
  private getCarrierCode(carrierName: string): string | null {
    const name = carrierName.toLowerCase().trim();

    const carriers: Record<string, string> = {
      'united': 'UA',
      'united airlines': 'UA',
      'american': 'AA',
      'american airlines': 'AA',
      'delta': 'DL',
      'delta air lines': 'DL',
      'southwest': 'WN',
      'southwest airlines': 'WN',
      'jetblue': 'B6',
      'alaska': 'AS',
      'alaska airlines': 'AS',
      'spirit': 'NK',
      'frontier': 'F9',
      'british airways': 'BA',
      'lufthansa': 'LH',
      'air france': 'AF',
      'klm': 'KL',
      'emirates': 'EK',
      'qatar': 'QR',
      'qatar airways': 'QR',
      'singapore airlines': 'SQ',
      'cathay pacific': 'CX',
      'qantas': 'QF',
      'air canada': 'AC',
      'ana': 'NH',
      'jal': 'JL',
      'japan airlines': 'JL',
    };

    return carriers[name] || null;
  }

  /**
   * Fetch flight data from AviationStack API
   */
  private async fetchFlightFromAPI(
    flightNumber: string,
    flightDate: Date | null,
    apiKey: string
  ): Promise<AviationstackFlight | null> {
    try {
      const params: Record<string, string> = {
        access_key: apiKey,
        flight_iata: flightNumber,
      };

      // Add flight date if available (format: YYYY-MM-DD)
      if (flightDate) {
        params.flight_date = flightDate.toISOString().split('T')[0];
      }

      const response = await this.fetchWithRetry(`${this.BASE_URL}/flights`, {
        params,
      });

      if (!response.data || response.data.length === 0) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[AviationStack] No flight found for ${flightNumber}`);
        }
        return null;
      }

      // Find flight that matches our requested flight number
      // API may return multiple flights, so verify we got the right one
      const normalizedRequestedNumber = flightNumber.toUpperCase().replace(/\s/g, '');
      const flight = response.data.find(f => {
        const flightIata = f.flight.iata?.toUpperCase().replace(/\s/g, '') || '';
        const flightIcao = f.flight.icao?.toUpperCase().replace(/\s/g, '') || '';
        return flightIata === normalizedRequestedNumber || flightIcao === normalizedRequestedNumber;
      }) || response.data[0]; // Fallback to first result if no exact match

      if (process.env.NODE_ENV === 'development') {
        console.log(`[AviationStack] Found flight ${flightNumber}:`, {
          status: flight.flight_status,
          departure: flight.departure.airport,
          arrival: flight.arrival.airport,
          gate: flight.departure.gate,
          terminal: flight.departure.terminal,
        });
      }

      return flight;
    } catch (error) {
      if (isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new AppError('Invalid AviationStack API key', 401);
        }
        if (error.response?.status === 104) {
          // Monthly limit reached
          console.warn('[AviationStack] API monthly limit reached');
          return null;
        }
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
          console.warn('[AviationStack] Request timed out');
          return null;
        }
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
          console.warn('[AviationStack] Network error - API unreachable');
          return null;
        }
        // Log other axios errors without sensitive data
        console.error(`[AviationStack] API error: ${error.response?.status || 'unknown'}`);
      }
      throw error;
    }
  }

  /**
   * Update or create flight tracking record in database
   */
  private async upsertFlightTracking(
    transportationId: number,
    flightData: AviationstackFlight
  ) {
    const data = {
      flightNumber: flightData.flight.iata,
      airlineCode: flightData.airline.iata,
      status: flightData.flight_status,
      gate: flightData.departure.gate,
      terminal: flightData.departure.terminal,
      baggageClaim: flightData.arrival.baggage,
      departureDelay: flightData.departure.delay,
      arrivalDelay: flightData.arrival.delay,
      scheduledDeparture: flightData.departure.scheduled
        ? new Date(flightData.departure.scheduled)
        : null,
      actualDeparture: flightData.departure.actual
        ? new Date(flightData.departure.actual)
        : null,
      scheduledArrival: flightData.arrival.scheduled
        ? new Date(flightData.arrival.scheduled)
        : null,
      actualArrival: flightData.arrival.actual
        ? new Date(flightData.arrival.actual)
        : null,
      lastUpdatedAt: new Date(),
    };

    return await prisma.flightTracking.upsert({
      where: { transportationId },
      create: {
        transportationId,
        ...data,
      },
      update: data,
    });
  }

  /**
   * Map Prisma FlightTracking to result type
   */
  private mapFlightTrackingToResult(
    flightTracking: Awaited<ReturnType<typeof prisma.flightTracking.findUnique>>
  ): FlightTrackingResult | null {
    if (!flightTracking) return null;

    return {
      id: flightTracking.id,
      transportationId: flightTracking.transportationId,
      flightNumber: flightTracking.flightNumber,
      airlineCode: flightTracking.airlineCode,
      status: flightTracking.status,
      gate: flightTracking.gate,
      terminal: flightTracking.terminal,
      baggageClaim: flightTracking.baggageClaim,
      departureDelay: flightTracking.departureDelay,
      arrivalDelay: flightTracking.arrivalDelay,
      scheduledDeparture: flightTracking.scheduledDeparture,
      actualDeparture: flightTracking.actualDeparture,
      scheduledArrival: flightTracking.scheduledArrival,
      actualArrival: flightTracking.actualArrival,
      lastUpdatedAt: flightTracking.lastUpdatedAt,
      createdAt: flightTracking.createdAt,
    };
  }

  /**
   * Fetch with retry for rate limiting
   */
  private async fetchWithRetry(
    url: string,
    requestConfig: AxiosRequestConfig,
    retries = 3
  ): Promise<AviationstackResponse> {
    try {
      const response = await axios.get<AviationstackResponse>(url, requestConfig);
      return response.data;
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 429 && retries > 0) {
        // Rate limited, wait and retry
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return this.fetchWithRetry(url, requestConfig, retries - 1);
      }
      throw error;
    }
  }
}

export default new AviationstackService();
