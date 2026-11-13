import type { AgendaItem } from '../../utils/dayAgenda';
import { formatTimeInTimezone } from '../../utils/timezone';

interface AgendaListProps {
  items: AgendaItem[];
  activeKey?: string | null;
  /** Hover or focus on a row; null when it leaves. Drives the map highlight. */
  onActiveChange?: (key: string | null) => void;
  /** Activating a row, e.g. to open the item in its trip tab. */
  onOpen?: (item: AgendaItem) => void;
  /** Shown when the day has no items. */
  emptyMessage?: string;
}

const TYPE_LABEL: Record<AgendaItem['type'], string> = {
  activity: 'Activity',
  transportation: 'Transport',
  lodging: 'Stay',
};

/**
 * A day's agenda as a numbered list. The number on each row is the number on
 * its map pin. A row with no place attached keeps its number and is marked
 * so the missing pin is explained rather than looking like a bug.
 */
export default function AgendaList({
  items,
  activeKey,
  onActiveChange,
  onOpen,
  emptyMessage = 'Nothing scheduled for this day.',
}: AgendaListProps) {
  if (items.length === 0) {
    return <p className="py-6 text-sm text-slate dark:text-dusk-400">{emptyMessage}</p>;
  }

  return (
    <ol className="divide-y divide-primary-500/10 dark:divide-navy-700">
      {items.map((item) => {
        const active = item.key === activeKey;
        const time = item.time
          ? formatTimeInTimezone(item.time, item.timezone, undefined, false)
          : 'All day';

        return (
          <li key={item.key}>
            <button
              type="button"
              onClick={() => onOpen?.(item)}
              onMouseEnter={() => onActiveChange?.(item.key)}
              onMouseLeave={() => onActiveChange?.(null)}
              onFocus={() => onActiveChange?.(item.key)}
              onBlur={() => onActiveChange?.(null)}
              className={`w-full min-h-[56px] flex items-center gap-3 px-2 py-2.5 text-left rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50 ${
                active ? 'bg-primary-50 dark:bg-navy-700' : 'hover:bg-primary-50/60 dark:hover:bg-navy-700/60'
              }`}
            >
              <span
                className={`flex-none w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  item.point
                    ? 'bg-gold text-navy-900'
                    : 'border border-dashed border-slate/50 dark:border-dusk-500 text-slate dark:text-dusk-400'
                }`}
                aria-hidden="true"
              >
                {item.number}
              </span>
              <span className="flex-none w-[4.5rem] text-sm tabular-nums text-slate dark:text-dusk-300">
                {time}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-charcoal dark:text-white truncate">
                  {item.title}
                </span>
                <span className="block text-sm text-slate dark:text-dusk-400 truncate">
                  {item.subtitle ?? TYPE_LABEL[item.type]}
                  {!item.point && ' · no place set'}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
