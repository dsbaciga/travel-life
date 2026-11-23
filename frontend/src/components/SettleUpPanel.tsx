import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import expenseService from "../services/expense.service";
import { formatCurrency } from "../utils/formatCurrency";
import { formatDateOnly } from "../utils/timezone";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { useTripEditAccess } from "../hooks/useTripEditAccess";
import SettlementFormModal from "./SettlementFormModal";
import { todayDateOnly, type SettlementFormValues } from "../utils/settlement";
import type { TripSettlement } from "../types/expense";

/**
 * Per-person totals and the shortest list of payments that settles a trip's
 * split expenses. Everything is computed by the backend in the budget summary's
 * currency; expenses it could not include are listed, never silently dropped.
 *
 * "Record payment" on a suggested payment logs that it happened. Recorded
 * payments are subtracted from the balances, so the suggestions shrink as people
 * pay each other back; they are listed below with edit and delete.
 *
 * Renders nothing until at least one expense has a payer and a split.
 */
interface SettleUpPanelProps {
  tripId: number;
}

export default function SettleUpPanel({ tripId }: SettleUpPanelProps) {
  const queryClient = useQueryClient();
  // View-only collaborators see balances and payments but cannot record, edit or delete.
  const { canEdit } = useTripEditAccess(tripId);
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const [formState, setFormState] = useState<{
    initial: SettlementFormValues;
    editing: TripSettlement | null;
  } | null>(null);

  const { data } = useQuery({
    queryKey: ["settle-up", tripId],
    queryFn: () => expenseService.getSettleUp(tripId),
    enabled: !!tripId,
  });
  const { data: settlements = [] } = useQuery({
    queryKey: ["settlements", tripId],
    queryFn: () => expenseService.getSettlements(tripId),
    enabled: !!tripId,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["settle-up", tripId] });
    queryClient.invalidateQueries({ queryKey: ["settlements", tripId] });
  };

  const handleDelete = async (settlement: TripSettlement) => {
    const confirmed = await confirm({
      title: "Delete payment",
      message: `Delete the ${formatCurrency(settlement.amount, settlement.currency)} payment from ${settlement.fromLabel} to ${settlement.toLabel}? What is owed is recalculated.`,
      confirmLabel: "Delete payment",
      variant: "danger",
    });
    if (!confirmed) return;
    try {
      await expenseService.deleteSettlement(tripId, settlement.id);
      toast.success("Payment deleted");
      refresh();
    } catch {
      toast.error("Couldn't delete payment. Try again.");
    }
  };

  if (!data) return null;
  if (data.balances.length === 0 && data.unconverted.length === 0 && settlements.length === 0) {
    return null;
  }

  const money = (amount: number) => formatCurrency(amount, data.currency);

  return (
    <section
      aria-labelledby="settle-up-heading"
      className="bg-white dark:bg-navy-700/50 rounded-2xl border border-primary-100 dark:border-gold/20 p-6 space-y-4"
    >
      <div>
        <h3
          id="settle-up-heading"
          className="font-body font-semibold text-lg text-charcoal dark:text-warm-gray"
        >
          Settle up
        </h3>
        <p className="text-xs text-slate dark:text-warm-gray/60">
          Split expenses only, in {data.currency}.
        </p>
      </div>

      {data.balances.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate dark:text-warm-gray/70">
                <th scope="col" className="py-1 pr-3 font-medium">Person</th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">Paid</th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">Share</th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">Settled</th>
                <th scope="col" className="py-1 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.balances.map((balance) => (
                <tr
                  key={balance.participant}
                  className="border-t border-primary-100 dark:border-gold/10"
                >
                  <th
                    scope="row"
                    className="py-2 pr-3 text-left font-medium text-charcoal dark:text-warm-gray"
                  >
                    {balance.label}
                  </th>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(balance.paid)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(balance.owed)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {balance.settledOut > 0 || balance.settledIn > 0
                      ? money(balance.settledOut - balance.settledIn)
                      : ""}
                  </td>
                  <td
                    className={`py-2 text-right tabular-nums font-medium ${
                      balance.net > 0
                        ? "text-green-700 dark:text-green-400"
                        : balance.net < 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-slate dark:text-warm-gray/70"
                    }`}
                  >
                    {balance.net > 0 ? "gets back " : balance.net < 0 ? "owes " : ""}
                    {balance.net === 0 ? "settled" : money(Math.abs(balance.net))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.balances.length > 0 &&
        (data.transfers.length === 0 ? (
          <p className="text-sm text-green-700 dark:text-green-400">
            Everyone is settled up.
          </p>
        ) : (
          <div>
            <p className="text-sm font-medium text-charcoal dark:text-warm-gray mb-2">
              To settle up
              <span className="ml-1 text-xs font-normal text-slate dark:text-warm-gray/60">
                ({data.transfers.length} {data.transfers.length === 1 ? "payment" : "payments"})
              </span>
            </p>
            <ul className="space-y-1">
              {data.transfers.map((transfer) => (
                <li
                  key={`${transfer.from}-${transfer.to}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-charcoal dark:text-warm-gray"
                >
                  <span>
                    <span className="font-medium">{transfer.fromLabel}</span> pays{" "}
                    <span className="font-medium">{transfer.toLabel}</span>{" "}
                    <span className="tabular-nums">{money(transfer.amount)}</span>
                  </span>
                  {canEdit && (
                  <button
                    type="button"
                    className="text-xs font-medium text-primary-600 hover:underline dark:text-gold"
                    aria-label={`Record payment from ${transfer.fromLabel} to ${transfer.toLabel}`}
                    onClick={() =>
                      setFormState({
                        editing: null,
                        initial: {
                          from: transfer.from,
                          to: transfer.to,
                          amount: String(transfer.amount),
                          currency: data.currency,
                          date: todayDateOnly(),
                          notes: "",
                        },
                      })
                    }
                  >
                    Record payment
                  </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}

      {data.unconverted.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-900/20">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Not included in the settlement
          </p>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400/90">
            No exchange rate was available, so these split expenses are left out
            rather than guessed at:
          </p>
          <ul className="mt-2 space-y-1">
            {data.unconverted.map((item) => (
              <li
                key={item.expenseId}
                className="text-sm text-amber-800 dark:text-amber-300"
              >
                {item.description} — {formatCurrency(item.amount, item.currency)}
                {item.currency ? ` ${item.currency}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.unconvertedSettlements.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-900/20">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Payments not counted
          </p>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400/90">
            No exchange rate was available, so these recorded payments are not
            subtracted from what is owed:
          </p>
          <ul className="mt-2 space-y-1">
            {data.unconvertedSettlements.map((item) => (
              <li
                key={item.settlementId}
                className="text-sm text-amber-800 dark:text-amber-300"
              >
                {item.fromLabel} paid {item.toLabel} {formatCurrency(item.amount, item.currency)}{" "}
                {item.currency}
              </li>
            ))}
          </ul>
        </div>
      )}

      {settlements.length > 0 && (
        <div>
          <p className="text-sm font-medium text-charcoal dark:text-warm-gray mb-2">
            Payments recorded
          </p>
          <ul className="divide-y divide-primary-100 dark:divide-gold/10">
            {settlements.map((settlement) => (
              <li
                key={settlement.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm text-charcoal dark:text-warm-gray"
              >
                <div className="min-w-0">
                  <div>
                    <span className="font-medium">{settlement.fromLabel}</span> paid{" "}
                    <span className="font-medium">{settlement.toLabel}</span>{" "}
                    <span className="tabular-nums">
                      {formatCurrency(settlement.amount, settlement.currency)} {settlement.currency}
                    </span>
                  </div>
                  <div className="text-xs text-slate dark:text-warm-gray/60">
                    {formatDateOnly(settlement.date)}
                    {settlement.notes ? ` · ${settlement.notes}` : ""}
                  </div>
                </div>
                {canEdit && (
                <div className="flex shrink-0 gap-3">
                  <button
                    type="button"
                    className="text-xs font-medium text-primary-600 hover:underline dark:text-gold"
                    aria-label={`Edit payment from ${settlement.fromLabel} to ${settlement.toLabel}`}
                    onClick={() =>
                      setFormState({
                        editing: settlement,
                        initial: {
                          from: settlement.from,
                          to: settlement.to,
                          amount: String(settlement.amount),
                          currency: settlement.currency,
                          date: settlement.date,
                          notes: settlement.notes ?? "",
                        },
                      })
                    }
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                    aria-label={`Delete payment from ${settlement.fromLabel} to ${settlement.toLabel}`}
                    onClick={() => handleDelete(settlement)}
                  >
                    Delete
                  </button>
                </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.unsplit.length > 0 && data.balances.length > 0 && (
        <p className="text-xs text-slate dark:text-warm-gray/60">
          {data.unsplit.length}{" "}
          {data.unsplit.length === 1 ? "expense has" : "expenses have"} no payer or
          split recorded and {data.unsplit.length === 1 ? "is" : "are"} not
          included.
        </p>
      )}

      {formState && (
        <SettlementFormModal
          tripId={tripId}
          isOpen
          onClose={() => setFormState(null)}
          onSaved={refresh}
          initial={formState.initial}
          editing={formState.editing}
        />
      )}
      <ConfirmDialogComponent />
    </section>
  );
}
