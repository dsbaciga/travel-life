interface AlsoCreatePlaceOptionProps {
  /** Unique id for the checkbox. */
  id: string;
  /** Current name of the item being created; shown in the help text. */
  name: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/**
 * Checkbox offered while creating an activity or lodging: also create a
 * Place with the same name and link the two.
 */
export default function AlsoCreatePlaceOption({
  id,
  name,
  checked,
  onChange,
  disabled,
}: AlsoCreatePlaceOptionProps) {
  const trimmed = name.trim();

  return (
    <div className="flex items-start gap-2 p-3 bg-gray-50 dark:bg-navy-700/50 rounded-lg">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-0.5 rounded border-primary-200 dark:border-gold/30 text-primary-600 dark:text-gold focus:ring-primary-500 dark:focus:ring-gold/50"
      />
      <div>
        <label htmlFor={id} className="text-sm font-medium text-charcoal dark:text-warm-gray">
          Add and Link a Place
        </label>
        <p className="text-xs text-gray-500 dark:text-dusk-400 mt-0.5">
          {trimmed ? `Creates a place called “${trimmed}”` : 'Creates a place called the same'},
          linked to this item. It has no map position until you set one under Places.
        </p>
      </div>
    </div>
  );
}
