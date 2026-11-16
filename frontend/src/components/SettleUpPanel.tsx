import { useQuery } from "@tanstack/react-query";
import expenseService from "../services/expense.service";
import { formatCurrency } from "../utils/formatCurrency";

/**
 * Per-person totals and the shortest list of payments that settles a trip's
 * split expenses. Everything is computed by the backend in the budget summary's
 * currency; expenses it could not include are listed, never silently dropped.
 *
 * Renders nothing until at least one expense has a payer and a split.
 */
interface SettleUpPanelProps {
  tripId: number;
}

export default function SettleUpPanel({ tripId }: SettleUpPanelProps) {
  const { data } = useQuery({
    queryKey: ["settle-up", tripId],
    queryFn: () => expenseService.getSettleUp(tripId),
    enabled: !!tripId,
  });

  if (!data) return null;
  if (data.balances.length === 0 && data.unconverted.length === 0) return null;

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
          Settle Up
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
                  className="text-sm text-charcoal dark:text-warm-gray"
                >
                  <span className="font-medium">{transfer.fromLabel}</span> pays{" "}
                  <span className="font-medium">{transfer.toLabel}</span>{" "}
                  <span className="tabular-nums">{money(transfer.amount)}</span>
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

      {data.unsplit.length > 0 && data.balances.length > 0 && (
        <p className="text-xs text-slate dark:text-warm-gray/60">
          {data.unsplit.length}{" "}
          {data.unsplit.length === 1 ? "expense has" : "expenses have"} no payer or
          split recorded and {data.unsplit.length === 1 ? "is" : "are"} not
          included.
        </p>
      )}
    </section>
  );
}
