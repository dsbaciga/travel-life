import { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import tripSeriesService from '../services/tripSeries.service';
import tripService from '../services/trip.service';
import type { TripSeriesTrip } from '../types/tripSeries';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/LoadingSpinner';
import Breadcrumbs from '../components/Breadcrumbs';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { formatDate } from '../utils/dateFormat';

/** Get status badge color classes */
function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    Dream: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    Planning: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    Planned: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
    'In Progress': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    Completed: 'bg-gray-100 text-gray-800 dark:bg-dusk-700 dark:text-dusk-300',
    Cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  };
  return colors[status] || 'bg-gray-100 text-gray-800 dark:bg-dusk-700 dark:text-dusk-300';
}

export default function TripSeriesPage() {
  const { id } = useParams();
  const seriesId = parseInt(id!);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();

  const [editingName, setEditingName] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [descriptionValue, setDescriptionValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [addingTrip, setAddingTrip] = useState(false);
  const [selectedTripToAdd, setSelectedTripToAdd] = useState<string>('');
  const [reordering, setReordering] = useState(false);

  const { data: series, isLoading } = useQuery({
    queryKey: ['tripSeries', seriesId],
    queryFn: () => tripSeriesService.getById(seriesId),
    enabled: !!seriesId,
  });

  // Fetch all user trips to allow adding ones not in any series
  const { data: tripsData } = useQuery({
    queryKey: ['trips', { limit: 500 }],
    queryFn: () => tripService.getTrips({ limit: 500 }),
  });

  // Sorted trips in the series
  const sortedTrips = useMemo(() => {
    if (!series?.trips) return [];
    return [...series.trips].sort((a, b) => {
      const orderA = a.seriesOrder ?? 0;
      const orderB = b.seriesOrder ?? 0;
      return orderA - orderB;
    });
  }, [series?.trips]);

  // Available trips (not already in this series)
  const availableTrips = useMemo(() => {
    if (!tripsData?.trips) return [];
    const seriesTripIds = new Set(sortedTrips.map((t) => t.id));
    return tripsData.trips.filter((t) => !seriesTripIds.has(t.id));
  }, [tripsData?.trips, sortedTrips]);

  // Aggregate date range
  const dateRange = useMemo(() => {
    const dates = sortedTrips
      .flatMap((t) => [t.startDate, t.endDate])
      .filter((d): d is string => d !== null)
      .map((d) => new Date(d).getTime())
      .filter((d) => !isNaN(d));
    if (dates.length === 0) return null;
    const earliest = new Date(Math.min(...dates));
    const latest = new Date(Math.max(...dates));
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    return `${fmt(earliest)} - ${fmt(latest)}`;
  }, [sortedTrips]);

  const handleSaveName = async () => {
    if (!nameValue.trim()) {
      toast.error('Name is required');
      return;
    }
    try {
      setSaving(true);
      await tripSeriesService.update(seriesId, { name: nameValue.trim() });
      await queryClient.invalidateQueries({ queryKey: ['tripSeries', seriesId] });
      setEditingName(false);
      toast.success('Name updated');
    } catch {
      toast.error('Failed to update name');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDescription = async () => {
    try {
      setSaving(true);
      await tripSeriesService.update(seriesId, { description: descriptionValue.trim() || null });
      await queryClient.invalidateQueries({ queryKey: ['tripSeries', seriesId] });
      setEditingDescription(false);
      toast.success('Description updated');
    } catch {
      toast.error('Failed to update description');
    } finally {
      setSaving(false);
    }
  };

  const handleMoveUp = async (index: number) => {
    if (index <= 0 || reordering) return;
    const newOrder = [...sortedTrips];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    try {
      setReordering(true);
      await tripSeriesService.reorderTrips(seriesId, newOrder.map((t) => t.id));
      await queryClient.invalidateQueries({ queryKey: ['tripSeries', seriesId] });
    } catch {
      toast.error('Failed to reorder trips');
    } finally {
      setReordering(false);
    }
  };

  const handleMoveDown = async (index: number) => {
    if (index >= sortedTrips.length - 1 || reordering) return;
    const newOrder = [...sortedTrips];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    try {
      setReordering(true);
      await tripSeriesService.reorderTrips(seriesId, newOrder.map((t) => t.id));
      await queryClient.invalidateQueries({ queryKey: ['tripSeries', seriesId] });
    } catch {
      toast.error('Failed to reorder trips');
    } finally {
      setReordering(false);
    }
  };

  const handleRemoveTrip = async (trip: TripSeriesTrip) => {
    const confirmed = await confirm({
      title: 'Remove from Series',
      message: `Remove "${trip.title}" from this series? The trip itself will not be deleted.`,
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await tripSeriesService.removeTrip(seriesId, trip.id);
      await queryClient.invalidateQueries({ queryKey: ['tripSeries', seriesId] });
      await queryClient.invalidateQueries({ queryKey: ['trips'] });
      toast.success('Trip removed from series');
    } catch {
      toast.error('Failed to remove trip');
    }
  };

  const handleAddTrip = async () => {
    if (!selectedTripToAdd) return;
    try {
      setAddingTrip(true);
      await tripSeriesService.addTrip(seriesId, parseInt(selectedTripToAdd));
      await queryClient.invalidateQueries({ queryKey: ['tripSeries', seriesId] });
      await queryClient.invalidateQueries({ queryKey: ['trips'] });
      setSelectedTripToAdd('');
      toast.success('Trip added to series');
    } catch {
      toast.error('Failed to add trip');
    } finally {
      setAddingTrip(false);
    }
  };

  const handleDeleteSeries = async () => {
    const confirmed = await confirm({
      title: 'Delete Series',
      message: `Delete "${series?.name}"? All trips will be unlinked from this series but will not be deleted.`,
      confirmLabel: 'Delete Series',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await tripSeriesService.delete(seriesId);
      await queryClient.invalidateQueries({ queryKey: ['tripSeries'] });
      await queryClient.invalidateQueries({ queryKey: ['trips'] });
      toast.success('Series deleted');
      navigate('/trip-series');
    } catch {
      toast.error('Failed to delete series');
    }
  };

  if (isLoading) {
    return <LoadingSpinner.FullPage message="Loading series..." />;
  }

  if (!series) {
    return (
      <div className="min-h-screen bg-cream dark:bg-navy-900">
        <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-8">
          <div className="text-center py-12">
            <p className="text-lg text-gray-600 dark:text-dusk-400">Series not found</p>
            <Link to="/trip-series" className="btn btn-primary mt-4 inline-block">
              Back to Series
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream dark:bg-navy-900">
      <ConfirmDialogComponent />
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-8">
        <Breadcrumbs
          items={[
            { label: 'Trip Series', href: '/trip-series' },
            { label: series.name },
          ]}
        />

        {/* Header */}
        <div className="bg-white dark:bg-dusk-800 rounded-lg shadow border border-gray-200 dark:border-dusk-700 mb-6">
          <div className="p-6">
            {/* Name */}
            <div className="mb-4">
              {editingName ? (
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={nameValue}
                    onChange={(e) => setNameValue(e.target.value)}
                    className="input text-2xl font-display font-bold flex-1"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveName();
                      if (e.key === 'Escape') setEditingName(false);
                    }}
                  />
                  <button onClick={handleSaveName} disabled={saving} className="btn btn-primary text-sm">
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={() => setEditingName(false)} className="btn btn-secondary text-sm">
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-display font-bold text-charcoal dark:text-warm-gray">
                    📚 {series.name}
                  </h1>
                  <button
                    onClick={() => {
                      setNameValue(series.name);
                      setEditingName(true);
                    }}
                    className="p-2 text-slate dark:text-warm-gray/70 hover:text-primary-600 dark:hover:text-gold transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-dusk-700"
                    title="Edit name"
                    aria-label="Edit series name"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* Description */}
            <div className="mb-4">
              {editingDescription ? (
                <div className="space-y-2">
                  <textarea
                    value={descriptionValue}
                    onChange={(e) => setDescriptionValue(e.target.value)}
                    className="input w-full"
                    rows={3}
                    placeholder="Describe your trip series..."
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button onClick={handleSaveDescription} disabled={saving} className="btn btn-primary text-sm">
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button onClick={() => setEditingDescription(false)} className="btn btn-secondary text-sm">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <p className="text-slate dark:text-warm-gray/70 font-body flex-1">
                    {series.description || 'No description'}
                  </p>
                  <button
                    onClick={() => {
                      setDescriptionValue(series.description || '');
                      setEditingDescription(true);
                    }}
                    className="p-2 text-slate dark:text-warm-gray/70 hover:text-primary-600 dark:hover:text-gold transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-dusk-700 flex-shrink-0"
                    title="Edit description"
                    aria-label="Edit series description"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* Stats bar */}
            <div className="flex flex-wrap items-center gap-4 text-sm text-slate dark:text-warm-gray/70 font-body">
              <span>{sortedTrips.length} trip{sortedTrips.length !== 1 ? 's' : ''}</span>
              {dateRange && (
                <>
                  <span className="text-gray-300 dark:text-dusk-600">|</span>
                  <span>{dateRange}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Trip List */}
        <div className="bg-white dark:bg-dusk-800 rounded-lg shadow border border-gray-200 dark:border-dusk-700 mb-6">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-dusk-700">
            <h2 className="text-lg font-display font-bold text-charcoal dark:text-warm-gray">
              Trips in Series
            </h2>
          </div>

          {sortedTrips.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-slate dark:text-warm-gray/70 font-body">
                No trips in this series yet. Add trips below.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-dusk-700">
              {sortedTrips.map((trip, index) => (
                <li key={trip.id} className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-dusk-700 transition-colors">
                  {/* Order number */}
                  <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-navy-700 flex items-center justify-center text-sm font-bold text-primary-700 dark:text-gold flex-shrink-0">
                    {index + 1}
                  </div>

                  {/* Trip info */}
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/trips/${trip.id}`}
                      className="text-base font-display font-semibold text-charcoal dark:text-warm-gray hover:text-primary-600 dark:hover:text-gold transition-colors"
                    >
                      {trip.tripTypeEmoji && <span className="mr-1">{trip.tripTypeEmoji}</span>}
                      {trip.title}
                    </Link>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${getStatusColor(trip.status)}`}>
                        {trip.status}
                      </span>
                      <span className="text-xs text-slate dark:text-warm-gray/60 font-body">
                        {formatDate(trip.startDate, 'medium', 'No date')}
                        {trip.endDate && ` - ${formatDate(trip.endDate, 'medium', 'No date')}`}
                      </span>
                    </div>
                  </div>

                  {/* Reorder buttons */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate dark:text-warm-gray/70 hover:bg-gray-100 dark:hover:bg-dusk-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Move up"
                      aria-label={`Move ${trip.title} up`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleMoveDown(index)}
                      disabled={index === sortedTrips.length - 1}
                      className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate dark:text-warm-gray/70 hover:bg-gray-100 dark:hover:bg-dusk-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Move down"
                      aria-label={`Move ${trip.title} down`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>

                  {/* Remove button */}
                  <button
                    onClick={() => handleRemoveTrip(trip)}
                    className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0"
                    title="Remove from series"
                    aria-label={`Remove ${trip.title} from series`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add Trip Section */}
        <div className="bg-white dark:bg-dusk-800 rounded-lg shadow border border-gray-200 dark:border-dusk-700 mb-6">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-dusk-700">
            <h2 className="text-lg font-display font-bold text-charcoal dark:text-warm-gray">
              Add Trip to Series
            </h2>
          </div>
          <div className="p-6">
            {availableTrips.length === 0 ? (
              <p className="text-slate dark:text-warm-gray/70 font-body text-sm">
                All your trips are already in this series, or you have no other trips.{' '}
                <Link to="/trips/new" className="text-primary-600 dark:text-gold hover:underline">
                  Create a new trip
                </Link>
              </p>
            ) : (
              <div className="flex gap-3">
                <select
                  value={selectedTripToAdd}
                  onChange={(e) => setSelectedTripToAdd(e.target.value)}
                  className="input flex-1"
                >
                  <option value="">Select a trip to add...</option>
                  {availableTrips.map((t) => (
                    <option key={t.id} value={t.id.toString()}>
                      {t.title} ({t.status})
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAddTrip}
                  disabled={!selectedTripToAdd || addingTrip}
                  className="btn btn-primary text-sm px-6"
                >
                  {addingTrip ? 'Adding...' : 'Add'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-white dark:bg-dusk-800 rounded-lg shadow border border-red-200 dark:border-red-900/50">
          <div className="px-6 py-4 border-b border-red-200 dark:border-red-900/50">
            <h2 className="text-lg font-display font-bold text-red-600 dark:text-red-400">
              Danger Zone
            </h2>
          </div>
          <div className="p-6 flex items-center justify-between">
            <div>
              <p className="font-body font-medium text-charcoal dark:text-warm-gray">Delete this series</p>
              <p className="text-sm text-slate dark:text-warm-gray/70 font-body">
                Trips will be unlinked but not deleted.
              </p>
            </div>
            <button
              onClick={handleDeleteSeries}
              className="btn btn-danger text-sm"
            >
              Delete Series
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
