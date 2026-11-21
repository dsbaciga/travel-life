import axios from 'axios';

export type GeocodingResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    road?: string;
    city?: string;
    state?: string;
    country?: string;
    /** ISO 3166-1 alpha-2, lower case (Nominatim, with addressdetails=1). */
    country_code?: string;
    postcode?: string;
  };
  type?: string;
  importance?: number;
};

/**
 * The geocoder's ISO 3166-1 alpha-2 country for a result, upper-cased, or undefined when the
 * result has none. Stored on `Location.countryCode`; the backend derives it from the address
 * text when the client cannot supply it.
 */
export function countryCodeFromGeocode(result: GeocodingResult | null | undefined): string | undefined {
  const code = result?.address?.country_code?.trim().toUpperCase();
  return code && /^[A-Z]{2}$/.test(code) ? code : undefined;
}

class GeocodingService {
  private baseUrl = 'https://nominatim.openstreetmap.org';

  async searchPlaces(query: string): Promise<GeocodingResult[]> {
    if (!query || query.trim().length < 3) {
      return [];
    }

    try {
      const response = await axios.get(`${this.baseUrl}/search`, {
        params: {
          q: query,
          format: 'json',
          addressdetails: 1,
          limit: 5,
        },
      });

      return response.data;
    } catch (error) {
      console.error('Geocoding search error:', error);
      return [];
    }
  }

  async reverseGeocode(lat: number, lon: number): Promise<GeocodingResult | null> {
    try {
      const response = await axios.get(`${this.baseUrl}/reverse`, {
        params: {
          lat,
          lon,
          format: 'json',
          addressdetails: 1,
        },
      });

      return response.data;
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      return null;
    }
  }
}

export default new GeocodingService();
