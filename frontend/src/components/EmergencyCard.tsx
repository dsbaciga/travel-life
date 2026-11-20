import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import emergencyInfoService from "../services/emergencyInfo.service";
import companionService from "../services/companion.service";
import tripService from "../services/trip.service";
import { useEmergencyCard, emergencyCardQueryKey } from "../hooks/useEmergencyCard";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { listEmergencyNumbers, telHref } from "../utils/emergencyCountry";
import { COUNTRY_FACTS } from "../constants/countryFacts";
import PrintableEmergencyCard from "./emergency/PrintableEmergencyCard";
import EmptyState from "./EmptyState";
import { ListItemSkeleton } from "./SkeletonLoader";
import type {
  EmergencyCardCompanion,
  UpdateTripEmergencyInfoInput,
} from "../types/emergencyInfo";

/**
 * EmergencyCard — the printable, offline-cached card of what you need when
 * something goes wrong (feature #111).
 *
 * Two halves, from two very different places:
 *
 * - **Local emergency numbers** come from `constants/countryFacts.ts`, a static
 *   dataset compiled into the bundle. No fetch, no cache, no failure mode. The
 *   destination country is worked out from the trip's location addresses and can
 *   be overridden, because nothing in the schema stores a country.
 * - **Insurance, embassy and companion medical details** come from the API and
 *   are mirrored into IndexedDB on every read, so the card still renders on a
 *   phone with no signal. When that mirror is what is being shown, its age is
 *   stated rather than hidden.
 *
 * A missing emergency number is always omitted, never rendered as "none" — in the
 * dataset an absent field means "not confidently known".
 */
interface EmergencyCardProps {
  tripId: number;
  /** Called after any successful write, so the parent can refresh trip data. */
  onUpdate?: () => void;
}

interface EmergencyFormState {
  countryCode: string;
  insuranceProvider: string;
  insurancePolicyNumber: string;
  insuranceAssistancePhone: string;
  embassyName: string;
  embassyPhone: string;
  embassyAddress: string;
  notes: string;
}

const EMPTY_EMERGENCY_FORM: EmergencyFormState = {
  countryCode: "",
  insuranceProvider: "",
  insurancePolicyNumber: "",
  insuranceAssistancePhone: "",
  embassyName: "",
  embassyPhone: "",
  embassyAddress: "",
  notes: "",
};

interface CompanionMedicalFormState {
  medicalNotes: string;
  allergies: string;
}

/** Country options for the override select, alphabetical by display name. */
const COUNTRY_OPTIONS = Object.values(COUNTRY_FACTS)
  .map((facts) => ({ code: facts.code, name: facts.name }))
  .sort((a, b) => a.name.localeCompare(b.name));

/**
 * Empty strings from a form mean "clear this column", which the API expresses as
 * null. Sending `''` would work today (the backend coerces it) but null is the
 * documented contract and survives a stricter schema later.
 */
function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Splits the comma-separated allergy input into tags, dropping blanks. */
function parseAllergies(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** "3 days ago"-style age for a cached payload, kept deliberately coarse. */
function formatCacheAge(cachedAt: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - cachedAt) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function EmergencyCard({ tripId, onUpdate }: EmergencyCardProps) {
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const { card, cachedAt, country, isLoading, error } = useEmergencyCard(tripId);

  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<EmergencyFormState>(EMPTY_EMERGENCY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [editingCompanionId, setEditingCompanionId] = useState<number | null>(null);
  const [companionForm, setCompanionForm] = useState<CompanionMedicalFormState>({
    medicalNotes: "",
    allergies: "",
  });
  const [isPrinting, setIsPrinting] = useState(false);

  const info = card?.info ?? null;
  const numbers = listEmergencyNumbers(country.facts?.emergency);

  // Repopulate the form whenever the stored record changes, so opening the editor
  // after a background refetch never shows a stale draft.
  useEffect(() => {
    setForm({
      countryCode: card?.countryCode ?? "",
      insuranceProvider: info?.insuranceProvider ?? "",
      insurancePolicyNumber: info?.insurancePolicyNumber ?? "",
      insuranceAssistancePhone: info?.insuranceAssistancePhone ?? "",
      embassyName: info?.embassyName ?? "",
      embassyPhone: info?.embassyPhone ?? "",
      embassyAddress: info?.embassyAddress ?? "",
      notes: info?.notes ?? "",
    });
  }, [info, card?.countryCode]);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: emergencyCardQueryKey(tripId) });
    // The country override lives on the trip, so the trip query has to go stale
    // too — otherwise the local-norms card keeps showing the old country until a
    // reload, which is exactly the disagreement this shared column removes.
    queryClient.invalidateQueries({ queryKey: ["trip", tripId] });
    onUpdate?.();
  }, [queryClient, tripId, onUpdate]);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      const payload: UpdateTripEmergencyInfoInput = {
        insuranceProvider: blankToNull(form.insuranceProvider),
        insurancePolicyNumber: blankToNull(form.insurancePolicyNumber),
        insuranceAssistancePhone: blankToNull(form.insuranceAssistancePhone),
        embassyName: blankToNull(form.embassyName),
        embassyPhone: blankToNull(form.embassyPhone),
        embassyAddress: blankToNull(form.embassyAddress),
        notes: blankToNull(form.notes),
      };
      // Two writes, because the country is a fact about the trip rather than about
      // its emergency record — it lives on `Trip.countryCode` so the local-norms
      // card reads the same value. Only send it when it actually changed, so a
      // view-only save of insurance details never needs trip-edit rights it may
      // not have.
      const nextCountry = blankToNull(form.countryCode)?.toUpperCase() ?? null;
      const countryChanged = nextCountry !== (card?.countryCode ?? null);

      await Promise.all([
        emergencyInfoService.updateEmergencyInfo(tripId, payload),
        countryChanged
          ? tripService.updateTrip(tripId, { countryCode: nextCountry })
          : Promise.resolve(),
      ]);
      toast.success("Emergency details saved");
      setIsEditing(false);
      invalidate();
    } catch {
      toast.error("Failed to save emergency details");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    const confirmed = await confirm({
      title: "Clear emergency details",
      message:
        "This removes the insurance and embassy details saved for this trip. Local emergency numbers are not affected.",
      confirmLabel: "Clear",
      variant: "danger",
    });
    if (!confirmed) return;

    try {
      await emergencyInfoService.deleteEmergencyInfo(tripId);
      toast.success("Emergency details cleared");
      setIsEditing(false);
      invalidate();
    } catch {
      toast.error("Failed to clear emergency details");
    }
  };

  const startCompanionEdit = (companion: EmergencyCardCompanion) => {
    setEditingCompanionId(companion.id);
    setCompanionForm({
      medicalNotes: companion.medicalNotes ?? "",
      allergies: companion.allergies.join(", "),
    });
  };

  const handleCompanionSave = async (companionId: number) => {
    setIsSaving(true);
    try {
      await companionService.updateCompanion(companionId, {
        medicalNotes: blankToNull(companionForm.medicalNotes),
        allergies: parseAllergies(companionForm.allergies),
      });
      toast.success("Medical details saved");
      setEditingCompanionId(null);
      queryClient.invalidateQueries({ queryKey: ["companions"] });
      invalidate();
    } catch {
      toast.error("Failed to save medical details");
    } finally {
      setIsSaving(false);
    }
  };

  // Mirrors the timeline's print flow: render the paper version into a body-level
  // portal, let the browser paint, then open the dialog. The `@media print` rules
  // hide #root, so the app never appears on the page.
  const handlePrint = useCallback(() => {
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setTimeout(() => setIsPrinting(false), 500);
    }, 100);
  }, []);

  if (isLoading) {
    return <ListItemSkeleton count={4} />;
  }

  if (!card) {
    return (
      <EmptyState
        icon="🆘"
        message="Emergency card unavailable"
        subMessage={
          error
            ? "We could not load this trip's emergency details and nothing is saved offline yet. Open this tab once while online to cache it."
            : "No emergency details yet."
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header ------------------------------------------------------------- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-charcoal dark:text-warm-gray">
            Emergency Card
          </h2>
          <p className="text-sm text-slate dark:text-warm-gray/70">
            {country.facts
              ? `Numbers and contacts for ${country.facts.name}`
              : "Set a destination country to show local emergency numbers"}
            {cachedAt !== null && ` · saved offline ${formatCacheAge(cachedAt)}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={handlePrint}>
            Print
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setIsEditing((open) => !open)}
          >
            {isEditing ? "Close" : "Edit details"}
          </button>
        </div>
      </div>

      {/* Local emergency numbers -------------------------------------------- */}
      <section className="card p-6">
        <h3 className="mb-4 text-lg font-semibold text-charcoal dark:text-warm-gray">
          Local emergency numbers
        </h3>
        {numbers.length > 0 ? (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {numbers.map((entry) => {
              const href = telHref(entry.number);
              return (
                <li
                  key={entry.key}
                  className="flex items-center justify-between rounded-xl border border-primary-100 bg-white/60 px-4 py-3 dark:border-gold/20 dark:bg-navy-800/60"
                >
                  <span className="text-sm font-medium text-slate dark:text-warm-gray/80">
                    {entry.label}
                  </span>
                  {href ? (
                    <a
                      href={href}
                      className="min-h-[44px] font-display text-2xl font-bold leading-[44px] text-primary-600 hover:underline dark:text-gold"
                    >
                      {entry.number}
                    </a>
                  ) : (
                    <span className="font-display text-2xl font-bold text-primary-600 dark:text-gold">
                      {entry.number}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          /* Absent numbers are omitted above and summarised here. The dataset
             treats a missing field as "not confidently known", so this must never
             read as "this country has no emergency service". */
          <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-900/20 dark:text-amber-200">
            {country.source === "unknown"
              ? "We could not work out the destination country from this trip's locations. Pick one under “Edit details” to show its emergency numbers."
              : "No emergency numbers are recorded for this destination. Confirm the local number on arrival."}
          </p>
        )}
        {country.facts && (
          <p className="mt-3 text-xs text-slate dark:text-warm-gray/60">
            From a bundled snapshot — numbers change. Confirm locally for anything
            life-critical.
          </p>
        )}
      </section>

      {/* Editor -------------------------------------------------------------- */}
      {isEditing && (
        <form onSubmit={handleSave} className="card space-y-4 p-6">
          <div>
            <label className="label" htmlFor="emergency-country">
              Destination country
            </label>
            <select
              id="emergency-country"
              className="input"
              value={form.countryCode}
              onChange={(event) =>
                setForm({ ...form, countryCode: event.target.value })
              }
            >
              <option value="">
                Detect from this trip&apos;s locations
                {(country.source === "address" || country.source === "location") && country.facts
                  ? ` (${country.facts.name})`
                  : ""}
              </option>
              {COUNTRY_OPTIONS.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="space-y-3">
            <legend className="label">Travel insurance</legend>
            <input
              className="input"
              placeholder="Provider"
              aria-label="Insurance provider"
              value={form.insuranceProvider}
              onChange={(event) =>
                setForm({ ...form, insuranceProvider: event.target.value })
              }
            />
            <input
              className="input"
              placeholder="Policy number"
              aria-label="Insurance policy number"
              value={form.insurancePolicyNumber}
              onChange={(event) =>
                setForm({ ...form, insurancePolicyNumber: event.target.value })
              }
            />
            <input
              className="input"
              placeholder="24h assistance phone"
              aria-label="Insurance assistance phone"
              value={form.insuranceAssistancePhone}
              onChange={(event) =>
                setForm({ ...form, insuranceAssistancePhone: event.target.value })
              }
            />
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="label">Embassy or consulate</legend>
            <p className="text-xs text-slate dark:text-warm-gray/60">
              Entered by you — there is no offline directory of every embassy, and a
              wrong address on this card is worse than a blank one.
            </p>
            <input
              className="input"
              placeholder="Mission name"
              aria-label="Embassy name"
              value={form.embassyName}
              onChange={(event) => setForm({ ...form, embassyName: event.target.value })}
            />
            <input
              className="input"
              placeholder="Phone"
              aria-label="Embassy phone"
              value={form.embassyPhone}
              onChange={(event) => setForm({ ...form, embassyPhone: event.target.value })}
            />
            <textarea
              className="input"
              rows={2}
              placeholder="Address"
              aria-label="Embassy address"
              value={form.embassyAddress}
              onChange={(event) =>
                setForm({ ...form, embassyAddress: event.target.value })
              }
            />
          </fieldset>

          <div>
            <label className="label" htmlFor="emergency-notes">
              Notes
            </label>
            <textarea
              id="emergency-notes"
              className="input"
              rows={3}
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary" disabled={isSaving}>
              {isSaving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setIsEditing(false)}
            >
              Cancel
            </button>
            {info && (
              <button type="button" className="btn-danger" onClick={handleClear}>
                Clear
              </button>
            )}
          </div>
        </form>
      )}

      {/* Insurance + embassy readout ---------------------------------------- */}
      <section className="card p-6">
        <h3 className="mb-4 text-lg font-semibold text-charcoal dark:text-warm-gray">
          Insurance &amp; embassy
        </h3>
        {info &&
        (info.insuranceProvider ||
          info.insurancePolicyNumber ||
          info.insuranceAssistancePhone ||
          info.embassyName ||
          info.embassyPhone ||
          info.embassyAddress) ? (
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            <DetailRow label="Provider" value={info.insuranceProvider} />
            <DetailRow label="Policy number" value={info.insurancePolicyNumber} />
            <DetailRow
              label="24h assistance"
              value={info.insuranceAssistancePhone}
              asPhone
            />
            <DetailRow label="Mission" value={info.embassyName} />
            <DetailRow label="Embassy phone" value={info.embassyPhone} asPhone />
            <DetailRow label="Embassy address" value={info.embassyAddress} />
          </dl>
        ) : (
          <EmptyState.Compact
            icon="📄"
            message="No insurance or embassy details saved yet"
          />
        )}
        {info?.notes && (
          <p className="mt-4 whitespace-pre-wrap text-sm text-slate dark:text-warm-gray/80">
            {info.notes}
          </p>
        )}
      </section>

      {/* Travellers ---------------------------------------------------------- */}
      <section className="card p-6">
        <h3 className="mb-1 text-lg font-semibold text-charcoal dark:text-warm-gray">
          Travellers
        </h3>
        {!card.includesMedicalDetails && (
          <p className="mb-4 text-sm text-slate dark:text-warm-gray/70">
            Medical details are visible to the trip owner only, so this card shows
            names alone. Ask the owner if you need them.
          </p>
        )}
        {card.companions.length === 0 ? (
          <EmptyState.Compact
            icon="🧑‍🤝‍🧑"
            message="No companions are linked to this trip"
          />
        ) : (
          <ul className="divide-y divide-warm-gray dark:divide-gold/10">
            {card.companions.map((companion) => (
              <li key={companion.id} className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 break-words [overflow-wrap:anywhere]">
                    <p className="font-medium text-charcoal dark:text-warm-gray">
                      {companion.name}
                      {companion.relationship && (
                        <span className="text-slate dark:text-warm-gray/60">
                          {" "}
                          · {companion.relationship}
                        </span>
                      )}
                    </p>
                    {companion.phone && (
                      <p className="text-sm text-slate dark:text-warm-gray/70">
                        {companion.phone}
                      </p>
                    )}
                    {companion.allergies.length > 0 && (
                      <p className="mt-1 text-sm font-medium text-red-700 dark:text-red-300">
                        Allergies: {companion.allergies.join(", ")}
                      </p>
                    )}
                    {companion.medicalNotes && (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate dark:text-warm-gray/80">
                        {companion.medicalNotes}
                      </p>
                    )}
                  </div>
                  {card.includesMedicalDetails && editingCompanionId !== companion.id && (
                    <button
                      type="button"
                      className="btn-secondary shrink-0"
                      onClick={() => startCompanionEdit(companion)}
                    >
                      Medical
                    </button>
                  )}
                </div>

                {editingCompanionId === companion.id && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="label" htmlFor={`allergies-${companion.id}`}>
                        Allergies (comma separated)
                      </label>
                      <input
                        id={`allergies-${companion.id}`}
                        className="input"
                        value={companionForm.allergies}
                        onChange={(event) =>
                          setCompanionForm({
                            ...companionForm,
                            allergies: event.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor={`medical-${companion.id}`}>
                        Medical notes
                      </label>
                      <textarea
                        id={`medical-${companion.id}`}
                        className="input"
                        rows={3}
                        value={companionForm.medicalNotes}
                        onChange={(event) =>
                          setCompanionForm({
                            ...companionForm,
                            medicalNotes: event.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={isSaving}
                        onClick={() => handleCompanionSave(companion.id)}
                      >
                        {isSaving ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setEditingCompanionId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialogComponent />

      {/* Paper version — portal so the print stylesheet can hide the whole app */}
      {isPrinting &&
        createPortal(
          <div className="print-emg-wrapper">
            <PrintableEmergencyCard card={card} country={country} />
          </div>,
          document.body
        )}
    </div>
  );
}

interface DetailRowProps {
  label: string;
  value: string | null;
  asPhone?: boolean;
}

/** One label/value pair, rendered only when there is a value to show. */
function DetailRow({ label, value, asPhone = false }: DetailRowProps) {
  if (!value) return null;
  const href = asPhone ? telHref(value) : null;

  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate dark:text-warm-gray/60">
        {label}
      </dt>
      <dd className="text-sm text-charcoal dark:text-warm-gray">
        {href ? (
          <a
            href={href}
            className="text-primary-600 hover:underline dark:text-gold"
          >
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
