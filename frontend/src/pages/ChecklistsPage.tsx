import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Checklist, DefaultChecklistStatus, ChecklistType } from '../types/checklist';
import type { Trip } from '../types/trip';
import checklistService from '../services/checklist.service';
import tripService from '../services/trip.service';
import ChecklistSelectorModal from '../components/ChecklistSelectorModal';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

// Import reusable components
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';

export default function ChecklistsPage() {
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newChecklistName, setNewChecklistName] = useState('');
  const [newChecklistDescription, setNewChecklistDescription] = useState('');
  const [newChecklistTripId, setNewChecklistTripId] = useState<number | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isAutoChecking, setIsAutoChecking] = useState(false);
  const [showSelectorModal, setShowSelectorModal] = useState(false);
  const [selectorMode, setSelectorMode] = useState<'add' | 'remove'>('add');
  const [defaultChecklistsStatus, setDefaultChecklistsStatus] = useState<DefaultChecklistStatus[]>([]);
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();

  useEffect(() => {
    loadChecklists();
    loadDefaultsStatus();
    loadTrips();
  }, []);

  const loadChecklists = async () => {
    try {
      const data = await checklistService.getChecklists();
      setChecklists(data);
    } catch (err) {
      console.error('Failed to load checklists:', err);
      alert('Failed to load checklists');
    } finally {
      setIsLoading(false);
    }
  };

  const loadDefaultsStatus = async () => {
    try {
      const status = await checklistService.getDefaultsStatus();
      setDefaultChecklistsStatus(status);
    } catch (err) {
      console.error('Failed to load defaults status:', err);
    }
  };

  const loadTrips = async () => {
    try {
      const data = await tripService.getTrips({ limit: 1000, sort: 'title-asc' });
      setTrips(data.trips);
    } catch (err) {
      console.error('Failed to load trips:', err);
    }
  };

  const handleInitializeDefaults = async () => {
    const confirmed = await confirm({
      title: 'Initialize Default Checklists',
      message: 'This will create default checklists for Airports, Countries, and Cities. Continue?',
      confirmLabel: 'Initialize',
      variant: 'info',
    });
    if (!confirmed) {
      return;
    }

    setIsInitializing(true);
    try {
      await checklistService.initializeDefaults();
      await loadChecklists();
      alert('Default checklists initialized successfully!');
    } catch (err) {
      console.error('Failed to initialize defaults:', err);
      alert('Failed to initialize default checklists. They may already exist.');
    } finally {
      setIsInitializing(false);
    }
  };

  const handleAutoCheck = async () => {
    setIsAutoChecking(true);
    try {
      const result = await checklistService.autoCheckFromTrips();
      await loadChecklists();
      alert(`Successfully auto-checked ${result.updated} items based on your trips!`);
    } catch (err) {
      console.error('Failed to auto-check items:', err);
      alert('Failed to auto-check items from trips');
    } finally {
      setIsAutoChecking(false);
    }
  };

  const handleCreateChecklist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChecklistName.trim()) return;

    try {
      await checklistService.createChecklist({
        name: newChecklistName,
        description: newChecklistDescription || null,
        type: 'custom',
        tripId: newChecklistTripId,
      });

      setNewChecklistName('');
      setNewChecklistDescription('');
      setNewChecklistTripId(null);
      setShowCreateForm(false);
      await loadChecklists();
    } catch (err) {
      console.error('Failed to create checklist:', err);
      alert('Failed to create checklist');
    }
  };

  const handleDeleteChecklist = async (id: number) => {
    const confirmed = await confirm({
      title: 'Delete Checklist',
      message: 'Are you sure you want to delete this checklist? This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) {
      return;
    }

    try {
      await checklistService.deleteChecklist(id);
      await loadChecklists();
    } catch (err) {
      console.error('Failed to delete checklist:', err);
      alert('Failed to delete checklist');
    }
  };

  const handleOpenAddModal = () => {
    setSelectorMode('add');
    setShowSelectorModal(true);
  };

  const handleOpenRemoveModal = () => {
    setSelectorMode('remove');
    setShowSelectorModal(true);
  };

  const handleSelectorConfirm = async (selectedTypes: ChecklistType[]) => {
    if (selectorMode === 'add') {
      const result = await checklistService.addDefaults(selectedTypes);
      await loadChecklists();
      await loadDefaultsStatus();
      alert(`Successfully added ${result.added} default checklists`);
    } else {
      const result = await checklistService.removeDefaultsByType(selectedTypes);
      await loadChecklists();
      await loadDefaultsStatus();
      alert(`Successfully removed ${result.removed} default checklists`);
    }
  };

  const getChecklistIcon = (type: string) => {
    switch (type) {
      case 'airports':
        return '✈️';
      case 'countries':
        return '🌍';
      case 'cities':
        return '🏙️';
      case 'us_states':
        return '🗽';
      default:
        return '📋';
    }
  };

  // Build secondary actions for the header
  const secondaryActions = [];
  
  if (checklists.length === 0) {
    secondaryActions.push({
      label: isInitializing ? 'Initializing...' : 'Initialize All Defaults',
      onClick: handleInitializeDefaults,
      disabled: isInitializing,
      variant: 'secondary' as const,
    });
  }
  
  if (defaultChecklistsStatus.some(c => !c.exists)) {
    secondaryActions.push({
      label: '+ Add Defaults',
      onClick: handleOpenAddModal,
      variant: 'secondary' as const,
    });
  }

  secondaryActions.push({
    label: isAutoChecking ? 'Syncing...' : 'Sync Default Lists from Trips',
    onClick: handleAutoCheck,
    disabled: isAutoChecking || checklists.length === 0,
    variant: 'secondary' as const,
    title: 'Automatically check off airports, countries, cities, and states you\'ve visited based on your trip data',
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-[1600px] mx-auto px-6 py-8">
          <LoadingSpinner.FullPage message="Loading checklists..." />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-[1600px] mx-auto px-6 py-8">
        <PageHeader
          title="Checklists"
          subtitle="Track your travel achievements"
          action={{
            label: showCreateForm ? 'Cancel' : '+ Create Custom List',
            onClick: () => setShowCreateForm(!showCreateForm),
          }}
          secondaryActions={secondaryActions}
        />

        {showCreateForm && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Create Custom Checklist
            </h2>
            <form onSubmit={handleCreateChecklist}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name*
                </label>
                <input
                  type="text"
                  value={newChecklistName}
                  onChange={(e) => setNewChecklistName(e.target.value)}
                  className="input"
                  placeholder="e.g., National Parks, UNESCO Sites"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  value={newChecklistDescription}
                  onChange={(e) => setNewChecklistDescription(e.target.value)}
                  className="input"
                  rows={3}
                  placeholder="Optional description..."
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Associate with Trip (Optional)
                </label>
                <select
                  value={newChecklistTripId ?? ''}
                  onChange={(e) => setNewChecklistTripId(e.target.value ? parseInt(e.target.value) : null)}
                  className="input"
                  aria-label="Associate with Trip"
                >
                  <option value="">None (General checklist)</option>
                  {trips.map((trip) => (
                    <option key={trip.id} value={trip.id}>
                      {trip.title}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Link this checklist to a specific trip. It will appear in the trip header.
                </p>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn btn-primary">
                  Create Checklist
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {checklists.length === 0 ? (
          <EmptyState
            icon="📋"
            message="No Checklists Yet"
            subMessage="Get started by initializing default lists or creating your own custom checklist"
            actionLabel={isInitializing ? 'Initializing...' : 'Initialize Default Lists'}
            onAction={handleInitializeDefaults}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {checklists.map((checklist) => (
              <Link
                key={checklist.id}
                to={`/checklists/${checklist.id}`}
                className="block bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg transition-shadow"
              >
                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-3xl">{getChecklistIcon(checklist.type)}</span>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                          {checklist.name}
                        </h3>
                        {checklist.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {checklist.description}
                          </p>
                        )}
                      </div>
                    </div>
                    {!checklist.isDefault && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          handleDeleteChecklist(checklist.id);
                        }}
                        className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                        title="Delete checklist"
                      >
                        🗑️
                      </button>
                    )}
                  </div>

                  {checklist.stats && (
                    <div className="mt-4">
                      <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
                        <span>
                          {checklist.stats.checked} / {checklist.stats.total} completed
                        </span>
                        <span>{checklist.stats.percentage}%</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        {/* Dynamic progress width requires CSS variable - cannot be moved to static CSS */}
                        <div
                          className="bg-blue-600 dark:bg-blue-500 h-2 rounded-full transition-all progress-bar"
                          style={{ '--progress-width': `${checklist.stats.percentage}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Remove Defaults button at bottom of page */}
        {checklists.some(c => c.isDefault) && (
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleOpenRemoveModal}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"
            >
              Remove Default Checklist(s)
            </button>
          </div>
        )}

        <ChecklistSelectorModal
          isOpen={showSelectorModal}
          onClose={() => setShowSelectorModal(false)}
          onConfirm={handleSelectorConfirm}
          availableChecklists={defaultChecklistsStatus}
          mode={selectorMode}
        />
        <ConfirmDialogComponent />
      </div>
    </div>
  );
}
