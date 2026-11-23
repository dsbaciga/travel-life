import type { EmergencyCardData } from "../../types/emergencyInfo";
import type { ResolvedTripCountry } from "../../utils/emergencyCountry";
import { listEmergencyNumbers } from "../../utils/emergencyCountry";

interface PrintableEmergencyCardProps {
  card: EmergencyCardData;
  country: ResolvedTripCountry;
  /** Rendered as the "as of" line so a printed card carries its own age. */
  generatedAt?: Date;
}

/**
 * The paper version of the Emergency Card.
 *
 * Rendered into a body-level portal by {@link EmergencyCard} and shown only by
 * `@media print` (see the `.print-emg-*` rules in `index.css`). Everything here
 * is plain black-on-white with no icons or colour fills, because the whole point
 * is a page that survives a black-and-white office printer and a dead phone.
 *
 * Sections that have nothing in them are omitted entirely rather than printed
 * empty — a card with three real lines beats a card with twelve blank ones.
 */
export default function PrintableEmergencyCard({
  card,
  country,
  generatedAt = new Date(),
}: PrintableEmergencyCardProps) {
  const { info, companions } = card;
  const numbers = listEmergencyNumbers(country.facts?.emergency);

  const hasInsurance = Boolean(
    info?.insuranceProvider || info?.insurancePolicyNumber || info?.insuranceAssistancePhone
  );
  const hasEmbassy = Boolean(info?.embassyName || info?.embassyPhone || info?.embassyAddress);
  const travellersWithDetail = companions.filter(
    (companion) =>
      companion.phone ||
      companion.medicalNotes ||
      companion.allergies.length > 0 ||
      companion.dietaryPreferences.length > 0
  );

  return (
    <div className="print-emg">
      <header className="print-emg-header">
        <h1 className="print-emg-title">Emergency card</h1>
        <p className="print-emg-trip">{card.tripTitle}</p>
        {country.facts && <p className="print-emg-country">{country.facts.name}</p>}
      </header>

      <section className="print-emg-section print-emg-numbers-section">
        <h2 className="print-emg-section-title">Local emergency numbers</h2>
        {numbers.length > 0 ? (
          <ul className="print-emg-numbers">
            {numbers.map((entry) => (
              <li key={entry.key} className="print-emg-number">
                <span className="print-emg-number-label">{entry.label}</span>
                <span className="print-emg-number-value">{entry.number}</span>
              </li>
            ))}
          </ul>
        ) : (
          /* Never printed as "none" — an absent number in the bundled dataset
             means "not confidently known", and a card that claims a country has
             no ambulance service is worse than one that admits it does not know. */
          <p className="print-emg-warning">
            Not recorded for this destination — confirm the local number on arrival.
          </p>
        )}
      </section>

      {hasInsurance && (
        <section className="print-emg-section">
          <h2 className="print-emg-section-title">Travel insurance</h2>
          <dl className="print-emg-fields">
            {info?.insuranceProvider && (
              <div className="print-emg-field">
                <dt>Provider</dt>
                <dd>{info.insuranceProvider}</dd>
              </div>
            )}
            {info?.insurancePolicyNumber && (
              <div className="print-emg-field">
                <dt>Policy number</dt>
                <dd>{info.insurancePolicyNumber}</dd>
              </div>
            )}
            {info?.insuranceAssistancePhone && (
              <div className="print-emg-field">
                <dt>24h assistance</dt>
                <dd>{info.insuranceAssistancePhone}</dd>
              </div>
            )}
          </dl>
        </section>
      )}

      {hasEmbassy && (
        <section className="print-emg-section">
          <h2 className="print-emg-section-title">Embassy / consulate</h2>
          <dl className="print-emg-fields">
            {info?.embassyName && (
              <div className="print-emg-field">
                <dt>Mission</dt>
                <dd>{info.embassyName}</dd>
              </div>
            )}
            {info?.embassyPhone && (
              <div className="print-emg-field">
                <dt>Phone</dt>
                <dd>{info.embassyPhone}</dd>
              </div>
            )}
            {info?.embassyAddress && (
              <div className="print-emg-field">
                <dt>Address</dt>
                <dd>{info.embassyAddress}</dd>
              </div>
            )}
          </dl>
        </section>
      )}

      {travellersWithDetail.length > 0 && (
        <section className="print-emg-section">
          <h2 className="print-emg-section-title">Travellers</h2>
          {travellersWithDetail.map((companion) => (
            <div key={companion.id} className="print-emg-traveller">
              <p className="print-emg-traveller-name">
                {companion.name}
                {companion.relationship && (
                  <span className="print-emg-traveller-relationship">
                    {" "}
                    ({companion.relationship})
                  </span>
                )}
              </p>
              {companion.phone && (
                <p className="print-emg-traveller-line">Phone: {companion.phone}</p>
              )}
              {companion.allergies.length > 0 && (
                <p className="print-emg-traveller-line print-emg-allergies">
                  Allergies: {companion.allergies.join(", ")}
                </p>
              )}
              {companion.medicalNotes && (
                <p className="print-emg-traveller-line">Medical: {companion.medicalNotes}</p>
              )}
              {companion.dietaryPreferences.length > 0 && (
                <p className="print-emg-traveller-line">
                  Dietary: {companion.dietaryPreferences.join(", ")}
                </p>
              )}
            </div>
          ))}
        </section>
      )}

      {info?.notes && (
        <section className="print-emg-section">
          <h2 className="print-emg-section-title">Notes</h2>
          <p className="print-emg-notes">{info.notes}</p>
        </section>
      )}

      <footer className="print-emg-footer">
        <p>
          Emergency numbers are from a bundled snapshot and can change. Confirm them
          locally for anything life-critical.
        </p>
        <p>Printed {generatedAt.toLocaleDateString()}</p>
      </footer>
    </div>
  );
}
