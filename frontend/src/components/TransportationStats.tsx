import type {
  Transportation,
  TransportationType,
} from "../types/transportation";

interface TransportationStatsProps {
  transportation: Transportation[];
}

interface TypeStats {
  count: number;
  distance: number;
  duration: number;
}

export default function TransportationStats({
  transportation,
}: TransportationStatsProps) {
  if (transportation.length === 0) {
    return null;
  }

  // Group transportation by type and calculate stats
  const statsByType = new Map<
    TransportationType,
    TypeStats & { upcoming: number; completed: number }
  >();

  transportation.forEach((t) => {
    const existing = statsByType.get(t.type) || {
      count: 0,
      distance: 0,
      duration: 0,
      upcoming: 0,
      completed: 0,
    };

    existing.count++;

    // Track upcoming vs completed
    if (t.isUpcoming) {
      existing.upcoming++;
    } else {
      existing.completed++;
    }

    // Calculate distance (prefer calculated route distance, fallback to Haversine)
    if (t.calculatedDistance) {
      existing.distance += t.calculatedDistance;
    } else if (t.route) {
      const distance = calculateDistance(
        t.route.from.latitude,
        t.route.from.longitude,
        t.route.to.latitude,
        t.route.to.longitude
      );
      existing.distance += distance;
    }

    if (t.durationMinutes) {
      existing.duration += t.durationMinutes;
    }

    statsByType.set(t.type, existing);
  });

  // Calculate flight-specific statistics
  const flights = transportation.filter((t) => t.type === "flight");
  const flightStats = statsByType.get("flight");
  const carriers = new Set(
    flights.filter((t) => t.carrier).map((t) => t.carrier!)
  );

  const formatDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0 && mins > 0) {
      return `${hours}h ${mins}m`;
    } else if (hours > 0) {
      return `${hours}h`;
    } else {
      return `${mins}m`;
    }
  };

  const getTypeLabel = (type: TransportationType): string => {
    const labels: Record<TransportationType, string> = {
      flight: "Flight",
      train: "Train",
      bus: "Bus",
      car: "Car",
      ferry: "Ferry",
      bicycle: "Bicycle",
      walk: "Walk",
      other: "Other",
    };
    return labels[type];
  };

  const getTypeIcon = (type: TransportationType): string => {
    const icons: Record<TransportationType, string> = {
      flight: "✈️",
      train: "🚆",
      bus: "🚌",
      car: "🚗",
      ferry: "⛴️",
      bicycle: "🚴",
      walk: "🚶",
      other: "🚊",
    };
    return icons[type];
  };

  // Only show stats if there's at least one transportation entry
  if (statsByType.size === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Flight Statistics (if any flights exist) */}
      {flightStats && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Flight Statistics
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 mb-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                {flightStats.count}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Total Flights
              </div>
            </div>

            <div className="text-center">
              <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                {flightStats.upcoming}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Upcoming
              </div>
            </div>

            <div className="text-center">
              <div className="text-3xl font-bold text-gray-600 dark:text-gray-400">
                {flightStats.completed}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Completed
              </div>
            </div>

            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                {carriers.size}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Airlines
              </div>
            </div>
          </div>

          {flightStats.distance > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Total Distance
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {Math.round(flightStats.distance).toLocaleString()} km
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {Math.round(flightStats.distance * 0.621371).toLocaleString()}{" "}
                  miles
                  {flights.some((t) => t.distanceSource === "route") && (
                    <span className="ml-2 text-green-600 dark:text-green-400">
                      • Route-based
                    </span>
                  )}
                </div>
              </div>

              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Total Flight Time
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatDuration(flightStats.duration)}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {Math.round(flightStats.duration / 60)} hours
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Other Transportation Statistics */}
      {Array.from(statsByType.entries())
        .filter(([type]) => type !== "flight")
        .map(([type, stats]) => (
          <div
            key={type}
            className="bg-white dark:bg-gray-800 rounded-lg shadow p-6"
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <span>{getTypeIcon(type)}</span>
              <span>{getTypeLabel(type)} Statistics</span>
            </h3>

            <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                  {stats.count}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Total Trips
                </div>
              </div>

              <div className="text-center">
                <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                  {stats.upcoming}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Upcoming
                </div>
              </div>

              <div className="text-center">
                <div className="text-3xl font-bold text-gray-600 dark:text-gray-400">
                  {stats.completed}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Completed
                </div>
              </div>
            </div>

            {(stats.distance > 0 || stats.duration > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {stats.distance > 0 && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                      Total Distance
                    </div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      {Math.round(stats.distance).toLocaleString()} km
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {Math.round(stats.distance * 0.621371).toLocaleString()}{" "}
                      miles
                    </div>
                  </div>
                )}

                {stats.duration > 0 && (
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                      Total Travel Time
                    </div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      {formatDuration(stats.duration)}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {Math.round(stats.duration / 60)} hours
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
    </div>
  );
}

// Haversine formula to calculate distance between two coordinates
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
