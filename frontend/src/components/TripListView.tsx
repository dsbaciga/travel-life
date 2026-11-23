import React from 'react';
import { Link } from 'react-router';
import type { Trip, TripStatusType } from '../types/trip';
import { formatTripDates, formatTripDuration } from '../utils/dateFormat';
import { getTripStatusRibbonColor } from '../utils/statusColors';
import { stripMarkdown } from '../utils/stripMarkdown';
import TripActionsMenu from './TripActionsMenu';
import {
  ChevronUpIcon,
  ChevronDownIcon,
  MapPinIcon,
  CameraIcon,
} from './icons';

interface TripListViewProps {
  trips: Trip[];
  coverPhotoUrls: { [key: number]: string };
  onDelete: (id: number) => void;
  /** Archives or unarchives a trip; the menu omits the item when absent */
  onArchiveToggle?: (trip: Trip) => void;
  onStatusChange: (tripId: number, status: TripStatusType) => void;
  onNavigateAway?: () => void;
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (column: string) => void;
}

const TripListView: React.FC<TripListViewProps> = ({
  trips,
  coverPhotoUrls,
  onDelete,
  onArchiveToggle,
  // onStatusChange is accepted for API parity with the other trip views but is
  // unused here — the list view has no inline status control.
  onNavigateAway,
  sortColumn,
  sortDirection,
  onSort,
}) => {
  const getSortAriaSort = (column: string): 'ascending' | 'descending' | 'none' => {
    if (sortColumn !== column) return 'none';
    return sortDirection === 'asc' ? 'ascending' : 'descending';
  };

  const renderSortIndicator = (column: string) => {
    if (!onSort) return null;

    const isActive = sortColumn === column;

    return (
      <span className="ml-1 inline-flex flex-col">
        <ChevronUpIcon
          className={`h-3 w-3 -mb-1 ${
            isActive && sortDirection === 'asc'
              ? 'text-gold'
              : 'text-primary-300 dark:text-navy-500'
          }`}
        />
        <ChevronDownIcon
          className={`h-3 w-3 ${
            isActive && sortDirection === 'desc'
              ? 'text-gold'
              : 'text-primary-300 dark:text-navy-500'
          }`}
        />
      </span>
    );
  };

  const handleHeaderClick = (column: string) => {
    if (onSort) {
      onSort(column);
    }
  };

  return (
    <div>
      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-parchment dark:bg-navy-800 border-b border-primary-100 dark:border-gold/20">
            <th className="px-4 py-3 text-left text-sm font-semibold text-primary-700 dark:text-primary-200 w-16">
              <span className="sr-only">Cover photo</span>
            </th>
            <th
              className={`px-4 py-3 text-left text-sm font-semibold text-primary-700 dark:text-primary-200 ${
                onSort ? 'cursor-pointer hover:text-gold' : ''
              }`}
              aria-sort={getSortAriaSort('title')}
              onClick={() => handleHeaderClick('title')}
            >
              <span className="inline-flex items-center">
                Trip
                {renderSortIndicator('title')}
              </span>
            </th>
            <th
              className={`px-4 py-3 text-left text-sm font-semibold text-primary-700 dark:text-primary-200 ${
                onSort ? 'cursor-pointer hover:text-gold' : ''
              }`}
              aria-sort={getSortAriaSort('startDate')}
              onClick={() => handleHeaderClick('startDate')}
            >
              <span className="inline-flex items-center">
                Dates
                {renderSortIndicator('startDate')}
              </span>
            </th>
            <th
              className={`px-4 py-3 text-left text-sm font-semibold text-primary-700 dark:text-primary-200 ${
                onSort ? 'cursor-pointer hover:text-gold' : ''
              }`}
              aria-sort={getSortAriaSort('status')}
              onClick={() => handleHeaderClick('status')}
            >
              <span className="inline-flex items-center">
                Status
                {renderSortIndicator('status')}
              </span>
            </th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-primary-700 dark:text-primary-200">
              Type
            </th>
            <th className="px-4 py-3 text-center text-sm font-semibold text-primary-700 dark:text-primary-200">
              <span className="sr-only">Locations</span>
              <MapPinIcon className="h-4 w-4 mx-auto" />
            </th>
            <th className="px-4 py-3 text-center text-sm font-semibold text-primary-700 dark:text-primary-200">
              <span className="sr-only">Photos</span>
              <CameraIcon className="h-4 w-4 mx-auto" />
            </th>
            <th className="px-4 py-3 text-right text-sm font-semibold text-primary-700 dark:text-primary-200 w-16">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {trips.map((trip) => {
            const statusColor = getTripStatusRibbonColor(trip.status);
            const coverPhotoUrl = coverPhotoUrls[trip.id];

            return (
              <tr
                key={trip.id}
                className="bg-white dark:bg-navy-800/50 hover:bg-primary-50 dark:hover:bg-navy-700/50 border-b border-primary-100 dark:border-gold/10 transition-colors"
              >
                <td className="px-4 py-3">
                  <Link
                    to={`/trips/${trip.id}`}
                    onClick={onNavigateAway}
                    className="block"
                  >
                    {coverPhotoUrl ? (
                      <img
                        src={coverPhotoUrl}
                        alt={`${trip.title} cover`}
                        className="w-12 h-9 rounded object-cover ring-1 ring-primary-100 dark:ring-gold/20"
                      />
                    ) : (
                      <div className="w-12 h-9 rounded bg-primary-100 dark:bg-navy-700 ring-1 ring-primary-100 dark:ring-gold/20 flex items-center justify-center">
                        <CameraIcon className="h-4 w-4 text-primary-400 dark:text-primary-500" />
                      </div>
                    )}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link
                    to={`/trips/${trip.id}`}
                    onClick={onNavigateAway}
                    className="block"
                  >
                    <div className="font-medium text-primary-800 dark:text-primary-100 hover:text-gold dark:hover:text-gold transition-colors">
                      {trip.title}
                    </div>
                    {trip.description && (
                      <div className="text-sm text-primary-500 dark:text-primary-400 truncate max-w-xs">
                        {stripMarkdown(trip.description)}
                      </div>
                    )}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link
                    to={`/trips/${trip.id}`}
                    onClick={onNavigateAway}
                    className="block"
                  >
                    <div className="text-sm text-primary-700 dark:text-primary-200">
                      {formatTripDates(trip.startDate, trip.endDate)}
                    </div>
                    <div className="text-xs text-primary-500 dark:text-primary-400">
                      {formatTripDuration(trip.startDate, trip.endDate)}
                    </div>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link
                    to={`/trips/${trip.id}`}
                    onClick={onNavigateAway}
                    className="block"
                  >
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor}`}
                    >
                      {trip.status.replace(/_/g, ' ')}
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link
                    to={`/trips/${trip.id}`}
                    onClick={onNavigateAway}
                    className="block"
                  >
                    {trip.tripType ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary-50 dark:bg-navy-700 text-primary-700 dark:text-primary-200">
                        {trip.tripTypeEmoji && <span>{trip.tripTypeEmoji}</span>}
                        {trip.tripType}
                      </span>
                    ) : (
                      <span className="text-xs text-primary-400 dark:text-primary-500">—</span>
                    )}
                  </Link>
                </td>
                <td className="px-4 py-3 text-center">
                  <Link
                    to={`/trips/${trip.id}`}
                    onClick={onNavigateAway}
                    className="block text-sm text-primary-600 dark:text-primary-300"
                  >
                    {trip._count?.locations ?? 0}
                  </Link>
                </td>
                <td className="px-4 py-3 text-center">
                  <Link
                    to={`/trips/${trip.id}`}
                    onClick={onNavigateAway}
                    className="block text-sm text-primary-600 dark:text-primary-300"
                  >
                    {trip._count?.photos ?? 0}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right">
                  <TripActionsMenu
                    trip={trip}
                    onDelete={onDelete}
                    onArchiveToggle={onArchiveToggle}
                    onNavigateAway={onNavigateAway}
                    buttonClassName="p-1 rounded-full hover:bg-primary-100 dark:hover:bg-navy-600 transition-colors"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      {/* Mobile List View */}
      <div className="md:hidden space-y-2">
        {trips.map((trip) => {
          const statusColor = getTripStatusRibbonColor(trip.status);
          const coverPhotoUrl = coverPhotoUrls[trip.id];

          return (
            <div
              key={trip.id}
              className={`bg-white dark:bg-navy-800/50 rounded-lg border border-primary-100 dark:border-gold/20 p-3 ${trip.archived ? 'opacity-60' : ''}`}
            >
              <div className="flex items-center gap-3">
                <Link
                  to={`/trips/${trip.id}`}
                  onClick={onNavigateAway}
                  className="flex-shrink-0"
                >
                  {coverPhotoUrl ? (
                    <img
                      src={coverPhotoUrl}
                      alt={`${trip.title} cover`}
                      className="w-12 h-9 rounded object-cover ring-1 ring-primary-100 dark:ring-gold/20"
                    />
                  ) : (
                    <div className="w-12 h-9 rounded bg-primary-100 dark:bg-navy-700 ring-1 ring-primary-100 dark:ring-gold/20 flex items-center justify-center">
                      <CameraIcon className="h-4 w-4 text-primary-400 dark:text-primary-500" />
                    </div>
                  )}
                </Link>
                <Link
                  to={`/trips/${trip.id}`}
                  onClick={onNavigateAway}
                  className="flex-1 min-w-0"
                >
                  <div className="font-medium text-primary-800 dark:text-primary-100 truncate">
                    {trip.title}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}`}
                    >
                      {trip.status.replace(/_/g, ' ')}
                    </span>
                    {trip.archived && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate/90 dark:bg-navy-900/90 text-white dark:text-warm-gray">
                        Archived
                      </span>
                    )}
                  </div>
                </Link>
                <div className="flex-shrink-0">
                  <TripActionsMenu
                    trip={trip}
                    onDelete={onDelete}
                    onArchiveToggle={onArchiveToggle}
                    onNavigateAway={onNavigateAway}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TripListView;
