/**
 * TravelStatsWidget - Shows travel statistics at a glance
 */

import { useState, useEffect } from 'react';
import tripService from '../../services/trip.service';
import photoService from '../../services/photo.service';
import locationService from '../../services/location.service';
import transportationService from '../../services/transportation.service';
import toast from 'react-hot-toast';
import { Skeleton } from '../Skeleton';

interface Stats {
  totalTrips: number;
  totalPhotos: number;
  totalLocations: number;
  countriesVisited: number;
  inProgressTrips: number;
  plannedTrips: number;
  totalDistanceKm: number;
}

export default function TravelStatsWidget() {
  const [stats, setStats] = useState<Stats>({
    totalTrips: 0,
    totalPhotos: 0,
    totalLocations: 0,
    countriesVisited: 0,
    inProgressTrips: 0,
    plannedTrips: 0,
    totalDistanceKm: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRecalculating, setIsRecalculating] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      // Load trips
      const tripsResponse = await tripService.getTrips();
      const trips = tripsResponse.trips;

      // Count photos across all trips
      let photoCount = 0;
      for (const trip of trips) {
        try {
          const photosResponse = await photoService.getPhotosByTrip(trip.id, { skip: 0, take: 1 });
          // `?? 0`: the catch below only covers a rejected request. A resolved
          // response missing `total` would make photoCount NaN and the tile
          // would render the literal string "NaN" instead of a number.
          photoCount += photosResponse.total ?? 0;
        } catch {
          // Skip if fails
        }
      }

      // Count locations across all trips
      let locationCount = 0;
      const uniqueCountries = new Set<string>();
      for (const trip of trips) {
        try {
          const locations = await locationService.getLocationsByTrip(trip.id);
          locationCount += locations.length;

          // Extract countries from location addresses
          locations.forEach(location => {
            if (location.address) {
              // Try to get country from address (typically last part after comma)
              const parts = location.address.split(',').map(p => p.trim());
              if (parts.length > 0) {
                const potentialCountry = parts[parts.length - 1];
                if (potentialCountry.length > 0 && potentialCountry.length < 50) {
                  uniqueCountries.add(potentialCountry);
                }
              }
            }
          });
        } catch {
          // Skip if fails
        }
      }

      // Calculate total distance traveled across all trips
      let totalDistanceKm = 0;
      for (const trip of trips) {
        try {
          const transportation = await transportationService.getTransportationByTrip(trip.id);
          transportation.forEach(trans => {
            if (trans.calculatedDistance) {
              totalDistanceKm += Number(trans.calculatedDistance);
            }
          });
        } catch {
          // Skip if fails
        }
      }

      setStats({
        totalTrips: trips.length,
        totalPhotos: photoCount,
        totalLocations: locationCount,
        countriesVisited: uniqueCountries.size,
        inProgressTrips: trips.filter((t) => t.status === 'In Progress').length,
        plannedTrips: trips.filter((t) => t.status === 'Planned' || t.status === 'Planning').length,
        totalDistanceKm: totalDistanceKm,
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDistance = (km: number): string => {
    if (km < 1000) {
      return `${km.toFixed(0)} km`;
    }
    return `${(km / 1000).toFixed(1)}K km`;
  };

  const formatDistanceSubtext = (km: number): string => {
    const miles = km * 0.621371;
    if (miles < 1000) {
      return `${miles.toFixed(0)} mi`;
    }
    return `${(miles / 1000).toFixed(1)}K mi`;
  };

  const handleRecalculateDistances = async () => {
    setIsRecalculating(true);
    try {
      const tripsResponse = await tripService.getTrips();
      const trips = tripsResponse.trips;

      let totalRecalculated = 0;
      for (const trip of trips) {
        try {
          const result = await transportationService.recalculateDistancesForTrip(trip.id);
          totalRecalculated += result.count;
        } catch (error) {
          console.error(`Failed to recalculate distances for trip ${trip.id}:`, error);
        }
      }

      toast.success(`Recalculated distances for ${totalRecalculated} transportation entries`);

      // Reload stats to show updated distances
      await loadStats();
    } catch (error) {
      toast.error('Failed to recalculate distances');
      console.error('Recalculation error:', error);
    } finally {
      setIsRecalculating(false);
    }
  };

  const statItems = [
    {
      label: 'Total Trips',
      value: stats.totalTrips,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'from-blue-500 to-blue-600',
      valueDisplay: stats.totalTrips.toLocaleString(),
    },
    {
      label: 'Photos Captured',
      value: stats.totalPhotos,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      color: 'from-purple-500 to-purple-600',
      valueDisplay: stats.totalPhotos.toLocaleString(),
    },
    {
      label: 'Places Visited',
      value: stats.totalLocations,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        </svg>
      ),
      color: 'from-green-500 to-green-600',
      valueDisplay: stats.totalLocations.toLocaleString(),
    },
    {
      label: 'Countries',
      value: stats.countriesVisited,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'from-orange-500 to-orange-600',
      valueDisplay: stats.countriesVisited.toLocaleString(),
    },
    {
      label: 'Distance Traveled',
      value: stats.totalDistanceKm,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      color: 'from-cyan-500 to-cyan-600',
      valueDisplay: formatDistance(stats.totalDistanceKm),
      subtext: formatDistanceSubtext(stats.totalDistanceKm),
    },
  ];

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-navy-800 rounded-2xl p-6 shadow-lg border-2 border-primary-100 dark:border-gold/20">
        <div className="flex items-center gap-3 mb-6">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <Skeleton className="h-6 w-32 rounded" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-navy-800 rounded-2xl p-6 shadow-lg border-2 border-primary-100 dark:border-gold/20 hover:shadow-xl transition-shadow duration-300">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h3 className="text-xl font-display font-bold text-gray-900 dark:text-white">
          Travel Stats
        </h3>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        {statItems.map((stat) => (
          <div
            key={stat.label}
            className="p-3 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-navy-900/50 dark:to-navy-900/30 hover:scale-105 transition-transform duration-200"
          >
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-md flex-shrink-0`}>
                <div className="text-white">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {stat.icon.props.children}
                  </svg>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-2xl font-bold text-gray-900 dark:text-white leading-none mb-1">
                  {stat.valueDisplay}
                </div>
                {stat.subtext && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">
                    {stat.subtext}
                  </div>
                )}
                <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">
                  {stat.label}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recalculate Distances Button */}
      <button
        onClick={handleRecalculateDistances}
        disabled={isRecalculating}
        className="mt-4 w-full px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white font-medium text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isRecalculating ? (
          <>
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Recalculating...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Recalculate Distances
          </>
        )}
      </button>

      {/* Active Trips Summary */}
      {(stats.inProgressTrips > 0 || stats.plannedTrips > 0) && (
        <div className="mt-4 p-4 rounded-xl bg-primary-50 dark:bg-primary-900/10 border-2 border-primary-100 dark:border-primary-900/30">
          <div className="flex items-center justify-between text-sm">
            {stats.inProgressTrips > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-gray-700 dark:text-gray-300">
                  <span className="font-semibold">{stats.inProgressTrips}</span> in progress
                </span>
              </div>
            )}
            {stats.plannedTrips > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-gray-700 dark:text-gray-300">
                  <span className="font-semibold">{stats.plannedTrips}</span> planned
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
