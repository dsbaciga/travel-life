import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CurrencySelect from '../CurrencySelect';
import CostCurrencyFields from '../CostCurrencyFields';
import { CONVERTIBLE_CURRENCIES } from '../../constants/currencies';

const optionValues = (select: HTMLElement) =>
  within(select).getAllByRole('option').map((option) => (option as HTMLOptionElement).value);

describe('CurrencySelect', () => {
  it('offers exactly the supported currencies, plus an empty choice', () => {
    render(<CurrencySelect aria-label="Currency" value="" onChange={() => {}} />);
    const select = screen.getByLabelText('Currency');
    expect(select.tagName).toBe('SELECT');
    expect(optionValues(select)).toEqual(['', ...CONVERTIBLE_CURRENCIES.map((c) => c.code)]);
  });

  it('reports the chosen code', async () => {
    const onChange = vi.fn();
    render(<CurrencySelect aria-label="Currency" value="" onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText('Currency'), 'JPY');
    expect(onChange).toHaveBeenCalledWith('JPY');
  });

  it('keeps a previously saved code that is not in the list, labelled as unsupported', () => {
    render(<CurrencySelect aria-label="Currency" value="VND" onChange={() => {}} />);
    const select = screen.getByLabelText('Currency') as HTMLSelectElement;
    expect(select.value).toBe('VND');
    expect(within(select).getByRole('option', { name: /VND.*not supported/i })).toBeInTheDocument();
  });

  it('shows a lower-case stored code as its supported currency', () => {
    render(<CurrencySelect aria-label="Currency" value="eur" onChange={() => {}} />);
    const select = screen.getByLabelText('Currency') as HTMLSelectElement;
    expect(select.value).toBe('EUR');
    expect(optionValues(select)).not.toContain('eur');
  });

  it('has no empty choice when a currency is required and one is set', () => {
    render(<CurrencySelect aria-label="Currency" value="USD" onChange={() => {}} allowEmpty={false} />);
    expect(optionValues(screen.getByLabelText('Currency'))).not.toContain('');
  });
});

describe('CostCurrencyFields', () => {
  it('uses the picker for currency, not a text box', async () => {
    const onCurrencyChange = vi.fn();
    render(<CostCurrencyFields cost="" currency="" onCostChange={() => {}} onCurrencyChange={onCurrencyChange} />);
    const currency = screen.getByLabelText('Currency');
    expect(currency.tagName).toBe('SELECT');
    await userEvent.selectOptions(currency, 'EUR');
    expect(onCurrencyChange).toHaveBeenCalledWith('EUR');
  });
});
