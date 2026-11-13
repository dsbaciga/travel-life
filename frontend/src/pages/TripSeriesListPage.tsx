import { useState } from 'react';
import { LIBRARY_BACK_LINK } from '../components/LibraryBackLink';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import tripSeriesService from '../services/tripSeries.service';
import type { TripSeries } from '../types/tripSeries';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import PageHeader from '../components/PageHeader';

/**
 * Compute a date range string from a series' trips.
 */
function getSeriesDateRange(series: TripSeries): string {
  if (!series.trips || series.trips.length === 0) return 'No trips yet';

  const dates = series.trips
    .flatMap((t) => [t.startDate, t.endDate])
    .filter((d): d is string => d !== null)
    .map((d) => new Date(d).getTime())
    .filter((d) => !isNaN(d));

  if (dates.length === 0) return 'No dates set';

  const earliest = new Date(Math.min(...dates));
  const latest = new Date(Math.max(...dates));

  const format = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  if (earliest.getTime() === latest.getTime()) return format(earliest);
  return `${format(earliest)} - ${format(latest)}`;
}

export default function TripSeriesListPage() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const { data: seriesList = [], isLoading } = useQuery({
    queryKey: ['tripSeries'],
    queryFn: () => tripSeriesService.getAll(),
  });

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error('Name is required');
      return;
    }
    try {
      setCreating(true);
      await tripSeriesService.create({
        name: newName.trim(),
        description: newDescription.trim() || null,
      });
      await queryClient.invalidateQueries({ queryKey: ['tripSeries'] });
      setShowCreateModal(false);
      setNewName('');
      setNewDescription('');
      toast.success('Series created');
    } catch {
      toast.error('Failed to create series');
    } finally {
      setCreating(false);
    }
  };

  if (isLoading) {
    return <LoadingSpinner.FullPage message="Loading trip series..." />;
  }

  return (
    <div className="min-h-screen bg-cream dark:bg-navy-900">
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-8">
        <PageHeader
          title="Trip Series"
          subtitle="Group related trips together into a series"
          backLink={LIBRARY_BACK_LINK}
          action={{ label: '+ Create Series', onClick: () => setShowCreateModal(true) }}
        />

        {/* Content */}
        {seriesList.length === 0 ? (
          <EmptyState
            icon="📚"
            message="No trip series yet"
            subMessage="Create a series to group related trips together, like a multi-city tour or annual vacation tradition."
            actionLabel="Create Series"
            onAction={() => setShowCreateModal(true)}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
            {seriesList.map((series) => (
              <Link
                key={series.id}
                to={`/trip-series/${series.id}`}
                className="card card-interactive group"
              >
                <div className="p-5">
                  {/* Series icon and name */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-navy-700 flex items-center justify-center flex-shrink-0">
                      <span className="text-lg" aria-hidden="true">📚</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-display font-bold text-charcoal dark:text-warm-gray group-hover:text-primary-600 dark:group-hover:text-gold transition-colors truncate">
                        {series.name}
                      </h3>
                      {series.description && (
                        <p className="text-sm text-slate dark:text-warm-gray/70 line-clamp-2 mt-0.5 font-body">
                          {series.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4 pt-3 border-t border-gray-200 dark:border-navy-700">
                    <div className="flex items-center gap-1.5 text-sm text-slate dark:text-warm-gray/70">
                      <svg className="w-4 h-4 text-primary-500 dark:text-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="font-body">
                        {series._count?.trips ?? series.trips?.length ?? 0} trip{(series._count?.trips ?? series.trips?.length ?? 0) !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="text-sm text-slate dark:text-warm-gray/70 font-body">
                      {getSeriesDateRange(series)}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      {/* Create Series Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setNewName('');
          setNewDescription('');
        }}
        title="Create Trip Series"
        icon={<span className="text-2xl">📚</span>}
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="seriesName" className="label">
              Name *
            </label>
            <input
              type="text"
              id="seriesName"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="input"
              placeholder="e.g., European Adventure 2025"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreate();
                }
              }}
            />
          </div>
          <div>
            <label htmlFor="seriesDescription" className="label">
              Description
            </label>
            <textarea
              id="seriesDescription"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="input"
              rows={3}
              placeholder="Describe your trip series..."
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleCreate}
              className="flex-1 btn btn-primary"
              disabled={creating || !newName.trim()}
            >
              {creating ? 'Creating...' : 'Create Series'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreateModal(false);
                setNewName('');
                setNewDescription('');
              }}
              className="flex-1 btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
