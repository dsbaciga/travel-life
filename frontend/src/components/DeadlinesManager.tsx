import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import bookingDeadlineService from "../services/bookingDeadline.service";
import lodgingService from "../services/lodging.service";
import transportationService from "../services/transportation.service";
import activityService from "../services/activity.service";
import {
  DEADLINE_KINDS,
  DEADLINE_KIND_LABELS,
  type BookingDeadline,
  type DeadlineEntityType,
  type DeadlineKind,
} from "../types/bookingDeadline";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { useTimezoneResolver } from "../hooks/useTimezoneResolver";
import {
  convertDateTimeLocalToISO,
  formatDateTimeInTimezone,
} from "../utils/timezone";
import EmptyState from "./EmptyState";

/**
 * DeadlinesManager - cancellation cutoffs, check-in windows and payment due
 * dates attached to a lodging, transportation or activity booking.
 *
 * A deadline is entered and shown in the booking's own timezone (falling back
 * to the trip's, then the user's), because "free cancellation until 6 PM" means
 * 6 PM at the hotel, not on the viewer's clock.
 */
interface DeadlinesManagerProps {
  tripId: number;
  tripTimezone?: string | null;
  onUpdate?: () => void;
}

interface BookingOption {
  key: string;
  entityType: DeadlineEntityType;
  entityId: number;
  label: string;
  timezone: string | null;
}

interface FormState {
  booking: string;
  kind: DeadlineKind;
  dueAt: string;
  note: string;
}

const EMPTY_FORM: FormState = { booking: "", kind: "cancellation", dueAt: "", note: "" };

export default function DeadlinesManager({ tripId, tripTimezone, onUpdate }: DeadlinesManagerProps) {
  const queryClient = useQueryClient();
  const resolveTz = useTimezoneResolver();
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const { data: deadlines = [], isLoading } = useQuery({
    queryKey: ["deadlines", "trip", tripId],
    queryFn: () => bookingDeadlineService.getDeadlinesByTrip(tripId),
  });
  const { data: lodging = [] } = useQuery({
    queryKey: ["lodging", tripId],
    queryFn: () => lodgingService.getLodgingByTrip(tripId),
  });
  const { data: transportation = [] } = useQuery({
    queryKey: ["transportation", tripId],
    queryFn: () => transportationService.getTransportationByTrip(tripId),
  });
  const { data: activities = [] } = useQuery({
    queryKey: ["activities", tripId],
    queryFn: () => activityService.getActivitiesByTrip(tripId),
  });

  const bookings = useMemo<BookingOption[]>(
    () => [
      ...lodging.map((l) => ({
        key: `lodging:${l.id}`,
        entityType: "lodging" as const,
        entityId: l.id,
        label: `Lodging: ${l.name}`,
        timezone: l.timezone ?? null,
      })),
      ...transportation.map((t) => ({
        key: `transportation:${t.id}`,
        entityType: "transportation" as const,
        entityId: t.id,
        label: `Transportation: ${t.type}${t.carrier ? ` (${t.carrier})` : ""}`,
        timezone: t.startTimezone ?? null,
      })),
      ...activities.map((a) => ({
        key: `activity:${a.id}`,
        entityType: "activity" as const,
        entityId: a.id,
        label: `Activity: ${a.name}`,
        timezone: a.timezone ?? null,
      })),
    ],
    [lodging, transportation, activities]
  );
  const bookingByKey = useMemo(() => new Map(bookings.map((b) => [b.key, b])), [bookings]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["deadlines"] });
    queryClient.invalidateQueries({ queryKey: ["trip-validation", tripId] });
    onUpdate?.();
  };

  const targetOf = (d: BookingDeadline) => bookingByKey.get(`${d.entityType}:${d.entityId}`);

  const closeForm = () => {
    setShowForm(false);
    setForm(EMPTY_FORM);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const booking = bookingByKey.get(form.booking);
    if (!booking || !form.dueAt) {
      toast.error("Choose a booking and a due date");
      return;
    }
    setIsSaving(true);
    try {
      const tz = resolveTz(booking.timezone, tripTimezone);
      await bookingDeadlineService.createDeadline(tripId, {
        entityType: booking.entityType,
        entityId: booking.entityId,
        kind: form.kind,
        dueAt: convertDateTimeLocalToISO(form.dueAt, tz),
        note: form.note.trim() || null,
      });
      toast.success("Deadline added");
      closeForm();
      refresh();
    } catch {
      toast.error("Could not add deadline");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleDismissed = async (d: BookingDeadline) => {
    try {
      await bookingDeadlineService.updateDeadline(tripId, d.id, { dismissed: !d.dismissedAt });
      refresh();
    } catch {
      toast.error("Could not update deadline");
    }
  };

  const handleDelete = async (d: BookingDeadline) => {
    const confirmed = await confirm({
      title: "Delete Deadline",
      message: `Delete "${DEADLINE_KIND_LABELS[d.kind]}"?`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) return;
    try {
      await bookingDeadlineService.deleteDeadline(tripId, d.id);
      toast.success("Deadline deleted");
      refresh();
    } catch {
      toast.error("Could not delete deadline");
    }
  };

  const now = Date.now();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-display font-bold text-gray-900 dark:text-white">Deadlines</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Cancellation cutoffs, check-in windows and payment due dates
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => (showForm ? closeForm() : setShowForm(true))}
          disabled={bookings.length === 0}
        >
          {showForm ? "Cancel" : "Add Deadline"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="mb-6 space-y-4 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="deadline-booking">Booking</label>
            <select
              id="deadline-booking"
              className="input w-full"
              value={form.booking}
              onChange={(e) => setForm({ ...form, booking: e.target.value })}
              required
            >
              <option value="">Select a booking…</option>
              {bookings.map((b) => (
                <option key={b.key} value={b.key}>{b.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="deadline-kind">Type</label>
              <select
                id="deadline-kind"
                className="input w-full"
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as DeadlineKind })}
              >
                {DEADLINE_KINDS.map((k) => (
                  <option key={k} value={k}>{DEADLINE_KIND_LABELS[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="deadline-due">
                Due (local time at the booking)
              </label>
              <input
                id="deadline-due"
                type="datetime-local"
                className="input w-full"
                value={form.dueAt}
                onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="deadline-note">Note (optional)</label>
            <input
              id="deadline-note"
              className="input w-full"
              maxLength={500}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" className="btn-secondary" onClick={closeForm} disabled={isSaving}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSaving}>
              {isSaving ? "Saving…" : "Save Deadline"}
            </button>
          </div>
        </form>
      )}

      {isLoading ? null : deadlines.length === 0 ? (
        <EmptyState
          icon="⏰"
          message="No deadlines yet"
          subMessage={
            bookings.length === 0
              ? "Add a lodging, transportation or activity first, then track its deadlines"
              : "Track free-cancellation cutoffs, check-in windows and payment dates"
          }
          actionLabel={bookings.length === 0 ? undefined : "Add Deadline"}
          onAction={bookings.length === 0 ? undefined : () => setShowForm(true)}
        />
      ) : (
        <ul className="space-y-3">
          {deadlines.map((d) => {
            const target = targetOf(d);
            const overdue = !d.dismissedAt && new Date(d.dueAt).getTime() < now;
            return (
              <li
                key={d.id}
                className={`flex items-start justify-between gap-4 rounded-xl border p-4 ${
                  d.dismissedAt
                    ? "border-gray-200 dark:border-gray-700 opacity-60"
                    : overdue
                      ? "border-red-300 dark:border-red-500/40"
                      : "border-gray-200 dark:border-gray-700"
                }`}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {DEADLINE_KIND_LABELS[d.kind]}
                    {overdue && <span className="ml-2 text-xs text-red-600 dark:text-red-400">Overdue</span>}
                    {d.dismissedAt && <span className="ml-2 text-xs text-gray-500">Done</span>}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {target?.label ?? "Booking"} ·{" "}
                    {formatDateTimeInTimezone(d.dueAt, resolveTz(target?.timezone, tripTimezone))}
                  </p>
                  {d.note && <p className="text-sm text-gray-500 dark:text-gray-400">{d.note}</p>}
                </div>
                <div className="flex shrink-0 gap-3 text-sm">
                  <button type="button" onClick={() => toggleDismissed(d)} className="text-primary-600 dark:text-gold hover:underline">
                    {d.dismissedAt ? "Reopen" : "Mark done"}
                  </button>
                  <button type="button" onClick={() => handleDelete(d)} className="text-red-600 dark:text-red-400 hover:underline">
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialogComponent />
    </div>
  );
}
