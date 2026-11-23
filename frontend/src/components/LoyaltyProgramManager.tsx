import { useState } from 'react';
import Icon from './ui/Icon';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import loyaltyProgramService, { LOYALTY_PROGRAMS_QUERY_KEY } from '../services/loyaltyProgram.service';
import {
  LOYALTY_PROGRAM_TYPES,
  LOYALTY_PROGRAM_TYPE_LABELS,
  getLoyaltyProgramTypeIcon,
  maskMembershipNumber,
} from '../types/loyaltyProgram';
import type {
  LoyaltyProgram,
  LoyaltyProgramType,
  CreateLoyaltyProgramInput,
} from '../types/loyaltyProgram';
import { useFormReset } from '../hooks/useFormReset';
import { useSubmitLock } from '../hooks/useSubmitLock';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import Modal from './Modal';
import EmptyState from './EmptyState';

interface ProgramFormData {
  name: string;
  type: LoyaltyProgramType;
  providerName: string;
  providerCode: string;
  alliance: string;
  /** Comma-separated in the form, stored as a list */
  aliases: string;
  membershipNumber: string;
  tier: string;
  pointsBalance: string;
  notes: string;
}

const initialFormState: ProgramFormData = {
  name: '',
  type: 'AIRLINE',
  providerName: '',
  providerCode: '',
  alliance: '',
  aliases: '',
  membershipNumber: '',
  tier: '',
  pointsBalance: '',
  notes: '',
};

const labelClass = 'block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1';

function parseAliases(raw: string): string[] {
  return raw
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);
}

export default function LoyaltyProgramManager() {
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<ProgramFormData>(initialFormState);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());

  const { data: programs = [], isLoading, isError } = useQuery<LoyaltyProgram[]>({
    queryKey: LOYALTY_PROGRAMS_QUERY_KEY,
    queryFn: () => loyaltyProgramService.getAll(),
  });

  const { resetForm, openCreateForm, openEditForm } = useFormReset({
    initialState: initialFormState,
    setFormData,
    setEditingId,
    setShowForm,
  });

  const { isSubmitting, run } = useSubmitLock();

  const refresh = () => queryClient.invalidateQueries({ queryKey: LOYALTY_PROGRAMS_QUERY_KEY });

  const parsedPoints = formData.pointsBalance.trim() === '' ? null : Number(formData.pointsBalance);
  const pointsInvalid =
    parsedPoints !== null && (!Number.isInteger(parsedPoints) || parsedPoints < 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pointsInvalid) {
      toast.error('Points balance must be a whole number, 0 or more');
      return;
    }
    return run(() => save());
  };

  const save = async () => {
    const input: CreateLoyaltyProgramInput = {
      name: formData.name.trim(),
      type: formData.type,
      providerName: formData.providerName.trim(),
      providerCode: formData.providerCode.trim() || null,
      alliance: formData.alliance.trim() || null,
      aliases: parseAliases(formData.aliases),
      membershipNumber: formData.membershipNumber.trim(),
      tier: formData.tier.trim() || null,
      pointsBalance: parsedPoints,
      notes: formData.notes.trim() || null,
    };

    try {
      if (editingId) {
        await loyaltyProgramService.update(editingId, input);
        toast.success('Loyalty program updated');
      } else {
        await loyaltyProgramService.create(input);
        toast.success('Loyalty program added');
      }
      resetForm();
      await refresh();
    } catch {
      toast.error(editingId ? "Couldn't update loyalty program. Try again." : "Couldn't add loyalty program. Try again.");
    }
  };

  const handleDelete = async (program: LoyaltyProgram) => {
    const confirmed = await confirm({
      title: 'Delete loyalty program',
      message: `"${program.name}" is deleted. Bookings that used it keep working but lose the link. You can't undo this.`,
      confirmLabel: 'Delete program',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await loyaltyProgramService.delete(program.id);
      toast.success('Loyalty program deleted');
      await refresh();
    } catch {
      toast.error("Couldn't delete loyalty program. Try again.");
    }
  };

  const startEdit = (program: LoyaltyProgram) => {
    openEditForm(program.id, {
      name: program.name,
      type: program.type,
      providerName: program.providerName,
      providerCode: program.providerCode ?? '',
      alliance: program.alliance ?? '',
      aliases: program.aliases.join(', '),
      membershipNumber: program.membershipNumber,
      tier: program.tier ?? '',
      pointsBalance: program.pointsBalance === null ? '' : String(program.pointsBalance),
      notes: program.notes ?? '',
    });
  };

  const toggleReveal = (id: number) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (isLoading) {
    return <div className="text-center py-4">Loading loyalty programs…</div>;
  }

  if (isError) {
    return <div className="text-center py-4 text-red-600">Failed to load loyalty programs</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
          Loyalty Programs
        </h2>
        {programs.length > 0 && (
        <button onClick={openCreateForm} className="btn btn-primary text-sm sm:text-base whitespace-nowrap">
          <span className="sm:hidden">+ Add</span>
          <span className="hidden sm:inline">+ Add Program</span>
        </button>
        )}
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">Privacy Note</h3>
        <p className="text-sm text-blue-800 dark:text-blue-200">
          Membership numbers are private to your account. They are never shown to people you share a
          trip with and never appear on public share pages. Flights, trains and stays offer to use a
          matching program when you add them.
        </p>
      </div>

      <Modal
        isOpen={showForm}
        onClose={resetForm}
        title={editingId ? 'Edit Loyalty Program' : 'Add Loyalty Program'}
        icon={getLoyaltyProgramTypeIcon(formData.type)}
        maxWidth="lg"
        formId="loyalty-program-form"
        focusFirstInput
        animate
        footer={
          <>
            <button type="button" onClick={resetForm} className="btn btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              form="loyalty-program-form"
              className="btn btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving…' : `${editingId ? 'Update' : 'Add'} Program`}
            </button>
          </>
        }
      >
        <form id="loyalty-program-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="lp-type" className={labelClass}>
                Type *
              </label>
              <select
                id="lp-type"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as LoyaltyProgramType })}
                className="input"
                required
              >
                {LOYALTY_PROGRAM_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {LOYALTY_PROGRAM_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="lp-name" className={labelClass}>
                Program Name *
              </label>
              <input
                type="text"
                id="lp-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="input"
                placeholder="e.g., SkyMiles"
                maxLength={255}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="lp-provider" className={labelClass}>
                Airline / Hotel / Brand *
              </label>
              <input
                type="text"
                id="lp-provider"
                value={formData.providerName}
                onChange={(e) => setFormData({ ...formData, providerName: e.target.value })}
                className="input"
                placeholder="e.g., Delta Air Lines"
                maxLength={255}
                required
              />
              <p className="text-xs text-gray-500 dark:text-dusk-400 mt-1">
                Matched against the carrier or hotel name on your bookings.
              </p>
            </div>
            <div>
              <label htmlFor="lp-code" className={labelClass}>
                IATA Code
              </label>
              <input
                type="text"
                id="lp-code"
                value={formData.providerCode}
                onChange={(e) => setFormData({ ...formData, providerCode: e.target.value.toUpperCase() })}
                className="input"
                placeholder="e.g., DL"
                maxLength={10}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="lp-alliance" className={labelClass}>
                Alliance
              </label>
              <input
                type="text"
                id="lp-alliance"
                value={formData.alliance}
                onChange={(e) => setFormData({ ...formData, alliance: e.target.value })}
                className="input"
                placeholder="e.g., SkyTeam"
                maxLength={100}
              />
            </div>
            <div>
              <label htmlFor="lp-aliases" className={labelClass}>
                Other Names
              </label>
              <input
                type="text"
                id="lp-aliases"
                value={formData.aliases}
                onChange={(e) => setFormData({ ...formData, aliases: e.target.value })}
                className="input"
                placeholder="Comma-separated, e.g., Delta, DL"
              />
            </div>
          </div>

          <div>
            <label htmlFor="lp-number" className={labelClass}>
              Membership Number *
            </label>
            <input
              type="text"
              id="lp-number"
              value={formData.membershipNumber}
              onChange={(e) => setFormData({ ...formData, membershipNumber: e.target.value })}
              className="input"
              maxLength={100}
              autoComplete="off"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="lp-tier" className={labelClass}>
                Status Tier
              </label>
              <input
                type="text"
                id="lp-tier"
                value={formData.tier}
                onChange={(e) => setFormData({ ...formData, tier: e.target.value })}
                className="input"
                placeholder="e.g., Gold"
                maxLength={100}
              />
            </div>
            <div>
              <label htmlFor="lp-points" className={labelClass}>
                Points Balance
              </label>
              <input
                type="number"
                id="lp-points"
                value={formData.pointsBalance}
                onChange={(e) => setFormData({ ...formData, pointsBalance: e.target.value })}
                className="input"
                min={0}
                step={1}
                placeholder="Update it by hand when you check"
              />
            </div>
          </div>

          <div>
            <label htmlFor="lp-notes" className={labelClass}>
              Notes
            </label>
            <textarea
              id="lp-notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="input"
              rows={3}
              maxLength={1000}
            />
          </div>
        </form>
      </Modal>

      {programs.length === 0 ? (
        <EmptyState
          icon="ticket"
          message="No loyalty programs yet"
          subMessage="Add your frequent-flyer and hotel membership numbers to have them offered when you add a flight or stay."
          actionLabel="Add Program"
          onAction={openCreateForm}
        />
      ) : (
        <div className="space-y-3">
          {programs.map((program) => {
            const revealed = revealedIds.has(program.id);
            return (
              <div
                key={program.id}
                className="border border-gray-200 dark:border-dusk-700 rounded-lg p-4 bg-white dark:bg-dusk-800"
              >
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <Icon name={getLoyaltyProgramTypeIcon(program.type)} />
                      <h4 className="font-semibold text-gray-900 dark:text-white break-words min-w-0">
                        {program.providerName} - {program.name}
                      </h4>
                      {program.tier && (
                        <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 px-2 py-0.5 rounded-full">
                          {program.tier}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-dusk-400 space-y-1">
                      <p className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">Number:</span>
                        <span className="font-mono break-all">
                          {revealed ? program.membershipNumber : maskMembershipNumber(program.membershipNumber)}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleReveal(program.id)}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                          aria-label={`${revealed ? 'Hide' : 'Show'} membership number for ${program.name}`}
                        >
                          {revealed ? 'Hide' : 'Show'}
                        </button>
                      </p>
                      {program.pointsBalance !== null && (
                        <p>
                          <span className="font-medium">Points:</span> {program.pointsBalance.toLocaleString()}
                        </p>
                      )}
                      {program.alliance && (
                        <p>
                          <span className="font-medium">Alliance:</span> {program.alliance}
                        </p>
                      )}
                      {program.notes && (
                        <p className="text-gray-500 dark:text-dusk-400 mt-1 line-clamp-2">{program.notes}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => startEdit(program)}
                      className="px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800"
                      aria-label={`Edit ${program.name}`}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(program)}
                      className="px-3 py-1 text-sm bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-800"
                      aria-label={`Delete ${program.name}`}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialogComponent />
    </div>
  );
}
