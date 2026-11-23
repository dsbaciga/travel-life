import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import FormModal from "./FormModal";
import FormModalFooter from "./shared/FormModalFooter";
import CurrencySelect from "./CurrencySelect";
import expenseService from "../services/expense.service";
import { useSubmitLock } from "../hooks/useSubmitLock";
import type { ExpenseParticipant, TripSettlement } from "../types/expense";
import type { SettlementFormValues } from "../utils/settlement";

interface SettlementFormModalProps {
  tripId: number;
  isOpen: boolean;
  onClose: () => void;
  /** Called after the payment was saved, so the caller can refresh what depends on it. */
  onSaved: () => void;
  initial: SettlementFormValues;
  /** Set when editing an existing payment. */
  editing?: TripSettlement | null;
}

/**
 * Records (or edits) a payment between two people on the trip. Pre-filled from a
 * suggested payment on the settle-up panel, but every field stays editable: the
 * person may have paid a different amount, in another currency, on another day.
 */
export default function SettlementFormModal({
  tripId,
  isOpen,
  onClose,
  onSaved,
  initial,
  editing = null,
}: SettlementFormModalProps) {
  const [form, setForm] = useState<SettlementFormValues>(initial);
  const { isSubmitting, run } = useSubmitLock();

  const { data: participants = [] } = useQuery({
    queryKey: ["expense-participants", tripId],
    queryFn: () => expenseService.getParticipants(tripId),
    enabled: !!tripId,
  });

  // Someone who has since left the trip stays selectable on a payment that already names them.
  const options: ExpenseParticipant[] = [...participants];
  if (editing) {
    for (const [key, label] of [
      [editing.from, editing.fromLabel],
      [editing.to, editing.toLabel],
    ] as const) {
      if (!options.some((p) => p.key === key)) options.push({ key, label, kind: "companion" });
    }
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    return run(async () => {
      const amount = Number(form.amount);
      if (!form.from || !form.to) return void toast.error("Choose who paid and who was paid");
      if (form.from === form.to) return void toast.error("Choose two different people");
      if (!Number.isFinite(amount) || amount <= 0) return void toast.error("Enter an amount greater than 0");
      if (!form.currency) return void toast.error("Choose a currency");
      if (!form.date) return void toast.error("Choose the date of the payment");

      const payload = {
        from: form.from,
        to: form.to,
        amount,
        currency: form.currency,
        date: form.date,
        notes: form.notes.trim() || null,
      };
      try {
        if (editing) {
          await expenseService.updateSettlement(tripId, editing.id, payload);
          toast.success("Payment updated");
        } else {
          await expenseService.createSettlement(tripId, payload);
          toast.success("Payment recorded");
        }
        onSaved();
        onClose();
      } catch {
        toast.error("Couldn't save payment. Try again.");
      }
    });
  };

  return (
    <FormModal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? "Edit Payment" : "Record Payment"}
      icon="money"
      formId="settlement-form"
      maxWidth="lg"
      footer={
        <FormModalFooter
          onCancel={onClose}
          formId="settlement-form"
          isSubmitting={isSubmitting}
          submitLabel={editing ? "Update Payment" : "Record Payment"}
          isEditMode={!!editing}
        />
      }
    >
      <form id="settlement-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="settlement-from" className="label">
              Paid by
            </label>
            <select
              id="settlement-from"
              className="input w-full"
              value={form.from}
              onChange={(e) => setForm({ ...form, from: e.target.value })}
            >
              <option value="">Choose a person</option>
              {options.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="settlement-to" className="label">
              Paid to
            </label>
            <select
              id="settlement-to"
              className="input w-full"
              value={form.to}
              onChange={(e) => setForm({ ...form, to: e.target.value })}
            >
              <option value="">Choose a person</option>
              {options.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="settlement-amount" className="label">
              Amount
            </label>
            <input
              id="settlement-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              className="input w-full"
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="settlement-currency" className="label">
              Currency
            </label>
            <CurrencySelect
              id="settlement-currency"
              value={form.currency}
              onChange={(currency) => setForm({ ...form, currency })}
              allowEmpty={false}
              className="input w-full"
            />
          </div>
          <div>
            <label htmlFor="settlement-date" className="label">
              Date
            </label>
            <input
              id="settlement-date"
              type="date"
              className="input w-full"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label htmlFor="settlement-notes" className="label">
            Notes
          </label>
          <textarea
            id="settlement-notes"
            rows={2}
            className="input w-full"
            placeholder="Optional, for example how it was paid"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
      </form>
    </FormModal>
  );
}
