import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import tripSeriesService from '../services/tripSeries.service';
import toast from 'react-hot-toast';

interface TripSeriesSelectorProps {
  selectedSeriesId: number | null;
  onChange: (seriesId: number | null) => void;
}

/**
 * Dropdown for the trip form to assign a trip to a series.
 * Supports selecting an existing series or creating a new one inline.
 */
export default function TripSeriesSelector({ selectedSeriesId, onChange }: TripSeriesSelectorProps) {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newSeriesName, setNewSeriesName] = useState('');
  const [creating, setCreating] = useState(false);

  const { data: seriesList = [], isLoading } = useQuery({
    queryKey: ['tripSeries'],
    queryFn: () => tripSeriesService.getAll(),
  });

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === '__create__') {
      setShowCreate(true);
    } else if (value === '') {
      onChange(null);
    } else {
      onChange(parseInt(value, 10));
      setShowCreate(false);
    }
  };

  const handleCreateSeries = async () => {
    if (!newSeriesName.trim()) {
      toast.error('Series name is required');
      return;
    }

    try {
      setCreating(true);
      const created = await tripSeriesService.create({ name: newSeriesName.trim() });
      await queryClient.invalidateQueries({ queryKey: ['tripSeries'] });
      onChange(created.id);
      setNewSeriesName('');
      setShowCreate(false);
      toast.success('Series created');
    } catch {
      toast.error('Failed to create series');
    } finally {
      setCreating(false);
    }
  };

  const handleCancelCreate = () => {
    setShowCreate(false);
    setNewSeriesName('');
  };

  return (
    <div>
      <label htmlFor="seriesId" className="label">
        Trip Series
      </label>
      <select
        id="seriesId"
        value={showCreate ? '__create__' : (selectedSeriesId?.toString() ?? '')}
        onChange={handleSelectChange}
        className="input"
        disabled={isLoading}
      >
        <option value="">None</option>
        {seriesList.map((s) => (
          <option key={s.id} value={s.id.toString()}>
            📚 {s.name} {s._count ? `(${s._count.trips} trips)` : ''}
          </option>
        ))}
        <option value="__create__">+ Create New Series...</option>
      </select>
      <p className="text-xs text-gray-500 dark:text-dusk-400 mt-1">
        Group related trips together in a series
      </p>

      {showCreate && (
        <div className="mt-3 p-3 bg-gray-50 dark:bg-dusk-800 border border-gray-200 dark:border-dusk-700 rounded-lg">
          <label htmlFor="newSeriesName" className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1">
            New Series Name
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              id="newSeriesName"
              value={newSeriesName}
              onChange={(e) => setNewSeriesName(e.target.value)}
              className="input flex-1"
              placeholder="e.g., European Adventure 2025"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreateSeries();
                } else if (e.key === 'Escape') {
                  handleCancelCreate();
                }
              }}
            />
            <button
              type="button"
              onClick={handleCreateSeries}
              className="btn btn-primary text-sm px-4"
              disabled={creating || !newSeriesName.trim()}
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              type="button"
              onClick={handleCancelCreate}
              className="btn btn-secondary text-sm px-3"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
