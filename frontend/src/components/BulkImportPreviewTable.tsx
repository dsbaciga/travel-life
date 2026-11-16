import type { ImportEntity, ImportRowResult } from '../types/bulkImport';

interface BulkImportPreviewTableProps {
  entity: ImportEntity;
  rows: ImportRowResult[];
  /** Zero-based indexes of valid rows the user has switched off. */
  excluded: ReadonlySet<number>;
  onToggle: (index: number) => void;
  /** Formats an ISO instant the way the preview should show it. */
  formatTime: (iso: string, timezone: string | null) => string;
  disabled?: boolean;
}

const text = (value: string | number | boolean | null | undefined): string =>
  value === null || value === undefined || value === '' ? '' : String(value);

/**
 * Every parsed row, with the values the server understood and the errors and warnings it
 * found. Valid rows have a checkbox so warnings (typically duplicates) can be included or left
 * out; rows with errors can never be imported.
 */
export default function BulkImportPreviewTable({
  entity,
  rows,
  excluded,
  onToggle,
  formatTime,
  disabled,
}: BulkImportPreviewTableProps) {
  const columns =
    entity === 'locations'
      ? ['Name', 'Address', 'Lat', 'Lng', 'Category']
      : ['Name', 'Start', 'End', 'Location', 'Cost'];

  const cells = (row: ImportRowResult): string[] => {
    const n = row.normalized;
    if (entity === 'locations') {
      return [text(n.name), text(n.address), text(n.latitude), text(n.longitude), text(n.category)];
    }
    const zone = typeof n.timezone === 'string' ? n.timezone : null;
    return [
      text(n.name),
      typeof n.startTime === 'string' ? formatTime(n.startTime, zone) : '',
      typeof n.endTime === 'string' ? formatTime(n.endTime, zone) : '',
      text(n.location),
      n.cost === null || n.cost === undefined ? '' : `${text(n.cost)} ${text(n.currency)}`.trim(),
    ];
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 dark:border-dusk-600">
      <table className="min-w-full text-sm">
        <thead className="bg-stone-50 dark:bg-dusk-800 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-dusk-400">
          <tr>
            <th className="px-3 py-2 w-10">
              <span className="sr-only">Include</span>
            </th>
            <th className="px-3 py-2">Row</th>
            {columns.map((c) => (
              <th key={c} className="px-3 py-2">{c}</th>
            ))}
            <th className="px-3 py-2">Problems</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100 dark:divide-dusk-700">
          {rows.map((row) => {
            const isInvalid = row.status === 'invalid';
            const isOff = !isInvalid && excluded.has(row.index);
            return (
              <tr
                key={row.index}
                data-testid={`import-row-${row.index + 1}`}
                className={
                  isInvalid
                    ? 'bg-red-50/60 dark:bg-red-900/10'
                    : isOff
                      ? 'opacity-60'
                      : row.warnings.length > 0
                        ? 'bg-amber-50/60 dark:bg-amber-900/10'
                        : ''
                }
              >
                <td className="px-3 py-2 align-top">
                  {isInvalid ? null : (
                    <input
                      type="checkbox"
                      className="h-5 w-5 rounded border-stone-300 text-primary-600 focus:ring-primary-500"
                      checked={!isOff}
                      disabled={disabled}
                      onChange={() => onToggle(row.index)}
                      aria-label={`Include row ${row.index + 1}`}
                    />
                  )}
                </td>
                <td className="px-3 py-2 align-top text-stone-500 dark:text-dusk-400 whitespace-nowrap">{row.index + 1}</td>
                {cells(row).map((value, i) => (
                  <td key={columns[i]} className="px-3 py-2 align-top max-w-[16rem] truncate text-stone-800 dark:text-dusk-200" title={value}>
                    {value}
                  </td>
                ))}
                <td className="px-3 py-2 align-top min-w-[16rem]">
                  {row.errors.map((e, i) => (
                    <p key={`e${i}`} className="text-red-700 dark:text-red-400">
                      <span className="font-medium">Error</span>
                      {e.field ? ` (${e.field})` : ''}: {e.message}
                    </p>
                  ))}
                  {row.warnings.map((w, i) => (
                    <p key={`w${i}`} className="text-amber-700 dark:text-amber-400">
                      <span className="font-medium">Warning</span>: {w.message}
                    </p>
                  ))}
                  {row.errors.length === 0 && row.warnings.length === 0 && (
                    <span className="text-stone-400 dark:text-dusk-500">OK</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
