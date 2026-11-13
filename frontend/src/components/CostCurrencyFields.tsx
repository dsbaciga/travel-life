import { useId } from 'react';

interface CostCurrencyFieldsProps {
  cost: string;
  currency: string;
  onCostChange: (value: string) => void;
  onCurrencyChange: (value: string) => void;
  costLabel?: string;
  currencyLabel?: string;
}

/**
 * Reusable cost and currency input field pair
 * Used in Activity, Lodging, Transportation managers
 */
export default function CostCurrencyFields({
  cost,
  currency,
  onCostChange,
  onCurrencyChange,
  costLabel = 'Cost',
  currencyLabel = 'Currency',
}: CostCurrencyFieldsProps) {
  const costFieldId = useId();
  const currencyFieldId = useId();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label
          htmlFor={costFieldId}
          className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
        >
          {costLabel}
        </label>
        <input
          type="number"
          step="0.01"
          id={costFieldId}
          value={cost}
          onChange={(e) => onCostChange(e.target.value)}
          className="input"
          placeholder="0.00"
        />
      </div>

      <div>
        <label
          htmlFor={currencyFieldId}
          className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
        >
          {currencyLabel}
        </label>
        <input
          type="text"
          id={currencyFieldId}
          value={currency}
          onChange={(e) => onCurrencyChange(e.target.value)}
          className="input"
          maxLength={3}
          placeholder="USD"
        />
      </div>
    </div>
  );
}
