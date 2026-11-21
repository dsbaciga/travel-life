/**
 * A booking's cost lives on its linked expense row (`costExpense`). Service tests describe their mock
 * booking rows with plain `cost` / `currency` fields; this turns such a row (or a list of them) into
 * the shape the service's queries return, so the tests keep reading like the API they exercise.
 */
export function withCost<T>(rowOrRows: T): T {
  if (Array.isArray(rowOrRows)) return rowOrRows.map((row) => withCost(row)) as unknown as T;
  if (rowOrRows === null || typeof rowOrRows !== 'object') return rowOrRows;

  const row = rowOrRows as Record<string, unknown>;
  if (!('cost' in row) && !('currency' in row)) return rowOrRows;

  const { cost, currency, exchangeRate, baseAmount, baseCurrency, ...rest } = row;
  const children = Array.isArray(rest.children) ? { children: rest.children.map((child) => withCost(child)) } : {};
  return {
    ...rest,
    ...children,
    costExpense:
      cost === null || cost === undefined
        ? null
        : {
            id: 900,
            amount: cost,
            currency: currency ?? null,
            exchangeRate: exchangeRate ?? null,
            baseAmount: baseAmount ?? null,
            baseCurrency: baseCurrency ?? null,
          },
  } as unknown as T;
}

/** A trip row whose booking lists describe their costs as plain `cost` fields, in the shape the service queries return. */
export function withTripBookingCosts<T extends Record<string, unknown>>(trip: T): T {
  const out: Record<string, unknown> = { ...trip };
  for (const key of ['activities', 'transportation', 'lodging', 'customItems']) {
    if (Array.isArray(out[key])) out[key] = withCost(out[key]);
  }
  return out as T;
}
