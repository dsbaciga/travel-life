import Icon from './ui/Icon';
interface TripStatsProps {
  locationsCount: number;
  photosCount: number;
  activitiesCount: number;
  transportationCount: number;
  lodgingCount: number;
  journalCount: number;
  companionsCount: number;
  unscheduledCount: number;
  tripStartDate?: string | Date | null;
  tripEndDate?: string | Date | null;
  onNavigateToTab: (tab: string) => void;
}

export default function TripStats({
  locationsCount,
  photosCount,
  activitiesCount,
  transportationCount,
  lodgingCount,
  journalCount,
  companionsCount,
  unscheduledCount,
  tripStartDate,
  tripEndDate,
  onNavigateToTab,
}: TripStatsProps) {
  // Parse date string without UTC interpretation issues
  const parseDate = (dateInput: string | Date): Date => {
    if (dateInput instanceof Date) {
      return dateInput;
    }
    const datePart = dateInput.split('T')[0];
    const [year, month, day] = datePart.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  // Calculate trip duration
  const getTripDuration = (): string | null => {
    if (!tripStartDate || !tripEndDate) return null;
    const start = parseDate(tripStartDate);
    const end = parseDate(tripEndDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const totalDays = diffDays + 1;
    return `${totalDays} day${totalDays !== 1 ? "s" : ""}`;
  };

  const duration = getTripDuration();

  const statCards = [
    {
      label: "Places",
      value: locationsCount,
      icon: (
        <Icon name="place" className="w-6 h-6" />
      ),
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-50 dark:bg-blue-900/20",
      tab: "locations",
    },
    {
      label: "Photos",
      value: photosCount,
      icon: (
        <Icon name="photo" className="w-6 h-6" />
      ),
      color: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-50 dark:bg-purple-900/20",
      tab: "photos",
    },
    {
      label: "Activities",
      value: activitiesCount,
      icon: (
        <Icon name="activity" className="w-6 h-6" />
      ),
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-50 dark:bg-green-900/20",
      tab: "activities",
    },
    {
      label: "Transport",
      value: transportationCount,
      icon: (
        <Icon name="transportation" className="w-6 h-6" />
      ),
      color: "text-orange-600 dark:text-orange-400",
      bgColor: "bg-orange-50 dark:bg-orange-900/20",
      tab: "transportation",
    },
    {
      label: "Lodging",
      value: lodgingCount,
      icon: (
        <Icon name="lodging" className="w-6 h-6" />
      ),
      color: "text-rose-600 dark:text-rose-400",
      bgColor: "bg-rose-50 dark:bg-rose-900/20",
      tab: "lodging",
    },
    {
      label: "Journal",
      value: journalCount,
      icon: (
        <Icon name="journal" className="w-6 h-6" />
      ),
      color: "text-indigo-600 dark:text-indigo-400",
      bgColor: "bg-indigo-50 dark:bg-indigo-900/20",
      tab: "journal",
    },
    {
      label: "Companions",
      value: companionsCount,
      icon: (
        <Icon name="users" className="w-6 h-6" />
      ),
      color: "text-teal-600 dark:text-teal-400",
      bgColor: "bg-teal-50 dark:bg-teal-900/20",
      tab: "companions",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Trip Overview Header */}
      <div className="flex flex-wrap items-center gap-4 mb-2">
        {duration && (
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-dusk-700 rounded-lg">
            <Icon name="calendar" className="w-5 h-5 text-gray-600 dark:text-dusk-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-dusk-300">
              {duration}
            </span>
          </div>
        )}
        {unscheduledCount > 0 && (
          <button
            onClick={() => onNavigateToTab("unscheduled")}
            className="flex items-center gap-2 px-4 py-2 bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-900/30 transition-colors"
          >
            <Icon name="schedule" className="w-5 h-5" />
            <span className="text-sm font-medium">
              {unscheduledCount} unscheduled item{unscheduledCount !== 1 ? "s" : ""}
            </span>
          </button>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2 sm:gap-4">
        {statCards.map((stat) => (
          <button
            key={stat.label}
            onClick={() => onNavigateToTab(stat.tab)}
            className={`${stat.bgColor} p-4 rounded-xl transition-all duration-200 hover:shadow-md hover:scale-105 group text-left`}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className={`${stat.color}`}>{stat.icon}</div>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {stat.value}
              </p>
              <p className="text-sm text-gray-600 dark:text-dusk-400 group-hover:text-gray-800 dark:group-hover:text-dusk-200 transition-colors">
                {stat.label}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
