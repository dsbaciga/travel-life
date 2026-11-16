import { CONVERTIBLE_CURRENCIES } from '../constants/currencies';

interface CurrencySelectProps {
  id?: string;
  /** Three-letter code, or '' for none. */
  value: string;
  onChange: (code: string) => void;
  className?: string;
  /** Offer a "no currency" choice. Turn off where a currency is always required. */
  allowEmpty?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-describedby'?: string;
}

const SUPPORTED_CODES = new Set(CONVERTIBLE_CURRENCIES.map((currency) => currency.code));

/**
 * The currency picker for every form.
 *
 * Currency used to be a free-text box in most forms, which let through typos
 * and codes the app cannot convert, so those costs silently dropped out of the
 * trip budget. The choices here are the currencies exchange rates are available
 * for (`CONVERTIBLE_CURRENCIES`).
 *
 * An item saved earlier with a code outside that list keeps it: the code is
 * shown as an extra, labelled option so that opening and saving the form does
 * not change the stored value. It can be switched to a supported currency but
 * not back.
 */
export default function CurrencySelect({
  id,
  value,
  onChange,
  className = 'input',
  allowEmpty = true,
  emptyLabel = 'No currency',
  disabled,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
}: CurrencySelectProps) {
  const current = (value ?? '').trim().toUpperCase();
  const isLegacy = current !== '' && !SUPPORTED_CODES.has(current);

  return (
    <select
      id={id}
      value={current}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
    >
      {/* With no value and no empty choice, a select would display its first
          option while the form still held ''. Show the gap instead. */}
      {(allowEmpty || current === '') && <option value="">{allowEmpty ? emptyLabel : 'Choose a currency'}</option>}
      {isLegacy && <option value={current}>{current} (not supported for conversion)</option>}
      {CONVERTIBLE_CURRENCIES.map((currency) => (
        <option key={currency.code} value={currency.code}>
          {currency.code} — {currency.label}
        </option>
      ))}
    </select>
  );
}
