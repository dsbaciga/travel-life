import { useCallback, useMemo, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import type {
  DrivingSide,
  EmergencyNumbers,
  TapWaterSafety,
} from '../constants/countryFacts';
import { useTripCountries, type AddressBearing } from '../hooks/useTripCountries';
import Icon, { type IconName } from './ui/Icon';

// =============================================================================
// PRESENTATION TABLES
// =============================================================================

/**
 * Display order for emergency services. `universal` leads because a single
 * number that reaches everything is the one worth memorising.
 */
const EMERGENCY_SERVICES: ReadonlyArray<{
  key: keyof EmergencyNumbers;
  label: string;
  icon: IconName;
}> = [
  { key: 'universal', label: 'All emergencies', icon: 'sos' },
  { key: 'police', label: 'Police', icon: 'police' },
  { key: 'ambulance', label: 'Ambulance', icon: 'emergency' },
  { key: 'fire', label: 'Fire', icon: 'fireDept' },
];

const TAP_WATER_PRESENTATION: Readonly<
  Record<TapWaterSafety, { label: string; detail: string; badgeClass: string }>
> = {
  safe: {
    label: 'Safe to drink',
    detail: 'Mains water is drinkable in ordinary urban areas.',
    badgeClass: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  },
  caution: {
    label: 'Drink with caution',
    detail:
      'Treated in most cities, but bottled or filtered water is the common choice for visitors.',
    badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  },
  unsafe: {
    label: 'Not safe to drink',
    detail: 'Bottled or treated water is the normal advice for visitors.',
    badgeClass: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  },
};

const DRIVING_SIDE_PRESENTATION: Readonly<
  Record<DrivingSide, { label: string; detail: string }>
> = {
  left: {
    label: 'Drives on the left',
    detail: 'Look right first when stepping into the road.',
  },
  right: {
    label: 'Drives on the right',
    detail: 'Look left first when stepping into the road.',
  },
};

/**
 * Countries whose grid genuinely varies by region. The dataset records a single
 * dominant `voltage`/`frequency`, which would otherwise read as a nationwide
 * guarantee and send someone to the wrong transformer.
 */
const MIXED_GRID_NOTES: Readonly<Record<string, string>> = {
  JP: 'Japan runs a split grid: 50 Hz in the east (Tokyo, Sendai, Sapporo) and 60 Hz in the west (Osaka, Kyoto, Hiroshima). Voltage is 100 V nationwide.',
  BR: 'Brazil runs mixed voltages: 127 V across much of the south-east, 220 V in the north-east and south. Check the socket label before plugging anything in.',
};

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

interface NormSectionProps {
  icon: IconName;
  title: string;
  children: ReactNode;
  className?: string;
}

function NormSection({ icon, title, children, className = '' }: NormSectionProps) {
  return (
    <section
      className={`rounded-xl border border-primary-100 dark:border-gold/20 bg-white/70 dark:bg-navy-900/40 p-4 ${className}`}
    >
      <h4 className="flex items-center gap-2 text-sm font-semibold text-charcoal dark:text-warm-gray mb-3">
        <Icon name={icon} />
        {title}
      </h4>
      {children}
    </section>
  );
}

/** Muted caveat text. Every uncertainty in this card is surfaced through it. */
function Caveat({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 text-xs leading-relaxed text-slate dark:text-warm-gray/70">{children}</p>
  );
}

// =============================================================================
// CARD
// =============================================================================

export interface LocalNormsCardProps {
  /** Trip whose manual country choice is read and persisted. */
  tripId: number;
  /** The trip's locations. Only `address` is read, to infer the country. */
  locations: readonly AddressBearing[];
  /**
   * The trip's stored `countryCode`. Shared with the emergency card rather than
   * held locally, so the two can never disagree about which country you are in.
   */
  countryCode?: string | null;
  className?: string;
}

/**
 * Practical conventions for the country a trip is in: emergency numbers,
 * tipping, plugs and voltage, tap water, and which side of the road traffic
 * drives on.
 *
 * Every fact shown comes from `constants/countryFacts`, bundled at build time,
 * so the card renders in full with no network. The country is inferred from
 * location addresses (there is no country column on a Location); a trip that
 * spans several countries gets a switcher.
 *
 * The one thing that does need the network is *changing* the country, because
 * that writes `Trip.countryCode` — the shared override the emergency card reads
 * too. Reading stays offline; only the correction needs a connection.
 */
export default function LocalNormsCard({
  tripId,
  locations,
  countryCode,
  className = '',
}: LocalNormsCardProps) {
  const {
    detected,
    selected,
    needsManualSelection,
    isManualSelection,
    allCountries,
    selectCountry,
    viewCountry,
  } = useTripCountries(tripId, locations, countryCode);

  // The choice is now a write to the trip rather than a local toggle, so it can
  // fail. Surfacing that matters: silently keeping the old country would leave
  // the emergency card showing numbers for the wrong place.
  const handleSelectCountry = useCallback(
    (code: string | null) => {
      void selectCountry(code).catch(() => {
        toast.error("Couldn't save the country for this trip. Try again.");
      });
    },
    [selectCountry]
  );

  const { known, unknown } = useMemo(() => {
    const emergency: EmergencyNumbers = selected?.emergency ?? {};
    return {
      known: EMERGENCY_SERVICES.filter((service) => Boolean(emergency[service.key])),
      unknown: EMERGENCY_SERVICES.filter((service) => !emergency[service.key]),
    };
  }, [selected]);

  const countryPicker = (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <label htmlFor="local-norms-country" className="label mb-0 whitespace-nowrap">
        {needsManualSelection ? 'Choose a country' : 'Show country'}
      </label>
      <select
        id="local-norms-country"
        className="input sm:w-64"
        value={isManualSelection ? (selected?.code ?? '') : ''}
        onChange={(event) => handleSelectCountry(event.target.value || null)}
      >
        <option value="">
          {detected.length > 0 ? 'Detected from your places' : 'Select a country…'}
        </option>
        {allCountries.map((country) => (
          <option key={country.code} value={country.code}>
            {country.name}
          </option>
        ))}
      </select>
    </div>
  );

  // Nothing resolved and nothing chosen: ask rather than render an empty card.
  if (!selected) {
    return (
      <div className={`space-y-4 ${className}`}>
        <header>
          <h3 className="font-display text-xl font-bold text-charcoal dark:text-warm-gray">
            Local norms
          </h3>
          <p className="text-sm text-slate dark:text-warm-gray/70">
            Tipping, plugs, tap water, driving side and emergency numbers — bundled offline.
          </p>
        </header>

        <div
          className="rounded-xl border border-primary-100 dark:border-gold/20 bg-white/70 dark:bg-navy-900/40 p-6 text-center"
          role="status"
        >
          <Icon name="explore" size={32} className="mx-auto" />
          <p className="mt-2 text-sm font-medium text-charcoal dark:text-warm-gray">
            We could not work out which country this trip is in
          </p>
          <p className="mt-1 text-xs text-slate dark:text-warm-gray/70">
            Country is read from your places&rsquo; addresses. Add an address that names the
            country, or pick one below.
          </p>
          <div className="mt-4 flex justify-center">{countryPicker}</div>
        </div>
      </div>
    );
  }

  const tapWater = TAP_WATER_PRESENTATION[selected.tapWater];
  const driving = DRIVING_SIDE_PRESENTATION[selected.drivingSide];
  const mixedGridNote = MIXED_GRID_NOTES[selected.code];

  return (
    <div className={`space-y-4 ${className}`}>
      <header className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div>
          <h3 className="font-display text-xl font-bold text-charcoal dark:text-warm-gray">
            Local norms
          </h3>
          <p className="text-sm text-slate dark:text-warm-gray/70">
            Practical conventions in {selected.name}. Bundled offline — confirm anything
            life-critical locally.
          </p>
        </div>
        {countryPicker}
      </header>

      {/* Multi-country trips get one chip per country rather than a hidden default. */}
      {detected.length > 1 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Countries on this trip">
          {detected.map(({ facts, locationCount }) => {
            const isActive = facts.code === selected.code;
            return (
              <button
                key={facts.code}
                type="button"
                onClick={() => viewCountry(facts.code)}
                aria-pressed={isActive}
                className={`inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50 ${
                  isActive
                    ? 'bg-primary-500 text-white dark:bg-accent-400 dark:text-navy-900'
                    : 'bg-primary-100 text-primary-800 dark:bg-navy-700 dark:text-warm-gray hover:bg-primary-200 dark:hover:bg-navy-700/70'
                }`}
              >
                {facts.name}
                <span className={isActive ? 'text-white/80' : 'text-slate dark:text-warm-gray/70'}>
                  {locationCount}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {isManualSelection && detected.length > 0 && !detected.some((d) => d.facts.code === selected.code) && (
        <p className="text-xs text-slate dark:text-warm-gray/70">
          Showing {selected.name} because you chose it. Your places point at{' '}
          {detected.map((d) => d.facts.name).join(', ')}.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NormSection icon="phone" title="Emergency numbers">
          {known.length > 0 ? (
            <dl className="space-y-2">
              {known.map((service) => (
                <div key={service.key} className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-2 text-sm text-slate dark:text-warm-gray/80">
                    <Icon name={service.icon} />
                    {service.label}
                  </dt>
                  <dd>
                    <a
                      href={`tel:${selected.emergency[service.key]}`}
                      className="inline-flex min-h-[44px] items-center rounded-lg px-3 font-mono text-lg font-bold text-primary-600 dark:text-gold hover:underline focus-visible:ring-2 focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50"
                    >
                      {selected.emergency[service.key]}
                    </a>
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-slate dark:text-warm-gray/80">
              No number for {selected.name} is confirmed in this offline dataset. Look one up
              as soon as you arrive.
            </p>
          )}

          {known.length > 0 && unknown.length > 0 && (
            <Caveat>
              Not listed: {unknown.map((service) => service.label.toLowerCase()).join(', ')}.
              That means the number is not confirmed here — not that the service does not
              exist.
            </Caveat>
          )}
        </NormSection>

        <NormSection icon="plug" title="Plugs and power">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {selected.electricity.plugTypes.map((plug) => (
              <span
                key={plug}
                className="inline-flex items-center rounded-full bg-primary-100 px-3 py-1 text-sm font-semibold text-primary-800 dark:bg-navy-700 dark:text-gold"
              >
                Type {plug}
              </span>
            ))}
          </div>
          <p className="text-sm text-slate dark:text-warm-gray/80">
            <span className="font-semibold text-charcoal dark:text-warm-gray">
              {selected.electricity.voltage} V
            </span>
            {' · '}
            <span className="font-semibold text-charcoal dark:text-warm-gray">
              {selected.electricity.frequency} Hz
            </span>
          </p>
          {mixedGridNote ? (
            <Caveat>{mixedGridNote}</Caveat>
          ) : (
            <Caveat>Dominant national values; individual buildings can differ.</Caveat>
          )}
        </NormSection>

        <NormSection icon="water" title="Tap water">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${tapWater.badgeClass}`}
          >
            {tapWater.label}
          </span>
          <p className="mt-3 text-sm text-slate dark:text-warm-gray/80">{tapWater.detail}</p>
        </NormSection>

        <NormSection icon="car" title="Driving">
          <p className="text-sm font-semibold text-charcoal dark:text-warm-gray">
            {driving.label}
          </p>
          <p className="mt-1 text-sm text-slate dark:text-warm-gray/80">{driving.detail}</p>
        </NormSection>

        <NormSection icon="money" title="Tipping" className="md:col-span-2">
          <p className="text-sm text-slate dark:text-warm-gray/80">{selected.tipping}</p>
        </NormSection>
      </div>

      <p className="text-xs text-slate dark:text-warm-gray/60">
        Bundled reference data — no network needed. Customs and emergency numbers change;
        treat this as a starting point.
      </p>
    </div>
  );
}
