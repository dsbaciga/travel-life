import { useState, useEffect, useCallback, useMemo } from 'react';
import checklistService from '../services/checklist.service';
import type { Checklist, ChecklistItem, SouvenirMetadata } from '../types/checklist';
import toast from 'react-hot-toast';
import Modal from './Modal';
import EmptyState from './EmptyState';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

/**
 * SouvenirManager handles tracking souvenirs/gifts to bring back from trips.
 * Uses the checklist system with 'souvenirs' type and stores souvenir-specific
 * data in the metadata JSON field of ChecklistItem.
 *
 * Features:
 * - Budget tracking with estimated and actual prices
 * - Multi-currency support with grouped totals
 * - Recipient tracking (forWhom field)
 * - Purchase status tracking
 * - Budget summary showing totals by currency
 *
 * @param props - Component props
 * @param props.tripId - The ID of the trip
 * @param props.onUpdate - Callback triggered after CRUD operations to refresh parent data
 */
interface SouvenirManagerProps {
  tripId: number;
  onUpdate?: () => void;
}

interface SouvenirFormData {
  name: string;
  forWhom: string;
  estimatedPrice: string;
  actualPrice: string;
  currency: string;
  purchased: boolean;
}

const initialFormState: SouvenirFormData = {
  name: '',
  forWhom: '',
  estimatedPrice: '',
  actualPrice: '',
  currency: 'USD',
  purchased: false,
};

// Common currency options
const CURRENCY_OPTIONS = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '\u20AC', name: 'Euro' },
  { code: 'GBP', symbol: '\u00A3', name: 'British Pound' },
  { code: 'JPY', symbol: '\u00A5', name: 'Japanese Yen' },
  { code: 'CNY', symbol: '\u00A5', name: 'Chinese Yuan' },
  { code: 'KRW', symbol: '\u20A9', name: 'Korean Won' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  { code: 'INR', symbol: '\u20B9', name: 'Indian Rupee' },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso' },
  { code: 'THB', symbol: '\u0E3F', name: 'Thai Baht' },
  { code: 'VND', symbol: '\u20AB', name: 'Vietnamese Dong' },
];

function getCurrencySymbol(code: string): string {
  const currency = CURRENCY_OPTIONS.find(c => c.code === code);
  return currency?.symbol || code;
}

function formatPrice(amount: number | undefined, currency: string): string {
  if (amount === undefined || amount === null) return '-';
  const symbol = getCurrencySymbol(currency);
  // For currencies like JPY, KRW, VND that don't use decimals
  const noDecimalCurrencies = ['JPY', 'KRW', 'VND'];
  if (noDecimalCurrencies.includes(currency)) {
    return `${symbol}${Math.round(amount).toLocaleString()}`;
  }
  return `${symbol}${amount.toFixed(2)}`;
}

function parseSouvenirMetadata(metadata: Record<string, unknown> | null): SouvenirMetadata {
  if (!metadata) {
    return { forWhom: '', currency: 'USD', purchased: false };
  }
  return {
    forWhom: (metadata.forWhom as string) || '',
    estimatedPrice: metadata.estimatedPrice as number | undefined,
    actualPrice: metadata.actualPrice as number | undefined,
    currency: (metadata.currency as string) || 'USD',
    purchased: (metadata.purchased as boolean) || false,
  };
}

export default function SouvenirManager({ tripId, onUpdate }: SouvenirManagerProps) {
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<SouvenirFormData>(initialFormState);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { confirm, ConfirmDialogComponent } = useConfirmDialog();

  // Load or create the souvenirs checklist for this trip
  const loadChecklist = useCallback(async () => {
    try {
      setLoading(true);
      const checklists = await checklistService.getChecklistsByTripId(tripId);
      const souvenirChecklist = checklists.find(c => c.type === 'souvenirs');

      if (souvenirChecklist) {
        setChecklist(souvenirChecklist);
      } else {
        // Create the souvenir checklist if it doesn't exist
        const newChecklist = await checklistService.createChecklist({
          name: 'Souvenirs & Gifts',
          description: 'Track souvenirs and gifts to bring back from your trip',
          type: 'souvenirs',
          tripId,
        });
        setChecklist(newChecklist);
      }
    } catch (error) {
      console.error('Failed to load souvenirs checklist:', error);
      toast.error('Failed to load souvenirs');
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    loadChecklist();
  }, [loadChecklist]);

  // Calculate budget summary grouped by currency
  const budgetSummary = useMemo(() => {
    if (!checklist?.items) return { estimated: {}, actual: {} };

    const estimated: Record<string, number> = {};
    const actual: Record<string, number> = {};

    checklist.items.forEach(item => {
      const metadata = parseSouvenirMetadata(item.metadata);
      const currency = metadata.currency || 'USD';

      if (metadata.estimatedPrice !== undefined) {
        estimated[currency] = (estimated[currency] || 0) + metadata.estimatedPrice;
      }
      if (metadata.actualPrice !== undefined) {
        actual[currency] = (actual[currency] || 0) + metadata.actualPrice;
      }
    });

    return { estimated, actual };
  }, [checklist?.items]);

  const resetForm = useCallback(() => {
    setFormData(initialFormState);
    setEditingItemId(null);
    setShowForm(false);
  }, []);

  const openCreateForm = useCallback(() => {
    setFormData(initialFormState);
    setEditingItemId(null);
    setShowForm(true);
  }, []);

  const openEditForm = useCallback((item: ChecklistItem) => {
    const metadata = parseSouvenirMetadata(item.metadata);
    setFormData({
      name: item.name,
      forWhom: metadata.forWhom,
      estimatedPrice: metadata.estimatedPrice?.toString() || '',
      actualPrice: metadata.actualPrice?.toString() || '',
      currency: metadata.currency,
      purchased: metadata.purchased,
    });
    setEditingItemId(item.id);
    setShowForm(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checklist) return;

    setIsSubmitting(true);
    try {
      const metadata: Record<string, unknown> = {
        forWhom: formData.forWhom,
        estimatedPrice: formData.estimatedPrice ? parseFloat(formData.estimatedPrice) : undefined,
        actualPrice: formData.actualPrice ? parseFloat(formData.actualPrice) : undefined,
        currency: formData.currency,
        purchased: formData.purchased,
      };

      if (editingItemId) {
        // Update existing item
        await checklistService.updateChecklistItem(editingItemId, {
          name: formData.name,
          isChecked: formData.purchased,
          metadata,
        });
        toast.success('Souvenir updated');
      } else {
        // Create new item
        await checklistService.addChecklistItem(checklist.id, {
          name: formData.name,
          metadata,
        });
        toast.success('Souvenir added');
      }

      resetForm();
      await loadChecklist();
      onUpdate?.();
    } catch (error) {
      console.error('Failed to save souvenir:', error);
      toast.error('Failed to save souvenir');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTogglePurchased = async (item: ChecklistItem) => {
    const metadata = parseSouvenirMetadata(item.metadata);
    const newPurchased = !metadata.purchased;

    try {
      const updatedMetadata: Record<string, unknown> = {
        ...metadata,
        purchased: newPurchased,
      };
      await checklistService.updateChecklistItem(item.id, {
        isChecked: newPurchased,
        metadata: updatedMetadata,
      });
      await loadChecklist();
      onUpdate?.();
    } catch (error) {
      console.error('Failed to update purchase status:', error);
      toast.error('Failed to update purchase status');
    }
  };

  const handleDelete = async (itemId: number) => {
    const confirmed = await confirm({
      title: 'Delete Souvenir',
      message: 'Are you sure you want to delete this souvenir? This action cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });

    if (!confirmed) return;

    try {
      await checklistService.deleteChecklistItem(itemId);
      toast.success('Souvenir deleted');
      await loadChecklist();
      onUpdate?.();
    } catch (error) {
      console.error('Failed to delete souvenir:', error);
      toast.error('Failed to delete souvenir');
    }
  };

  const renderBudgetSummary = () => {
    const estimatedEntries = Object.entries(budgetSummary.estimated);
    const actualEntries = Object.entries(budgetSummary.actual);

    if (estimatedEntries.length === 0 && actualEntries.length === 0) {
      return null;
    }

    return (
      <div className="bg-gradient-to-r from-primary-50 to-primary-100 dark:from-navy-800 dark:to-navy-700 rounded-xl p-4 mb-6 border border-primary-200 dark:border-gold/20">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <span>💰</span> Budget Summary
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Estimated Total */}
          <div className="bg-white/80 dark:bg-navy-900/50 rounded-lg p-3">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Estimated Budget</p>
            {estimatedEntries.length > 0 ? (
              <div className="space-y-1">
                {estimatedEntries.map(([currency, amount]) => (
                  <p key={currency} className="text-lg font-bold text-primary-600 dark:text-gold">
                    {formatPrice(amount, currency)} {currency}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-lg text-gray-400 dark:text-gray-400">-</p>
            )}
          </div>

          {/* Actual Spent */}
          <div className="bg-white/80 dark:bg-navy-900/50 rounded-lg p-3">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Actual Spent</p>
            {actualEntries.length > 0 ? (
              <div className="space-y-1">
                {actualEntries.map(([currency, amount]) => (
                  <p key={currency} className="text-lg font-bold text-green-600 dark:text-green-400">
                    {formatPrice(amount, currency)} {currency}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-lg text-gray-400 dark:text-gray-400">-</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderSouvenirItem = (item: ChecklistItem) => {
    const metadata = parseSouvenirMetadata(item.metadata);

    return (
      <div
        key={item.id}
        data-entity-id={`souvenir-${item.id}`}
        className={`bg-white dark:bg-gray-800 border rounded-lg shadow p-4 hover:shadow-md transition-shadow ${
          metadata.purchased
            ? 'border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-900/20'
            : 'border-gray-200 dark:border-gray-700'
        }`}
      >
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          <div className="pt-1">
            <input
              type="checkbox"
              checked={metadata.purchased}
              onChange={() => handleTogglePurchased(item)}
              className="w-5 h-5 rounded border-primary-300 dark:border-gold/30 text-primary-600 dark:text-gold focus:ring-primary-500 dark:focus:ring-gold/50"
              aria-label={`Mark ${item.name} as ${metadata.purchased ? 'not purchased' : 'purchased'}`}
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h4 className={`font-semibold text-gray-900 dark:text-white break-words min-w-0 ${metadata.purchased ? 'line-through opacity-70' : ''}`}>
                {item.name}
              </h4>
              {metadata.purchased && (
                <span className="text-xs bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full">
                  Purchased
                </span>
              )}
            </div>

            {/* Recipient */}
            {metadata.forWhom && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                <span className="font-medium">For:</span> {metadata.forWhom}
              </p>
            )}

            {/* Price info */}
            <div className="flex flex-wrap gap-4 text-sm">
              {metadata.estimatedPrice !== undefined && (
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Budget: </span>
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    {formatPrice(metadata.estimatedPrice, metadata.currency)}
                  </span>
                </div>
              )}
              {metadata.actualPrice !== undefined && (
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Actual: </span>
                  <span className="font-medium text-green-600 dark:text-green-400">
                    {formatPrice(metadata.actualPrice, metadata.currency)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => openEditForm(item)}
              className="px-2.5 py-1 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800"
              aria-label={`Edit ${item.name}`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => handleDelete(item.id)}
              className="px-2.5 py-1 text-sm bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-800"
              aria-label={`Delete ${item.name}`}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-48 mx-auto mb-4"></div>
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded mb-4"></div>
          <div className="space-y-3">
            <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  const items = checklist?.items || [];
  const purchasedItems = items.filter(item => parseSouvenirMetadata(item.metadata).purchased);
  const unpurchasedItems = items.filter(item => !parseSouvenirMetadata(item.metadata).purchased);

  return (
    <div className="space-y-6">
      <ConfirmDialogComponent />

      {/* Header */}
      <div className="flex flex-col-reverse items-start gap-3 sm:flex-row sm:justify-between sm:items-center">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
          Souvenirs & Gifts
        </h2>
        <button
          type="button"
          onClick={openCreateForm}
          className="btn btn-primary text-sm sm:text-base whitespace-nowrap"
        >
          <span className="sm:hidden">+ Add</span>
          <span className="hidden sm:inline">+ Add Souvenir</span>
        </button>
      </div>

      {/* Budget Summary */}
      {renderBudgetSummary()}

      {/* Form Modal */}
      <Modal
        isOpen={showForm}
        onClose={resetForm}
        title={editingItemId ? 'Edit Souvenir' : 'Add Souvenir'}
        icon="🎁"
        maxWidth="lg"
        formId="souvenir-form"
        focusFirstInput
        animate
        footer={
          <>
            <button
              type="button"
              onClick={resetForm}
              disabled={isSubmitting}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="souvenir-form"
              disabled={isSubmitting}
              className="btn btn-primary disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : editingItemId ? 'Update Souvenir' : 'Add Souvenir'}
            </button>
          </>
        }
      >
        <form id="souvenir-form" onSubmit={handleSubmit} className="space-y-4">
          {/* Item Name */}
          <div>
            <label htmlFor="souvenir-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Item Name *
            </label>
            <input
              type="text"
              id="souvenir-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input"
              placeholder="e.g., Handmade pottery, Local chocolates"
              maxLength={500}
              required
            />
          </div>

          {/* Recipient */}
          <div>
            <label htmlFor="souvenir-for-whom" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              For Whom
            </label>
            <input
              type="text"
              id="souvenir-for-whom"
              value={formData.forWhom}
              onChange={(e) => setFormData({ ...formData, forWhom: e.target.value })}
              className="input"
              placeholder="e.g., Mom, Friend John, Myself"
              maxLength={200}
            />
          </div>

          {/* Currency */}
          <div>
            <label htmlFor="souvenir-currency" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Currency
            </label>
            <select
              id="souvenir-currency"
              value={formData.currency}
              onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
              className="input"
            >
              {CURRENCY_OPTIONS.map(currency => (
                <option key={currency.code} value={currency.code}>
                  {currency.symbol} {currency.code} - {currency.name}
                </option>
              ))}
            </select>
          </div>

          {/* Prices */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="souvenir-estimated-price" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Estimated Price
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
                  {getCurrencySymbol(formData.currency)}
                </span>
                <input
                  type="number"
                  id="souvenir-estimated-price"
                  value={formData.estimatedPrice}
                  onChange={(e) => setFormData({ ...formData, estimatedPrice: e.target.value })}
                  className="input pl-8"
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>

            <div>
              <label htmlFor="souvenir-actual-price" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Actual Price
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
                  {getCurrencySymbol(formData.currency)}
                </span>
                <input
                  type="number"
                  id="souvenir-actual-price"
                  value={formData.actualPrice}
                  onChange={(e) => setFormData({ ...formData, actualPrice: e.target.value })}
                  className="input pl-8"
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>
          </div>

          {/* Purchased Toggle */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="souvenir-purchased"
              checked={formData.purchased}
              onChange={(e) => setFormData({ ...formData, purchased: e.target.checked })}
              className="w-5 h-5 rounded border-primary-300 dark:border-gold/30 text-primary-600 dark:text-gold focus:ring-primary-500 dark:focus:ring-gold/50"
            />
            <label htmlFor="souvenir-purchased" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Already purchased
            </label>
          </div>
        </form>
      </Modal>

      {/* Souvenirs List */}
      {items.length === 0 ? (
        <EmptyState
          icon="🎁"
          message="No Souvenirs Yet"
          subMessage="Track gifts and souvenirs you want to bring back from your trip. Keep track of who they're for and stay within budget!"
          actionLabel="Add Your First Souvenir"
          onAction={openCreateForm}
        />
      ) : (
        <div className="space-y-6">
          {/* To Buy */}
          {unpurchasedItems.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <span>🛒</span> To Buy
                <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                  ({unpurchasedItems.length})
                </span>
              </h3>
              <div className="space-y-3">
                {unpurchasedItems.map(renderSouvenirItem)}
              </div>
            </div>
          )}

          {/* Purchased */}
          {purchasedItems.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <span>✅</span> Purchased
                <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                  ({purchasedItems.length})
                </span>
              </h3>
              <div className="space-y-3">
                {purchasedItems.map(renderSouvenirItem)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
