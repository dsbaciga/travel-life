import { useId, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import loyaltyProgramService, { LOYALTY_PROGRAMS_QUERY_KEY } from '../services/loyaltyProgram.service';
import type { LoyaltyProgram } from '../types/loyaltyProgram';
import { matchLoyaltyPrograms, type LoyaltyMatchKind } from '../utils/loyaltyMatch';

interface LoyaltyProgramFieldProps {
  kind: LoyaltyMatchKind;
  /** Carrier / company (transportation) or hotel name (lodging), as currently typed. */
  name: string;
  /** Flight or vehicle number; its leading characters can identify an airline. */
  vehicleNumber?: string;
  /** Transportation type (flight, train, ...). */
  transportType?: string;
  /** The program this booking is currently linked to. */
  value: number | null;
  onChange: (programId: number | null) => void;
}

/**
 * Lets a booking carry the user's membership in a loyalty program.
 *
 * When the carrier or hotel name matches one of the user's programs a suggestion chip is
 * offered. It only ever fills on click: nothing is applied behind the user's back, and a
 * program they already chose is never replaced by a suggestion.
 *
 * Renders nothing until the user has at least one program, so it costs people who do not use
 * the feature no space in the form.
 */
export default function LoyaltyProgramField({
  kind,
  name,
  vehicleNumber,
  transportType,
  value,
  onChange,
}: LoyaltyProgramFieldProps) {
  const selectId = useId();
  const { data: programs = [] } = useQuery<LoyaltyProgram[]>({
    queryKey: LOYALTY_PROGRAMS_QUERY_KEY,
    queryFn: () => loyaltyProgramService.getAll(),
    staleTime: 60_000,
  });

  const suggestions = useMemo(
    () =>
      matchLoyaltyPrograms(programs, { name, vehicleNumber, transportType }, kind).filter(
        (m) => m.program.id !== value
      ),
    [programs, name, vehicleNumber, transportType, kind, value]
  );

  if (programs.length === 0) return null;

  const selected = programs.find((p) => p.id === value) ?? null;

  return (
    <div>
      <label
        htmlFor={selectId}
        className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
      >
        Loyalty program
      </label>
      <select
        id={selectId}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="input"
      >
        <option value="">None</option>
        {programs.map((p) => (
          <option key={p.id} value={p.id}>
            {p.providerName} - {p.name}
          </option>
        ))}
      </select>

      {selected && (
        <p className="text-xs text-gray-500 dark:text-dusk-400 mt-1">
          Membership number: <span className="font-mono break-all">{selected.membershipNumber}</span>
        </p>
      )}

      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mt-2" data-testid="loyalty-suggestions">
          <span className="text-xs text-gray-500 dark:text-dusk-400">Suggested:</span>
          {suggestions.map(({ program }) => (
            <button
              key={program.id}
              type="button"
              onClick={() => onChange(program.id)}
              className="text-xs px-2 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/50"
            >
              Use {program.name} {program.membershipNumber}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
