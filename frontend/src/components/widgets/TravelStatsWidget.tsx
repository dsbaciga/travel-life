/**
 * TravelStatsWidget - Shows travel statistics at a glance
 */

import Icon from '../ui/Icon';
import { useState, useEffect } from 'react';
import tripService from '../../services/trip.service';
import photoService from '../../services/photo.service';
import locationService from '../../services/location.service';
import transportationService from '../../services/transportation.service';
import toast from 'react-hot-toast';
import { Skeleton } from '../Skeleton';
import { useUnits } from '../../hooks/useUnits';
import { distanceValue, distanceUnitLabel, otherMeasurementSystem } from '../../utils/units';

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
  const { system } = useUnits();
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

      // Every per-trip request below is independent, so they all go out at once
      // rather than one await at a time: this used to be three sequential loops
      // (3 x trip count round-trips in series) and the dashboard waited for all
      // of them before painting.
      //
      // `orEmpty` keeps the old per-request tolerance — a single trip's failed
      // request contributes nothing instead of rejecting the whole batch, which
      // is what the per-iteration try/catch did before.
      const orEmpty = <T,>(request: Promise<T>, fallback: T): Promise<T> =>
        request.catch(() => fallback);

      const [photoTotals, locationsPerTrip, transportationPerTrip] = await Promise.all([
        Promise.all(
          trips.map((trip) =>
            orEmpty(
              photoService
                .getPhotosByTrip(trip.id, { skip: 0, take: 1 })
                // `?? 0`: a resolved response missing `total` would make the
                // running total NaN and the tile would render the literal
                // string "NaN" instead of a number.
                .then((response) => response.total ?? 0),
              0
            )
          )
        ),
        Promise.all(
          trips.map((trip) => orEmpty(locationService.getLocationsByTrip(trip.id), []))
        ),
        Promise.all(
          trips.map((trip) => orEmpty(transportationService.getTransportationByTrip(trip.id), []))
        ),
      ]);

      const photoCount = photoTotals.reduce((sum, total) => sum + total, 0);

      let locationCount = 0;
      const uniqueCountries = new Set<string>();
      for (const locations of locationsPerTrip) {
        locationCount += locations.length;

        // Extract countries from location addresses
        locations.forEach((location) => {
          if (location.address) {
            // Try to get country from address (typically last part after comma)
            const parts = location.address.split(',').map((p) => p.trim());
            if (parts.length > 0) {
              const potentialCountry = parts[parts.length - 1];
              if (potentialCountry.length > 0 && potentialCountry.length < 50) {
                uniqueCountries.add(potentialCountry);
              }
            }
          }
        });
      }

      let totalDistanceKm = 0;
      for (const transportation of transportationPerTrip) {
        transportation.forEach((trans) => {
          if (trans.calculatedDistance) {
            totalDistanceKm += Number(trans.calculatedDistance);
          }
        });
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

  // Compact ("1.2K mi") total in the given system; `km` is always kilometres.
  const compactDistance = (km: number, forSystem: typeof system): string => {
    const value = distanceValue(km, forSystem);
    const label = distanceUnitLabel(forSystem);
    return value < 1000 ? `${value.toFixed(0)} ${label}` : `${(value / 1000).toFixed(1)}K ${label}`;
  };
  const formatDistance = (km: number): string => compactDistance(km, system);
  const formatDistanceSubtext = (km: number): string => compactDistance(km, otherMeasurementSystem(system));

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
      icon: 'globe' as const,
      color: 'from-blue-500 to-blue-600',
      valueDisplay: stats.totalTrips.toLocaleString(),
    },
    {
      label: 'Photos Captured',
      value: stats.totalPhotos,
      icon: 'photo' as const,
      color: 'from-purple-500 to-purple-600',
      valueDisplay: stats.totalPhotos.toLocaleString(),
    },
    {
      label: 'Places Visited',
      value: stats.totalLocations,
      icon: 'place' as const,
      color: 'from-green-500 to-green-600',
      valueDisplay: stats.totalLocations.toLocaleString(),
    },
    {
      label: 'Countries',
      value: stats.countriesVisited,
      icon: 'flag' as const,
      color: 'from-orange-500 to-orange-600',
      valueDisplay: stats.countriesVisited.toLocaleString(),
    },
    {
      label: 'Distance Traveled',
      value: stats.totalDistanceKm,
      icon: 'route' as const,
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
          <Icon name="dashboard" className="w-6 h-6 text-white" />
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
                  <Icon name={stat.icon} size={16} />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-2xl font-bold text-gray-900 dark:text-white leading-none mb-1">
                  {stat.valueDisplay}
                </div>
                {stat.subtext && (
                  <div className="text-xs text-gray-500 dark:text-dusk-400 mb-0.5">
                    {stat.subtext}
                  </div>
                )}
                <div className="text-xs text-gray-600 dark:text-dusk-400 font-medium">
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
            <Icon name="spinner" className="animate-spin h-4 w-4" />
            Recalculating...
          </>
        ) : (
          <>
            <Icon name="refresh" className="w-4 h-4" />
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
                <span className="text-gray-700 dark:text-dusk-300">
                  <span className="font-semibold">{stats.inProgressTrips}</span> in progress
                </span>
              </div>
            )}
            {stats.plannedTrips > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-gray-700 dark:text-dusk-300">
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
