import type {
  ExpenseParticipant,
  ParticipantKey,
  SplitMethod,
} from "../types/expense";
import {
  amountDifference,
  percentageDifference,
  type SplitFormState,
} from "../utils/expenseSplit";

/**
 * The "Paid by" / "Split between" section of the expense form.
 *
 * Fully controlled: the parent owns the state and turns it into an API payload
 * with `buildSplitInput` at submit time, so nothing here depends on setState
 * having flushed before the form submits.
 */
interface ExpenseSplitFieldsProps {
  participants: ExpenseParticipant[];
  state: SplitFormState;
  onChange: (next: SplitFormState) => void;
  /** The expense amount being split (for the running difference). */
  total: number;
  /** Currency code shown beside the custom amounts; may be empty. */
  currency: string;
}

const METHOD_LABELS: Record<SplitMethod, string> = {
  equal: "Equally",
  amount: "By amount",
  percentage: "By percentage",
};

const METHODS: SplitMethod[] = ["equal", "amount", "percentage"];

function isSplitMethod(value: string): value is SplitMethod {
  return METHODS.some((method) => method === value);
}

export default function ExpenseSplitFields({
  participants,
  state,
  onChange,
  total,
  currency,
}: ExpenseSplitFieldsProps) {
  const keys: ParticipantKey[] = participants.map((p) => p.key);
  const hasPayer = state.paidBy !== "";

  const setPayer = (paidBy: string) => {
    if (paidBy === "") {
      onChange({ ...state, paidBy: "" });
      return;
    }
    // Choosing a payer for the first time defaults to sharing with everyone.
    const nobodySelected = !keys.some((key) => state.included[key]);
    const included = nobodySelected
      ? Object.fromEntries(keys.map((key) => [key, true]))
      : state.included;
    onChange({ ...state, paidBy, included });
  };

  const toggle = (key: ParticipantKey, checked: boolean) =>
    onChange({ ...state, included: { ...state.included, [key]: checked } });

  const amountGap = amountDifference(state, keys, total);
  const percentageGap = percentageDifference(state, keys);

  return (
    <fieldset className="sm:col-span-2 rounded-xl border border-primary-100 dark:border-gold/20 p-4 space-y-3">
      <legend className="px-1 text-sm font-medium text-slate dark:text-warm-gray/70">
        Split with travel companions
      </legend>

      <div>
        <label htmlFor="expense-paid-by" className="label">
          Paid by
        </label>
        <select
          id="expense-paid-by"
          value={state.paidBy}
          onChange={(e) => setPayer(e.target.value)}
          className="input w-full"
        >
          <option value="">Not recorded</option>
          {participants.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {hasPayer && (
        <>
          <div>
            <label htmlFor="expense-split-method" className="label">
              Split
            </label>
            <select
              id="expense-split-method"
              value={state.method}
              onChange={(e) => {
                const value = e.target.value;
                if (isSplitMethod(value)) onChange({ ...state, method: value });
              }}
              className="input w-full"
            >
              {METHODS.map((method) => (
                <option key={method} value={method}>
                  {METHOD_LABELS[method]}
                </option>
              ))}
            </select>
          </div>

          <ul className="space-y-2" aria-label="Who shares this expense">
            {participants.map((p) => {
              const included = state.included[p.key] === true;
              return (
                <li key={p.key} className="flex items-center gap-3">
                  <input
                    id={`split-include-${p.key}`}
                    type="checkbox"
                    checked={included}
                    onChange={(e) => toggle(p.key, e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <label
                    htmlFor={`split-include-${p.key}`}
                    className="flex-1 text-sm text-charcoal dark:text-warm-gray"
                  >
                    {p.label}
                  </label>
                  {included && state.method === "amount" && (
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      aria-label={`Amount for ${p.label}`}
                      value={state.amounts[p.key] ?? ""}
                      onChange={(e) =>
                        onChange({
                          ...state,
                          amounts: { ...state.amounts, [p.key]: e.target.value },
                        })
                      }
                      className="input w-28"
                      placeholder="0.00"
                    />
                  )}
                  {included && state.method === "percentage" && (
                    <span className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        inputMode="decimal"
                        aria-label={`Percentage for ${p.label}`}
                        value={state.percentages[p.key] ?? ""}
                        onChange={(e) =>
                          onChange({
                            ...state,
                            percentages: { ...state.percentages, [p.key]: e.target.value },
                          })
                        }
                        className="input w-24"
                        placeholder="0"
                      />
                      <span className="text-sm text-slate dark:text-warm-gray/70">%</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          {state.method === "amount" && (
            <p
              className={`text-xs ${
                amountGap === 0
                  ? "text-green-700 dark:text-green-400"
                  : "text-amber-700 dark:text-amber-400"
              }`}
              role="status"
            >
              {amountGap === 0
                ? "Amounts add up to the total."
                : `${Math.abs(amountGap).toFixed(2)} ${currency} ${
                    amountGap > 0 ? "left to assign" : "over the total"
                  }.`}
            </p>
          )}
          {state.method === "percentage" && (
            <p
              className={`text-xs ${
                percentageGap === 0
                  ? "text-green-700 dark:text-green-400"
                  : "text-amber-700 dark:text-amber-400"
              }`}
              role="status"
            >
              {percentageGap === 0
                ? "Percentages add up to 100%."
                : `${Math.abs(percentageGap)}% ${
                    percentageGap > 0 ? "left to assign" : "over 100%"
                  }.`}
            </p>
          )}
          {state.method === "equal" && (
            <p className="text-xs text-slate dark:text-warm-gray/60">
              Any odd cent goes to the first person listed, so shares always add up
              to the exact total.
            </p>
          )}
        </>
      )}
    </fieldset>
  );
}
