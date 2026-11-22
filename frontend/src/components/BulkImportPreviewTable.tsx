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

const PREVIEW_COLUMNS: Record<ImportEntity, string[]> = {
  locations: ['Name', 'Address', 'Lat', 'Lng', 'Category'],
  activities: ['Name', 'Start', 'End', 'Location', 'Cost'],
  lodging: ['Name', 'Type', 'Check-in', 'Check-out', 'Cost'],
  transportation: ['Type', 'From', 'To', 'Departure', 'Arrival', 'Cost'],
};

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
  const columns = PREVIEW_COLUMNS[entity];

  const cost = (n: ImportRowResult['normalized']): string =>
    n.cost === null || n.cost === undefined ? '' : `${text(n.cost)} ${text(n.currency)}`.trim();

  const time = (iso: unknown, zone: unknown): string =>
    typeof iso === 'string' ? formatTime(iso, typeof zone === 'string' ? zone : null) : '';

  const cells = (row: ImportRowResult): string[] => {
    const n = row.normalized;
    if (entity === 'locations') {
      return [text(n.name), text(n.address), text(n.latitude), text(n.longitude), text(n.category)];
    }
    if (entity === 'lodging') {
      return [text(n.name), text(n.type), time(n.checkInDate, n.timezone), time(n.checkOutDate, n.timezone), cost(n)];
    }
    if (entity === 'transportation') {
      return [
        text(n.type),
        text(n.fromLocationName),
        text(n.toLocationName),
        time(n.departureTime, n.startTimezone),
        time(n.arrivalTime, n.endTimezone),
        cost(n),
      ];
    }
    return [text(n.name), time(n.startTime, n.timezone), time(n.endTime, n.timezone), text(n.location), cost(n)];
  };

  return (
    <div className="sm:overflow-x-auto rounded-lg border border-stone-200 dark:border-dusk-600">
      <table className="block sm:table min-w-full text-sm">
        <thead className="hidden sm:table-header-group bg-stone-50 dark:bg-dusk-800 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-dusk-400">
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
        <tbody className="block sm:table-row-group divide-y divide-stone-100 dark:divide-dusk-700">
          {rows.map((row) => {
            const isInvalid = row.status === 'invalid';
            const isOff = !isInvalid && excluded.has(row.index);
            return (
              <tr
                key={row.index}
                data-testid={`import-row-${row.index + 1}`}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-3 sm:table-row sm:p-0 ${
                  isInvalid
                    ? 'bg-red-50/60 dark:bg-red-900/10'
                    : isOff
                      ? 'opacity-60'
                      : row.warnings.length > 0
                        ? 'bg-amber-50/60 dark:bg-amber-900/10'
                        : ''
                }`}
              >
                <td className="sm:px-3 sm:py-2 align-top">
                  {isInvalid ? null : (
                    <input
                      type="checkbox"
                      className="h-5 w-5 text-base sm:text-sm rounded border-stone-300 text-primary-600 focus:ring-primary-500"
                      checked={!isOff}
                      disabled={disabled}
                      onChange={() => onToggle(row.index)}
                      aria-label={`Include row ${row.index + 1}`}
                    />
                  )}
                </td>
                <td className="sm:px-3 sm:py-2 align-top text-stone-500 dark:text-dusk-400 whitespace-nowrap before:content-['Row_'] sm:before:hidden">{row.index + 1}</td>
                {cells(row).map((value, i) => (
                  <td
                    key={`${columns[i]}-${i}`}
                    data-label={columns[i]}
                    className={`align-top text-stone-800 dark:text-dusk-200 break-words [overflow-wrap:anywhere] sm:px-3 sm:py-2 sm:max-w-[16rem] sm:truncate sm:break-normal ${
                      i === 0
                        ? 'flex-1 min-w-0 font-medium'
                        : 'order-2 basis-[calc(50%-0.375rem)] text-xs before:content-[attr(data-label)] before:block before:text-[10px] before:uppercase before:text-stone-400 dark:before:text-dusk-500 sm:basis-auto sm:text-sm sm:before:hidden'
                    } ${i > 0 && !value ? 'hidden sm:table-cell' : 'sm:table-cell'}`}
                    title={value}
                  >
                    {value}
                  </td>
                ))}
                <td className="order-1 basis-full align-top sm:order-none sm:basis-auto sm:px-3 sm:py-2 sm:min-w-[16rem]">
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
