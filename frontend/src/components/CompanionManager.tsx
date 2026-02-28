import { useState, useEffect, useMemo } from 'react';
import companionService from '../services/companion.service';
import type { Companion } from '../types/companion';
import toast from 'react-hot-toast';
import { useManagerCRUD } from '../hooks/useManagerCRUD';
import { useFormReset } from '../hooks/useFormReset';
import CompanionAvatar from './CompanionAvatar';
import Modal from './Modal';
import EmptyState from './EmptyState';
import DietaryTagSelector from './DietaryTagSelector';
import DietaryBadges from './DietaryBadges';

interface CompanionFormData {
  name: string;
  email: string;
  phone: string;
  notes: string;
  dietaryPreferences: string[];
}

interface CompanionManagerProps {
  tripId: number;
  onUpdate?: () => void;
}

export default function CompanionManager({ tripId, onUpdate }: CompanionManagerProps) {
  // Service adapter for trip companions (companions linked to this trip) - memoized to prevent infinite loops
  const tripCompanionServiceAdapter = useMemo(() => ({
    getByTrip: companionService.getCompanionsByTrip,
    create: async () => { throw new Error("Use handleCreateCompanion instead"); },
    update: async () => { throw new Error("Use handleUpdateCompanion instead"); },
    delete: async () => { throw new Error("Use handleDeleteCompanion instead"); },
  }), []);

  // Initialize CRUD hook for trip companions
  const manager = useManagerCRUD<Companion>(tripCompanionServiceAdapter, tripId, {
    itemName: "companion",
  });

  const [companions, setCompanions] = useState<Companion[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Form state management using useFormReset hook
  // Before: 5 separate state variables + 6-line resetForm + 5-line startEdit
  // After: 1 formData state + useFormReset hook handles reset/open logic
  const initialFormState: CompanionFormData = { name: '', email: '', phone: '', notes: '', dietaryPreferences: [] };
  const [formData, setFormData] = useState<CompanionFormData>(initialFormState);
  const [editingCompanionId, setEditingCompanionId] = useState<number | null>(null);
  const [showCompanionForm, setShowCompanionForm] = useState(false);

  const { resetForm, openCreateForm, openEditForm } = useFormReset({
    initialState: initialFormState,
    setFormData,
    setEditingId: setEditingCompanionId,
    setShowForm: setShowCompanionForm,
  });

  useEffect(() => {
    loadAllCompanions();
  }, [tripId]);

  const loadAllCompanions = async () => {
    try {
      const allCompanions = await companionService.getCompanionsByUser();
      setCompanions(allCompanions);
    } catch {
      toast.error('Failed to load companions');
    }
  };

  const handleCreateCompanion = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newCompanion = await companionService.createCompanion({
        name: formData.name,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        notes: formData.notes || undefined,
        dietaryPreferences: formData.dietaryPreferences.length > 0 ? formData.dietaryPreferences : undefined,
      });
      toast.success('Companion created');
      resetForm();
      await loadAllCompanions();
      // Automatically link the new companion to this trip
      await handleLinkCompanion(newCompanion.id);
    } catch {
      toast.error('Failed to create companion');
    }
  };

  const handleUpdateCompanion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCompanionId) return;

    try {
      await companionService.updateCompanion(editingCompanionId, {
        name: formData.name,
        email: formData.email || null,
        phone: formData.phone || null,
        notes: formData.notes || null,
        dietaryPreferences: formData.dietaryPreferences,
      });
      toast.success('Companion updated');
      resetForm();
      loadAllCompanions();
      manager.loadItems();
      onUpdate?.();
    } catch {
      toast.error('Failed to update companion');
    }
  };

  const handleLinkCompanion = async (companionId: number) => {
    try {
      await companionService.linkCompanionToTrip(tripId, companionId);
      toast.success('Companion added to trip');
      manager.loadItems();
      onUpdate?.();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      if (error.response?.data?.message?.includes('already linked')) {
        toast.error('Companion already added to this trip');
      } else {
        toast.error('Failed to add companion');
      }
    }
  };

  const handleUnlinkCompanion = async (companionId: number) => {
    try {
      await companionService.unlinkCompanionFromTrip(tripId, companionId);
      toast.success('Companion removed from trip');
      manager.loadItems();
      onUpdate?.();
    } catch {
      toast.error('Failed to remove companion');
    }
  };

  // startEdit now uses openEditForm from useFormReset hook - reduces 6 lines to 1 call
  const startEdit = (companion: Companion) => {
    openEditForm(companion.id, {
      name: companion.name,
      email: companion.email || '',
      phone: companion.phone || '',
      notes: companion.notes || '',
      dietaryPreferences: companion.dietaryPreferences || [],
    });
  };

  // resetForm is now provided by useFormReset hook - eliminates 6 lines of boilerplate

  if (manager.loading) {
    return <div className="text-center py-4">Loading companions...</div>;
  }

  const availableCompanions = companions.filter(
    (companion) => !manager.items.find((tc) => tc.id === companion.id)
  );

  // Filter available companions based on search query
  const filteredCompanions = availableCompanions.filter((companion) =>
    companion.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col-reverse items-start gap-3 sm:flex-row sm:justify-between sm:items-center">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
          Travel Companions
        </h2>
        <button
          onClick={openCreateForm}
          className="btn btn-primary text-sm sm:text-base whitespace-nowrap"
        >
          <span className="sm:hidden">+ Add</span>
          <span className="hidden sm:inline">+ Add Companion</span>
        </button>
      </div>

      {/* Create/Edit Companion Form Modal */}
      <Modal
        isOpen={showCompanionForm}
        onClose={resetForm}
        title={editingCompanionId ? "Edit Companion" : "Add Companion"}
        icon="👥"
        maxWidth="lg"
        formId="companion-form"
        focusFirstInput
        animate
        footer={
          <>
            <button
              type="button"
              onClick={resetForm}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="companion-form"
              className="btn btn-primary"
            >
              {editingCompanionId ? 'Update' : 'Add'} Companion
            </button>
          </>
        }
      >
        <form
          id="companion-form"
          onSubmit={editingCompanionId ? handleUpdateCompanion : handleCreateCompanion}
          className="space-y-4"
        >
          <div>
            <label htmlFor="companion-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Name *
            </label>
            <input
              type="text"
              id="companion-name"
              name="name"
              autoComplete="off"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input"
              placeholder="John Doe"
              maxLength={100}
              required
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="companion-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email
              </label>
              <input
                type="email"
                id="companion-email"
                name="email"
                autoComplete="email"
                spellCheck={false}
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="input"
                placeholder="john@example.com"
              />
            </div>
            <div>
              <label htmlFor="companion-phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Phone
              </label>
              <input
                type="tel"
                id="companion-phone"
                name="phone"
                autoComplete="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="input"
                placeholder="+1 (555) 123-4567"
                maxLength={20}
              />
            </div>
          </div>
          <div>
            <label htmlFor="companion-notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notes
            </label>
            <textarea
              id="companion-notes"
              name="notes"
              autoComplete="off"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="input"
              rows={3}
              placeholder="Additional information\u2026"
              maxLength={1000}
            />
          </div>
          <div>
            <label htmlFor="dietary-preferences" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Dietary Preferences
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Track dietary restrictions to easily find suitable restaurants when traveling together.
            </p>
            <DietaryTagSelector
              id="dietary-preferences"
              selectedTags={formData.dietaryPreferences}
              onChange={(tags) => setFormData({ ...formData, dietaryPreferences: tags })}
              compact
            />
          </div>
        </form>
      </Modal>

      {/* Trip Companions */}
      <div>
        <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Companions on this trip</h3>
        {manager.items.length === 0 ? (
          <EmptyState.Compact
            icon="👥"
            message="No companions added yet"
          />
        ) : (
          <div className="space-y-3">
            {/* Sort companions to show "Myself" first */}
            {[...manager.items].sort((a, b) => {
              if (a.isMyself && !b.isMyself) return -1;
              if (!a.isMyself && b.isMyself) return 1;
              return a.name.localeCompare(b.name);
            }).map((companion) => {
              const isExpanded = expandedId === companion.id;
              return (
                <div key={companion.id} data-entity-id={`companion-${companion.id}`} className={`border rounded-lg p-4 ${
                  companion.isMyself
                    ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                }`}>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <CompanionAvatar companion={companion} size="md" />
                        <h4 className="font-semibold text-lg text-gray-900 dark:text-white">{companion.name}</h4>
                        {companion.isMyself && (
                          <span className="text-xs bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                            You
                          </span>
                        )}
                        {companion.dietaryPreferences && companion.dietaryPreferences.length > 0 && (
                          <DietaryBadges tags={companion.dietaryPreferences} maxDisplay={3} size="sm" />
                        )}
                      </div>
                      {(companion.email || companion.phone || companion.notes || (companion.dietaryPreferences && companion.dietaryPreferences.length > 0)) && (
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : companion.id)}
                          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {isExpanded ? 'Show less ↑' : 'Show details ↓'}
                        </button>
                      )}
                      {isExpanded && (
                        <div className="mt-3 space-y-2 text-sm">
                          {companion.email && (
                            <div>
                              <span className="font-medium text-gray-600 dark:text-gray-400">Email: </span>
                              <a href={`mailto:${companion.email}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                                {companion.email}
                              </a>
                            </div>
                          )}
                          {companion.phone && (
                            <div>
                              <span className="font-medium text-gray-600 dark:text-gray-400">Phone: </span>
                              <a href={`tel:${companion.phone}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                                {companion.phone}
                              </a>
                            </div>
                          )}
                          {companion.notes && (
                            <div>
                              <span className="font-medium text-gray-600 dark:text-gray-400">Notes: </span>
                              <p className="text-gray-700 dark:text-gray-300 mt-1 whitespace-pre-wrap">{companion.notes}</p>
                            </div>
                          )}
                          {companion.dietaryPreferences && companion.dietaryPreferences.length > 0 && (
                            <div>
                              <span className="font-medium text-gray-600 dark:text-gray-400">Dietary Needs: </span>
                              <div className="mt-1">
                                <DietaryBadges tags={companion.dietaryPreferences} maxDisplay={12} size="sm" />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 flex-shrink-0 self-start">
                      <button
                        onClick={() => startEdit(companion)}
                        className="px-3 py-1 text-xs sm:text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800 whitespace-nowrap"
                        aria-label={`Edit companion ${companion.name}`}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleUnlinkCompanion(companion.id)}
                        className="px-3 py-1 text-xs sm:text-sm bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-800 whitespace-nowrap"
                        aria-label={`Remove companion ${companion.name} from trip`}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Search and Add Existing Companions */}
      {availableCompanions.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Add existing companions</h3>

          {/* Search Input */}
          <div className="mb-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search companions by name\u2026"
              aria-label="Search companions"
              className="input w-full"
            />
          </div>

          {/* Filtered Results */}
          {searchQuery && (
            <div className="space-y-2">
              {filteredCompanions.length > 0 ? (
                [...filteredCompanions].sort((a, b) => {
                  if (a.isMyself && !b.isMyself) return -1;
                  if (!a.isMyself && b.isMyself) return 1;
                  return a.name.localeCompare(b.name);
                }).map((companion) => (
                  <div
                    key={companion.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      companion.isMyself
                        ? 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 border-blue-300 dark:border-blue-700'
                        : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <CompanionAvatar companion={companion} size="sm" />
                      <span className="font-medium text-gray-900 dark:text-white">{companion.name}</span>
                      {companion.isMyself && (
                        <span className="text-xs bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                          You
                        </span>
                      )}
                      {companion.dietaryPreferences && companion.dietaryPreferences.length > 0 && (
                        <DietaryBadges tags={companion.dietaryPreferences} maxDisplay={2} size="sm" />
                      )}
                    </div>
                    <button
                      onClick={() => {
                        handleLinkCompanion(companion.id);
                        setSearchQuery(''); // Clear search after adding
                      }}
                      className="px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800"
                      aria-label={`Add ${companion.name} to trip`}
                    >
                      Add to Trip
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">
                  No companions found matching "{searchQuery}"
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
