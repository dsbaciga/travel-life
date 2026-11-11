/**
 * Practical, at-a-glance country reference used by the offline traveller cards
 * (emergency contacts, local norms).
 *
 * This is a hand-curated snapshot of the kind of information printed on the back
 * of a guidebook: national emergency numbers, mains electricity, plug letters,
 * tipping custom, tap-water potability and which side of the road traffic drives
 * on. It is bundled statically so the cards work with no network and no backend
 * — there is no live source behind it and nothing here is fetched at runtime.
 *
 * Limits worth knowing before relying on a value:
 *
 * - It is a snapshot. Emergency numbers change (several countries have merged
 *   theirs into 112 or 911 in recent years). Treat it as a starting point, not
 *   as an authority — always confirm locally for anything life-critical.
 * - Coverage is commonly-travelled countries only, not all 249 ISO entries.
 * - Optional emergency fields are omitted rather than guessed. A missing
 *   `ambulance` means "not confidently known", never "no ambulance service".
 * - `voltage` / `frequency` are the dominant national values. A few countries
 *   genuinely run mixed grids (Japan is 50 Hz in the east and 60 Hz in the west;
 *   Brazil runs 127 V in most of the south-east and 220 V elsewhere) — the more
 *   commonly encountered value is recorded.
 * - `tapWater` describes mains water in ordinary urban areas. "safe" does not
 *   promise every tap in every village; "unsafe" means bottled or treated water
 *   is the normal advice for visitors.
 *
 * The module is pure: no imports, no I/O, no `window`.
 */

export type TapWaterSafety = "safe" | "caution" | "unsafe";
export type DrivingSide = "left" | "right";

export interface EmergencyNumbers {
  /** Single number that reaches all services, when the country has one (e.g. "112"). */
  universal?: string;
  police?: string;
  ambulance?: string;
  fire?: string;
}

export interface CountryFacts {
  /** ISO 3166-1 alpha-2, uppercase. */
  code: string;
  name: string;
  emergency: EmergencyNumbers;
  /** Short human sentence, e.g. "Service charge usually included; round up the bill." */
  tipping: string;
  electricity: {
    /** Plug letter types, e.g. ["C", "F"]. */
    plugTypes: string[];
    voltage: number;
    frequency: number;
  };
  tapWater: TapWaterSafety;
  drivingSide: DrivingSide;
}

/* ------------------------------------------------------------------ */
/* Reusable copy                                                       */
/* ------------------------------------------------------------------ */

const TIP_EU_ROUND_UP =
  "Service is normally included; round up or add 5-10% for good service.";
const TIP_NONE_EXPECTED = "Tipping is not customary — rounding up is plenty.";
const TIP_GULF =
  "Service charge is usually on the bill; 10-15% extra is a generous thank-you.";

/* ------------------------------------------------------------------ */
/* The dataset                                                         */
/* ------------------------------------------------------------------ */

export const COUNTRY_FACTS: Readonly<Record<string, CountryFacts>> = {
  /* ---------------- Europe ---------------- */

  AD: {
    code: "AD",
    name: "Andorra",
    emergency: { universal: "112" },
    tipping: TIP_EU_ROUND_UP,
    electricity: { plugTypes: ["C", "F"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  AL: {
    code: "AL",
    name: "Albania",
    emergency: { universal: "112", police: "129", ambulance: "127", fire: "128" },
    tipping: "Round up, or leave 10% at sit-down restaurants.",
    electricity: { plugTypes: ["C", "F"], voltage: 230, frequency: 50 },
    tapWater: "caution",
    drivingSide: "right",
  },
  AM: {
    code: "AM",
    name: "Armenia",
    emergency: { universal: "112", police: "102", ambulance: "103", fire: "101" },
    tipping: "10% is normal in restaurants; check if service is already added.",
    electricity: { plugTypes: ["C", "F"], voltage: 220, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  AT: {
    code: "AT",
    name: "Austria",
    emergency: { universal: "112", police: "133", ambulance: "144", fire: "122" },
    tipping: "Round up to the next euro or add ~5-10%; hand it to the server.",
    electricity: { plugTypes: ["C", "F"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  AZ: {
    code: "AZ",
    name: "Azerbaijan",
    emergency: { universal: "112", police: "102", ambulance: "103", fire: "101" },
    tipping: "A 10% service charge is often added; otherwise 10% is welcome.",
    electricity: { plugTypes: ["C", "F"], voltage: 220, frequency: 50 },
    tapWater: "unsafe",
    drivingSide: "right",
  },
  BA: {
    code: "BA",
    name: "Bosnia and Herzegovina",
    emergency: { universal: "112", police: "122", ambulance: "124", fire: "123" },
    tipping: "Round up the bill; 10% for table service in cities.",
    electricity: { plugTypes: ["C", "F"], voltage: 230, frequency: 50 },
    tapWater: "caution",
    drivingSide: "right",
  },
  BE: {
    code: "BE",
    name: "Belgium",
    emergency: { universal: "112", police: "101" },
    tipping: "Service and tax are included; rounding up is all that is expected.",
    electricity: { plugTypes: ["C", "E"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  BG: {
    code: "BG",
    name: "Bulgaria",
    emergency: { universal: "112" },
    tipping: "10% is standard in restaurants; round up taxi fares.",
    electricity: { plugTypes: ["C", "F"], voltage: 230, frequency: 50 },
    tapWater: "caution",
    drivingSide: "right",
  },
  BY: {
    code: "BY",
    name: "Belarus",
    emergency: { universal: "112", police: "102", ambulance: "103", fire: "101" },
    tipping: "10% in restaurants where service is not already included.",
    electricity: { plugTypes: ["C", "F"], voltage: 230, frequency: 50 },
    tapWater: "caution",
    drivingSide: "right",
  },
  CH: {
    code: "CH",
    name: "Switzerland",
    emergency: { universal: "112", police: "117", ambulance: "144", fire: "118" },
    tipping: "Service is included by law; round up for good service.",
    electricity: { plugTypes: ["C", "J"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  CY: {
    code: "CY",
    name: "Cyprus",
    emergency: { universal: "112", police: "199" },
    tipping: "A 10% service charge is common; add a little more if it is not.",
    electricity: { plugTypes: ["G"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "left",
  },
  CZ: {
    code: "CZ",
    name: "Czechia",
    emergency: { universal: "112", police: "158", ambulance: "155", fire: "150" },
    tipping: "Round up or add ~10%; say the total when you hand over payment.",
    electricity: { plugTypes: ["C", "E"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  DE: {
    code: "DE",
    name: "Germany",
    emergency: { universal: "112", police: "110", ambulance: "112", fire: "112" },
    tipping: "Round up or add 5-10%; state the total rather than leaving coins.",
    electricity: { plugTypes: ["C", "F"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  DK: {
    code: "DK",
    name: "Denmark",
    emergency: { universal: "112" },
    tipping: TIP_NONE_EXPECTED,
    electricity: { plugTypes: ["C", "F", "K"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  EE: {
    code: "EE",
    name: "Estonia",
    emergency: { universal: "112" },
    tipping: "10% is appreciated in restaurants but never demanded.",
    electricity: { plugTypes: ["C", "F"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  ES: {
    code: "ES",
    name: "Spain",
    emergency: { universal: "112", police: "091", ambulance: "061" },
    tipping: "Small change or up to 10% at restaurants; nothing at bars.",
    electricity: { plugTypes: ["C", "F"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  FI: {
    code: "FI",
    name: "Finland",
    emergency: { universal: "112" },
    tipping: TIP_NONE_EXPECTED,
    electricity: { plugTypes: ["C", "F"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  FR: {
    code: "FR",
    name: "France",
    emergency: { universal: "112", police: "17", ambulance: "15", fire: "18" },
    tipping: "Service is included ('service compris'); leave coins if pleased.",
    electricity: { plugTypes: ["C", "E"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  GB: {
    code: "GB",
    name: "United Kingdom",
    emergency: { universal: "999", police: "999", ambulance: "999", fire: "999" },
    tipping: "10-12.5% at restaurants unless service is already on the bill; none at pubs.",
    electricity: { plugTypes: ["G"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "left",
  },
  GE: {
    code: "GE",
    name: "Georgia",
    emergency: { universal: "112" },
    tipping: "10% is usual; many restaurants add it automatically.",
    electricity: { plugTypes: ["C", "F"], voltage: 220, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  GR: {
    code: "GR",
    name: "Greece",
    emergency: { universal: "112", police: "100", ambulance: "166", fire: "199" },
    tipping: "Round up or leave 5-10% in cash on the table.",
    electricity: { plugTypes: ["C", "F"], voltage: 230, frequency: 50 },
    tapWater: "caution",
    drivingSide: "right",
  },
  HR: {
    code: "HR",
    name: "Croatia",
    emergency: { universal: "112", police: "192", ambulance: "194", fire: "193" },
    tipping: "Round up, or 10% for a full meal.",
    electricity: { plugTypes: ["C", "F"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  HU: {
    code: "HU",
    name: "Hungary",
    emergency: { universal: "112", police: "107", ambulance: "104", fire: "105" },
    tipping: "10% is expected; check the bill for an added service charge first.",
    electricity: { plugTypes: ["C", "F"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  IE: {
    code: "IE",
    name: "Ireland",
    emergency: { universal: "112", police: "999", ambulance: "999", fire: "999" },
    tipping: "10-12% at restaurants; no tip needed at the bar.",
    electricity: { plugTypes: ["G"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "left",
  },
  IS: {
    code: "IS",
    name: "Iceland",
    emergency: { universal: "112" },
    tipping: TIP_NONE_EXPECTED,
    electricity: { plugTypes: ["C", "F"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  IT: {
    code: "IT",
    name: "Italy",
    emergency: { universal: "112", police: "113", ambulance: "118", fire: "115" },
    tipping: "A cover charge ('coperto') replaces tipping; round up if you like.",
    electricity: { plugTypes: ["C", "F", "L"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  LT: {
    code: "LT",
    name: "Lithuania",
    emergency: { universal: "112" },
    tipping: "Round up or leave 10% for table service.",
    electricity: { plugTypes: ["C", "F"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  LU: {
    code: "LU",
    name: "Luxembourg",
    emergency: { universal: "112", police: "113" },
    tipping: TIP_EU_ROUND_UP,
    electricity: { plugTypes: ["C", "F"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  LV: {
    code: "LV",
    name: "Latvia",
    emergency: { universal: "112" },
    tipping: "Round up or leave 10% for table service.",
    electricity: { plugTypes: ["C", "F"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  MC: {
    code: "MC",
    name: "Monaco",
    emergency: { universal: "112", police: "17", fire: "18" },
    tipping: "Service is included; leave a little extra at fine restaurants.",
    electricity: { plugTypes: ["C", "E", "F"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  MD: {
    code: "MD",
    name: "Moldova",
    emergency: { universal: "112" },
    tipping: "10% in restaurants; round up taxis.",
    electricity: { plugTypes: ["C", "F"], voltage: 230, frequency: 50 },
    tapWater: "unsafe",
    drivingSide: "right",
  },
  ME: {
    code: "ME",
    name: "Montenegro",
    emergency: { universal: "112", police: "122", ambulance: "124", fire: "123" },
    tipping: "Round up, or 10% at restaurants.",
    electricity: { plugTypes: ["C", "F"], voltage: 230, frequency: 50 },
    tapWater: "caution",
    drivingSide: "right",
  },
  MK: {
    code: "MK",
    name: "North Macedonia",
    emergency: { universal: "112", police: "192", ambulance: "194", fire: "193" },
    tipping: "Round up, or 10% at restaurants.",
    electricity: { plugTypes: ["C", "F"], voltage: 230, frequency: 50 },
    tapWater: "caution",
    drivingSide: "right",
  },
  MT: {
    code: "MT",
    name: "Malta",
    emergency: { universal: "112" },
    tipping: "5-10% if service is not already on the bill.",
    electricity: { plugTypes: ["G"], voltage: 230, frequency: 50 },
    tapWater: "caution",
    drivingSide: "left",
  },
  NL: {
    code: "NL",
    name: "Netherlands",
    emergency: { universal: "112" },
    tipping: "Service is included; round up or add ~5-10% for good service.",
    electricity: { plugTypes: ["C", "F"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  NO: {
    code: "NO",
    name: "Norway",
    emergency: { universal: "112", police: "112", ambulance: "113", fire: "110" },
    tipping: TIP_NONE_EXPECTED,
    electricity: { plugTypes: ["C", "F"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  PL: {
    code: "PL",
    name: "Poland",
    emergency: { universal: "112", police: "997", ambulance: "999", fire: "998" },
    tipping: "10% at restaurants; say 'thank you' only when you want no change back.",
    electricity: { plugTypes: ["C", "E"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  PT: {
    code: "PT",
    name: "Portugal",
    emergency: { universal: "112" },
    tipping: "Round up or leave 5-10%; nothing expected at cafes.",
    electricity: { plugTypes: ["C", "F"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  RO: {
    code: "RO",
    name: "Romania",
    emergency: { universal: "112" },
    tipping: "10% at restaurants; round up taxi fares.",
    electricity: { plugTypes: ["C", "F"], voltage: 230, frequency: 50 },
    tapWater: "caution",
    drivingSide: "right",
  },
  RS: {
    code: "RS",
    name: "Serbia",
    emergency: { universal: "112", police: "192", ambulance: "194", fire: "193" },
    tipping: "Round up, or 10% at restaurants.",
    electricity: { plugTypes: ["C", "F"], voltage: 230, frequency: 50 },
    tapWater: "caution",
    drivingSide: "right",
  },
  RU: {
    code: "RU",
    name: "Russia",
    emergency: { universal: "112", police: "102", ambulance: "103", fire: "101" },
    tipping: "10% at restaurants where no service charge is added.",
    electricity: { plugTypes: ["C", "F"], voltage: 220, frequency: 50 },
    tapWater: "unsafe",
    drivingSide: "right",
  },
  SE: {
    code: "SE",
    name: "Sweden",
    emergency: { universal: "112" },
    tipping: TIP_NONE_EXPECTED,
    electricity: { plugTypes: ["C", "F"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  SI: {
    code: "SI",
    name: "Slovenia",
    emergency: { universal: "112", police: "113" },
    tipping: "Round up, or 10% for a good meal.",
    electricity: { plugTypes: ["C", "F"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  SK: {
    code: "SK",
    name: "Slovakia",
    emergency: { universal: "112", police: "158", ambulance: "155", fire: "150" },
    tipping: "10% is normal; state the total when paying.",
    electricity: { plugTypes: ["C", "E"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  TR: {
    code: "TR",
    name: "Turkey",
    emergency: { universal: "112" },
    tipping: "10% at restaurants; round up for taxis and small services.",
    electricity: { plugTypes: ["C", "F"], voltage: 230, frequency: 50 },
    tapWater: "unsafe",
    drivingSide: "right",
  },
  UA: {
    code: "UA",
    name: "Ukraine",
    emergency: { universal: "112", police: "102", ambulance: "103", fire: "101" },
    tipping: "10% at restaurants unless a service charge is printed.",
    electricity: { plugTypes: ["C", "F"], voltage: 230, frequency: 50 },
    tapWater: "unsafe",
    drivingSide: "right",
  },

  /* ---------------- North America ---------------- */

  CA: {
    code: "CA",
    name: "Canada",
    emergency: { universal: "911", police: "911", ambulance: "911", fire: "911" },
    tipping: "15-20% at restaurants and bars; C$2-5 per bag for porters.",
    electricity: { plugTypes: ["A", "B"], voltage: 120, frequency: 60 },
    tapWater: "safe",
    drivingSide: "right",
  },
  MX: {
    code: "MX",
    name: "Mexico",
    emergency: { universal: "911", police: "911", ambulance: "911", fire: "911" },
    tipping: "10-15% at restaurants; small change for baggers and attendants.",
    electricity: { plugTypes: ["A", "B"], voltage: 127, frequency: 60 },
    tapWater: "unsafe",
    drivingSide: "right",
  },
  US: {
    code: "US",
    name: "United States",
    emergency: { universal: "911", police: "911", ambulance: "911", fire: "911" },
    tipping: "Tipping is expected: 18-20% at restaurants, $1-2 per drink, $2-5 per bag.",
    electricity: { plugTypes: ["A", "B"], voltage: 120, frequency: 60 },
    tapWater: "safe",
    drivingSide: "right",
  },

  /* ---------------- Central America & Caribbean ---------------- */

  AW: {
    code: "AW",
    name: "Aruba",
    emergency: { universal: "911" },
    tipping: "A 10-15% service charge is usually added; extra is optional.",
    electricity: { plugTypes: ["A", "B", "F"], voltage: 127, frequency: 60 },
    tapWater: "safe",
    drivingSide: "right",
  },
  BB: {
    code: "BB",
    name: "Barbados",
    emergency: { police: "211", ambulance: "511", fire: "311" },
    tipping: "A 10% service charge is usual; add 5% more for great service.",
    electricity: { plugTypes: ["A", "B"], voltage: 115, frequency: 50 },
    tapWater: "safe",
    drivingSide: "left",
  },
  BS: {
    code: "BS",
    name: "Bahamas",
    emergency: { universal: "911" },
    tipping: "15% is standard; many bills already include a service charge.",
    electricity: { plugTypes: ["A", "B"], voltage: 120, frequency: 60 },
    tapWater: "caution",
    drivingSide: "left",
  },
  BZ: {
    code: "BZ",
    name: "Belize",
    emergency: { universal: "911" },
    tipping: "10% at restaurants; a little extra for guides and drivers.",
    electricity: { plugTypes: ["A", "B", "G"], voltage: 110, frequency: 60 },
    tapWater: "unsafe",
    drivingSide: "right",
  },
  CR: {
    code: "CR",
    name: "Costa Rica",
    emergency: { universal: "911" },
    tipping: "A 10% service charge is added by law; extra is a genuine bonus.",
    electricity: { plugTypes: ["A", "B"], voltage: 120, frequency: 60 },
    tapWater: "safe",
    drivingSide: "right",
  },
  CU: {
    code: "CU",
    name: "Cuba",
    emergency: { police: "106", ambulance: "104", fire: "105" },
    tipping: "10% at restaurants; small tips in cash are widely appreciated.",
    electricity: { plugTypes: ["A", "B", "C", "L"], voltage: 110, frequency: 60 },
    tapWater: "unsafe",
    drivingSide: "right",
  },
  DO: {
    code: "DO",
    name: "Dominican Republic",
    emergency: { universal: "911" },
    tipping: "A 10% service charge is legally added; 5-10% more is customary.",
    electricity: { plugTypes: ["A", "B"], voltage: 120, frequency: 60 },
    tapWater: "unsafe",
    drivingSide: "right",
  },
  GT: {
    code: "GT",
    name: "Guatemala",
    emergency: { police: "110", ambulance: "123", fire: "122" },
    tipping: "10% at restaurants; small notes for guides and drivers.",
    electricity: { plugTypes: ["A", "B"], voltage: 120, frequency: 60 },
    tapWater: "unsafe",
    drivingSide: "right",
  },
  HN: {
    code: "HN",
    name: "Honduras",
    emergency: { universal: "911" },
    tipping: "10% at restaurants unless a service charge appears on the bill.",
    electricity: { plugTypes: ["A", "B"], voltage: 120, frequency: 60 },
    tapWater: "unsafe",
    drivingSide: "right",
  },
  JM: {
    code: "JM",
    name: "Jamaica",
    emergency: { police: "119", ambulance: "110", fire: "110" },
    tipping: "10-15%; check whether a service charge is already included.",
    electricity: { plugTypes: ["A", "B"], voltage: 110, frequency: 50 },
    tapWater: "caution",
    drivingSide: "left",
  },
  PA: {
    code: "PA",
    name: "Panama",
    emergency: { universal: "911", police: "104", fire: "103" },
    tipping: "10% at restaurants; round up taxi fares.",
    electricity: { plugTypes: ["A", "B"], voltage: 120, frequency: 60 },
    tapWater: "safe",
    drivingSide: "right",
  },
  PR: {
    code: "PR",
    name: "Puerto Rico",
    emergency: { universal: "911" },
    tipping: "US norms apply: 18-20% at restaurants, $1-2 per drink.",
    electricity: { plugTypes: ["A", "B"], voltage: 120, frequency: 60 },
    tapWater: "safe",
    drivingSide: "right",
  },
  SV: {
    code: "SV",
    name: "El Salvador",
    emergency: { universal: "911" },
    tipping: "10% at restaurants; a service charge is often already added.",
    electricity: { plugTypes: ["A", "B"], voltage: 115, frequency: 60 },
    tapWater: "unsafe",
    drivingSide: "right",
  },
  TT: {
    code: "TT",
    name: "Trinidad and Tobago",
    emergency: { police: "999", ambulance: "990", fire: "990" },
    tipping: "10-15% where no service charge is added.",
    electricity: { plugTypes: ["A", "B"], voltage: 115, frequency: 60 },
    tapWater: "caution",
    drivingSide: "left",
  },

  /* ---------------- South America ---------------- */

  AR: {
    code: "AR",
    name: "Argentina",
    emergency: { universal: "911", police: "101", ambulance: "107", fire: "100" },
    tipping: "10% in cash at restaurants; tips cannot legally be added to cards.",
    electricity: { plugTypes: ["C", "I"], voltage: 220, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  BO: {
    code: "BO",
    name: "Bolivia",
    emergency: { police: "110", ambulance: "118", fire: "119" },
    tipping: "Round up, or 10% at tourist restaurants.",
    electricity: { plugTypes: ["A", "C"], voltage: 230, frequency: 50 },
    tapWater: "unsafe",
    drivingSide: "right",
  },
  BR: {
    code: "BR",
    name: "Brazil",
    emergency: { police: "190", ambulance: "192", fire: "193" },
    tipping: "A 10% service charge is normally printed on the bill and is enough.",
    electricity: { plugTypes: ["C", "N"], voltage: 127, frequency: 60 },
    tapWater: "unsafe",
    drivingSide: "right",
  },
  CL: {
    code: "CL",
    name: "Chile",
    emergency: { police: "133", ambulance: "131", fire: "132" },
    tipping: "10% is suggested on the bill ('propina') and usually accepted.",
    electricity: { plugTypes: ["C", "L"], voltage: 220, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  CO: {
    code: "CO",
    name: "Colombia",
    emergency: { universal: "123" },
    tipping: "A 10% 'propina voluntaria' is offered on the bill; you may decline it.",
    electricity: { plugTypes: ["A", "B"], voltage: 110, frequency: 60 },
    tapWater: "caution",
    drivingSide: "right",
  },
  EC: {
    code: "EC",
    name: "Ecuador",
    emergency: { universal: "911" },
    tipping: "A 10% service charge is added; extra change for great service.",
    electricity: { plugTypes: ["A", "B"], voltage: 120, frequency: 60 },
    tapWater: "unsafe",
    drivingSide: "right",
  },
  PE: {
    code: "PE",
    name: "Peru",
    emergency: { police: "105", ambulance: "106", fire: "116" },
    tipping: "10% at restaurants; small notes for guides and porters.",
    electricity: { plugTypes: ["A", "B", "C"], voltage: 220, frequency: 60 },
    tapWater: "unsafe",
    drivingSide: "right",
  },
  PY: {
    code: "PY",
    name: "Paraguay",
    emergency: { universal: "911" },
    tipping: "Round up, or 10% at restaurants.",
    electricity: { plugTypes: ["C"], voltage: 220, frequency: 50 },
    tapWater: "unsafe",
    drivingSide: "right",
  },
  UY: {
    code: "UY",
    name: "Uruguay",
    emergency: { universal: "911", police: "911", ambulance: "105", fire: "104" },
    tipping: "10% at restaurants; round up taxi fares.",
    electricity: { plugTypes: ["C", "F", "L"], voltage: 220, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  VE: {
    code: "VE",
    name: "Venezuela",
    emergency: { universal: "911" },
    tipping: "10% at restaurants, in cash and preferably in hard currency.",
    electricity: { plugTypes: ["A", "B"], voltage: 120, frequency: 60 },
    tapWater: "unsafe",
    drivingSide: "right",
  },

  /* ---------------- East Asia ---------------- */

  CN: {
    code: "CN",
    name: "China",
    emergency: { police: "110", ambulance: "120", fire: "119" },
    tipping: "Tipping is not customary and can be refused outside tourist hotels.",
    electricity: { plugTypes: ["A", "C", "I"], voltage: 220, frequency: 50 },
    tapWater: "unsafe",
    drivingSide: "right",
  },
  HK: {
    code: "HK",
    name: "Hong Kong",
    emergency: { universal: "999", police: "999", ambulance: "999", fire: "999" },
    tipping: "A 10% service charge is standard; leave the small change on top.",
    electricity: { plugTypes: ["G"], voltage: 220, frequency: 50 },
    tapWater: "safe",
    drivingSide: "left",
  },
  JP: {
    code: "JP",
    name: "Japan",
    emergency: { police: "110", ambulance: "119", fire: "119" },
    tipping: "Do not tip — it is not customary and may cause confusion.",
    electricity: { plugTypes: ["A", "B"], voltage: 100, frequency: 50 },
    tapWater: "safe",
    drivingSide: "left",
  },
  KR: {
    code: "KR",
    name: "South Korea",
    emergency: { police: "112", ambulance: "119", fire: "119" },
    tipping: "Tipping is not practised; prices are final.",
    electricity: { plugTypes: ["C", "F"], voltage: 220, frequency: 60 },
    tapWater: "safe",
    drivingSide: "right",
  },
  MN: {
    code: "MN",
    name: "Mongolia",
    emergency: { police: "102", ambulance: "103", fire: "101" },
    tipping: "10% in Ulaanbaatar restaurants; tips for guides and drivers are welcome.",
    electricity: { plugTypes: ["C", "E"], voltage: 230, frequency: 50 },
    tapWater: "unsafe",
    drivingSide: "right",
  },
  MO: {
    code: "MO",
    name: "Macau",
    emergency: { universal: "999" },
    tipping: "A 10% service charge is normal; extra tipping is optional.",
    electricity: { plugTypes: ["D", "G", "M"], voltage: 220, frequency: 50 },
    tapWater: "safe",
    drivingSide: "left",
  },
  TW: {
    code: "TW",
    name: "Taiwan",
    emergency: { police: "110", ambulance: "119", fire: "119" },
    tipping: "Tipping is not expected; restaurants may add a 10% service charge.",
    electricity: { plugTypes: ["A", "B"], voltage: 110, frequency: 60 },
    tapWater: "caution",
    drivingSide: "right",
  },

  /* ---------------- South-East Asia ---------------- */

  ID: {
    code: "ID",
    name: "Indonesia",
    emergency: { universal: "112", police: "110", ambulance: "119", fire: "113" },
    tipping: "A 10% service charge is common; round up for drivers and guides.",
    electricity: { plugTypes: ["C", "F"], voltage: 230, frequency: 50 },
    tapWater: "unsafe",
    drivingSide: "left",
  },
  KH: {
    code: "KH",
    name: "Cambodia",
    emergency: { police: "117", ambulance: "119", fire: "118" },
    tipping: "Not obligatory, but $1-2 for drivers and 10% at restaurants is kind.",
    electricity: { plugTypes: ["A", "C", "G"], voltage: 230, frequency: 50 },
    tapWater: "unsafe",
    drivingSide: "right",
  },
  LA: {
    code: "LA",
    name: "Laos",
    emergency: { police: "191", ambulance: "195", fire: "190" },
    tipping: "Not expected; round up or leave 10% at tourist restaurants.",
    electricity: { plugTypes: ["A", "B", "C", "E", "F"], voltage: 230, frequency: 50 },
    tapWater: "unsafe",
    drivingSide: "right",
  },
  MY: {
    code: "MY",
    name: "Malaysia",
    emergency: { universal: "999" },
    tipping: "Not expected; a 10% service charge is often printed on the bill.",
    electricity: { plugTypes: ["G"], voltage: 240, frequency: 50 },
    tapWater: "caution",
    drivingSide: "left",
  },
  PH: {
    code: "PH",
    name: "Philippines",
    emergency: { universal: "911" },
    tipping: "10% is common; a service charge is often already added.",
    electricity: { plugTypes: ["A", "B", "C"], voltage: 220, frequency: 60 },
    tapWater: "unsafe",
    drivingSide: "right",
  },
  SG: {
    code: "SG",
    name: "Singapore",
    emergency: { police: "999", ambulance: "995", fire: "995" },
    tipping: "Not customary; a 10% service charge plus GST is standard on bills.",
    electricity: { plugTypes: ["G"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "left",
  },
  TH: {
    code: "TH",
    name: "Thailand",
    emergency: { police: "191", ambulance: "1669", fire: "199" },
    tipping: "Round up, or leave small change; 10% at upmarket restaurants.",
    electricity: { plugTypes: ["A", "B", "C", "O"], voltage: 230, frequency: 50 },
    tapWater: "unsafe",
    drivingSide: "left",
  },
  VN: {
    code: "VN",
    name: "Vietnam",
    emergency: { police: "113", ambulance: "115", fire: "114" },
    tipping: "Not expected; small tips for guides, drivers and spa staff are welcome.",
    electricity: { plugTypes: ["A", "C", "F"], voltage: 220, frequency: 50 },
    tapWater: "unsafe",
    drivingSide: "right",
  },

  /* ---------------- South Asia ---------------- */

  BD: {
    code: "BD",
    name: "Bangladesh",
    emergency: { universal: "999" },
    tipping: "10% ('baksheesh') at restaurants and for helpful service.",
    electricity: { plugTypes: ["A", "C", "D", "G", "K"], voltage: 220, frequency: 50 },
    tapWater: "unsafe",
    drivingSide: "left",
  },
  IN: {
    code: "IN",
    name: "India",
    emergency: { universal: "112", police: "100", ambulance: "102", fire: "101" },
    tipping: "10% at restaurants unless a service charge is added; small notes elsewhere.",
    electricity: { plugTypes: ["C", "D", "M"], voltage: 230, frequency: 50 },
    tapWater: "unsafe",
    drivingSide: "left",
  },
  LK: {
    code: "LK",
    name: "Sri Lanka",
    emergency: { police: "119", ambulance: "1990", fire: "110" },
    tipping: "A 10% service charge is standard; extra small notes for drivers.",
    electricity: { plugTypes: ["D", "G", "M"], voltage: 230, frequency: 50 },
    tapWater: "unsafe",
    drivingSide: "left",
  },
  MV: {
    code: "MV",
    name: "Maldives",
    emergency: { police: "119", ambulance: "102", fire: "118" },
    tipping: "Resorts add a 10% service charge; $5-10 per day for villa staff is usual.",
    electricity: { plugTypes: ["D", "G"], voltage: 230, frequency: 50 },
    tapWater: "caution",
    drivingSide: "left",
  },
  NP: {
    code: "NP",
    name: "Nepal",
    emergency: { police: "100", ambulance: "102", fire: "101" },
    tipping: "10% at restaurants; trekking guides and porters are tipped generously.",
    electricity: { plugTypes: ["C", "D", "M"], voltage: 230, frequency: 50 },
    tapWater: "unsafe",
    drivingSide: "left",
  },
  PK: {
    code: "PK",
    name: "Pakistan",
    emergency: { police: "15", ambulance: "1122", fire: "16" },
    tipping: "10% at restaurants; small notes for porters and attendants.",
    electricity: { plugTypes: ["C", "D", "G"], voltage: 230, frequency: 50 },
    tapWater: "unsafe",
    drivingSide: "left",
  },

  /* ---------------- Oceania ---------------- */

  AU: {
    code: "AU",
    name: "Australia",
    emergency: { universal: "000", police: "000", ambulance: "000", fire: "000" },
    tipping: "Not expected — staff are paid a full wage; 10% for exceptional service.",
    electricity: { plugTypes: ["I"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "left",
  },
  FJ: {
    code: "FJ",
    name: "Fiji",
    emergency: { universal: "911" },
    tipping: "Not customary; resorts often keep a shared staff 'Christmas fund' box.",
    electricity: { plugTypes: ["I"], voltage: 240, frequency: 50 },
    tapWater: "caution",
    drivingSide: "left",
  },
  NZ: {
    code: "NZ",
    name: "New Zealand",
    emergency: { universal: "111", police: "111", ambulance: "111", fire: "111" },
    tipping: "Not expected; round up or 10% for genuinely excellent service.",
    electricity: { plugTypes: ["I"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "left",
  },
  PF: {
    code: "PF",
    name: "French Polynesia",
    emergency: { universal: "112", police: "17", ambulance: "15", fire: "18" },
    tipping: "Not customary in Polynesian culture; service is included.",
    electricity: { plugTypes: ["C", "E"], voltage: 220, frequency: 60 },
    tapWater: "caution",
    drivingSide: "right",
  },

  /* ---------------- Middle East ---------------- */

  AE: {
    code: "AE",
    name: "United Arab Emirates",
    emergency: { police: "999", ambulance: "998", fire: "997" },
    tipping: TIP_GULF,
    electricity: { plugTypes: ["G"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  BH: {
    code: "BH",
    name: "Bahrain",
    emergency: { universal: "999" },
    tipping: TIP_GULF,
    electricity: { plugTypes: ["G"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  EG: {
    code: "EG",
    name: "Egypt",
    emergency: { police: "122", ambulance: "123", fire: "180" },
    tipping: "'Baksheesh' is everywhere: 10% at restaurants, small notes for every service.",
    electricity: { plugTypes: ["C", "F"], voltage: 220, frequency: 50 },
    tapWater: "unsafe",
    drivingSide: "right",
  },
  IL: {
    code: "IL",
    name: "Israel",
    emergency: { police: "100", ambulance: "101", fire: "102" },
    tipping: "10-15% at restaurants, usually in cash; not expected for taxis.",
    electricity: { plugTypes: ["C", "H", "M"], voltage: 230, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  JO: {
    code: "JO",
    name: "Jordan",
    emergency: { universal: "911" },
    tipping: "A 10% service charge is common; add 5-10% and round up taxis.",
    electricity: { plugTypes: ["C", "D", "G"], voltage: 230, frequency: 50 },
    tapWater: "caution",
    drivingSide: "right",
  },
  KW: {
    code: "KW",
    name: "Kuwait",
    emergency: { universal: "112" },
    tipping: TIP_GULF,
    electricity: { plugTypes: ["G"], voltage: 240, frequency: 50 },
    tapWater: "caution",
    drivingSide: "right",
  },
  LB: {
    code: "LB",
    name: "Lebanon",
    emergency: { police: "112", ambulance: "140", fire: "175" },
    tipping: "A 10-15% service charge is usual; leave extra cash for the server.",
    electricity: { plugTypes: ["C", "D", "G"], voltage: 220, frequency: 50 },
    tapWater: "unsafe",
    drivingSide: "right",
  },
  OM: {
    code: "OM",
    name: "Oman",
    emergency: { universal: "9999" },
    tipping: TIP_GULF,
    electricity: { plugTypes: ["G"], voltage: 240, frequency: 50 },
    tapWater: "caution",
    drivingSide: "right",
  },
  QA: {
    code: "QA",
    name: "Qatar",
    emergency: { universal: "999" },
    tipping: TIP_GULF,
    electricity: { plugTypes: ["G"], voltage: 240, frequency: 50 },
    tapWater: "safe",
    drivingSide: "right",
  },
  SA: {
    code: "SA",
    name: "Saudi Arabia",
    emergency: { universal: "911" },
    tipping: "Not obligatory; 10% at restaurants is increasingly common.",
    electricity: { plugTypes: ["G"], voltage: 230, frequency: 60 },
    tapWater: "caution",
    drivingSide: "right",
  },

  /* ---------------- Africa ---------------- */

  BW: {
    code: "BW",
    name: "Botswana",
    emergency: { police: "999", ambulance: "997", fire: "998" },
    tipping: "10% at restaurants; safari guides and trackers are tipped daily.",
    electricity: { plugTypes: ["D", "G", "M"], voltage: 230, frequency: 50 },
    tapWater: "caution",
    drivingSide: "left",
  },
  ET: {
    code: "ET",
    name: "Ethiopia",
    emergency: { police: "911", ambulance: "907", fire: "939" },
    tipping: "10% at restaurants; small notes for guides and drivers.",
    electricity: { plugTypes: ["C", "F", "L"], voltage: 220, frequency: 50 },
    tapWater: "unsafe",
    drivingSide: "right",
  },
  GH: {
    code: "GH",
    name: "Ghana",
    emergency: { universal: "112", police: "191", ambulance: "193", fire: "192" },
    tipping: "10% at restaurants; small notes for helpful service.",
    electricity: { plugTypes: ["D", "G"], voltage: 230, frequency: 50 },
    tapWater: "unsafe",
    drivingSide: "right",
  },
  KE: {
    code: "KE",
    name: "Kenya",
    emergency: { universal: "999", police: "999" },
    tipping: "10% at restaurants; safari guides are tipped per day.",
    electricity: { plugTypes: ["G"], voltage: 240, frequency: 50 },
    tapWater: "unsafe",
    drivingSide: "left",
  },
  MA: {
    code: "MA",
    name: "Morocco",
    emergency: { police: "19", ambulance: "15", fire: "15" },
    tipping: "10% at restaurants; small dirham notes for guides, porters and parking.",
    electricity: { plugTypes: ["C", "E"], voltage: 220, frequency: 50 },
    tapWater: "unsafe",
    drivingSide: "right",
  },
  MU: {
    code: "MU",
    name: "Mauritius",
    emergency: { police: "999", ambulance: "114", fire: "995" },
    tipping: "Not obligatory; 10% at restaurants is appreciated.",
    electricity: { plugTypes: ["C", "G"], voltage: 230, frequency: 50 },
    tapWater: "caution",
    drivingSide: "left",
  },
  NA: {
    code: "NA",
    name: "Namibia",
    emergency: { police: "10111" },
    tipping: "10% at restaurants; guides and trackers are tipped daily on safari.",
    electricity: { plugTypes: ["D", "M"], voltage: 220, frequency: 50 },
    tapWater: "caution",
    drivingSide: "left",
  },
  NG: {
    code: "NG",
    name: "Nigeria",
    emergency: { universal: "112" },
    tipping: "10% at restaurants; small notes for porters and attendants.",
    electricity: { plugTypes: ["D", "G"], voltage: 240, frequency: 50 },
    tapWater: "unsafe",
    drivingSide: "right",
  },
  RW: {
    code: "RW",
    name: "Rwanda",
    emergency: { police: "112", ambulance: "912", fire: "111" },
    tipping: "Not obligatory; 5-10% at restaurants and tips for trekking guides.",
    electricity: { plugTypes: ["C", "J"], voltage: 230, frequency: 50 },
    tapWater: "unsafe",
    drivingSide: "right",
  },
  SC: {
    code: "SC",
    name: "Seychelles",
    emergency: { universal: "999" },
    tipping: "Service is included in listed prices; extra is optional.",
    electricity: { plugTypes: ["G"], voltage: 240, frequency: 50 },
    tapWater: "caution",
    drivingSide: "left",
  },
  SN: {
    code: "SN",
    name: "Senegal",
    emergency: { police: "17", fire: "18" },
    tipping: "10% at restaurants; small notes for guides and drivers.",
    electricity: { plugTypes: ["C", "D", "E", "K"], voltage: 230, frequency: 50 },
    tapWater: "unsafe",
    drivingSide: "right",
  },
  TN: {
    code: "TN",
    name: "Tunisia",
    emergency: { police: "197", ambulance: "190", fire: "198" },
    tipping: "Round up, or 10% at restaurants; small notes for attendants.",
    electricity: { plugTypes: ["C", "E"], voltage: 230, frequency: 50 },
    tapWater: "unsafe",
    drivingSide: "right",
  },
  TZ: {
    code: "TZ",
    name: "Tanzania",
    emergency: { universal: "112" },
    tipping: "10% at restaurants; safari and Kilimanjaro crews are tipped per day.",
    electricity: { plugTypes: ["D", "G"], voltage: 230, frequency: 50 },
    tapWater: "unsafe",
    drivingSide: "left",
  },
  UG: {
    code: "UG",
    name: "Uganda",
    emergency: { universal: "999" },
    tipping: "10% at restaurants; gorilla-trekking guides and porters are tipped.",
    electricity: { plugTypes: ["G"], voltage: 240, frequency: 50 },
    tapWater: "unsafe",
    drivingSide: "left",
  },
  ZA: {
    code: "ZA",
    name: "South Africa",
    emergency: { universal: "112", police: "10111", ambulance: "10177" },
    tipping: "10-15% at restaurants; R5-10 for the car guard who watches your car.",
    electricity: { plugTypes: ["C", "D", "M", "N"], voltage: 230, frequency: 50 },
    tapWater: "caution",
    drivingSide: "left",
  },
};

/* ------------------------------------------------------------------ */
/* Lookup by ISO code                                                  */
/* ------------------------------------------------------------------ */

/** Lookup by ISO alpha-2, case-insensitive. Returns undefined for unknown codes. */
export function getCountryFacts(code: string | null | undefined): CountryFacts | undefined {
  if (!code) return undefined;
  return COUNTRY_FACTS[code.trim().toUpperCase()];
}

/* ------------------------------------------------------------------ */
/* Free-text address -> ISO code                                       */
/* ------------------------------------------------------------------ */

/**
 * Extra names each country answers to in free text, beyond its `name` above.
 * Endonyms and abbreviations only — never city names, which would misfire.
 */
const COUNTRY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  AE: ["uae"],
  AT: ["osterreich"],
  BA: ["bosnia", "bosnia herzegovina"],
  BE: ["belgie", "belgique", "belgien"],
  BR: ["brasil"],
  BS: ["the bahamas"],
  CH: ["suisse", "schweiz", "svizzera", "helvetia"],
  CN: ["peoples republic of china", "mainland china"],
  CZ: ["czech republic"],
  DE: ["deutschland"],
  DK: ["danmark"],
  ES: ["espana"],
  FI: ["suomi"],
  GB: ["uk", "great britain", "britain", "england", "scotland", "wales", "northern ireland"],
  GE: ["sakartvelo"],
  GR: ["hellas", "ellada"],
  HK: ["hong kong sar"],
  HR: ["hrvatska"],
  HU: ["magyarorszag"],
  IE: ["republic of ireland", "eire"],
  IN: ["bharat"],
  IT: ["italia"],
  JP: ["nippon", "nihon"],
  KR: ["korea", "republic of korea", "korea republic of", "korea south"],
  LA: ["lao pdr", "lao peoples democratic republic"],
  LK: ["ceylon"],
  MA: ["maroc", "al maghrib"],
  MK: ["macedonia"],
  MO: ["macao"],
  MX: ["estados unidos mexicanos"],
  NL: ["the netherlands", "holland", "nederland"],
  NO: ["norge"],
  NZ: ["aotearoa"],
  PF: ["tahiti"],
  PH: ["the philippines"],
  PL: ["polska"],
  RS: ["srbija"],
  RU: ["russian federation"],
  SA: ["kingdom of saudi arabia", "ksa"],
  SE: ["sverige"],
  TR: ["turkiye"],
  TT: ["trinidad", "tobago"],
  TW: ["chinese taipei"],
  US: ["usa", "u s a", "united states of america", "united states"],
  ZA: ["republic of south africa", "rsa"],
};

/**
 * US state names, used as a "this address is in the United States" signal so
 * that "Santa Fe, New Mexico" does not resolve to Mexico. "Georgia" is handled
 * separately below because it collides with the country of the same name.
 */
const US_STATE_NAMES: ReadonlySet<string> = new Set([
  "alabama",
  "alaska",
  "arizona",
  "arkansas",
  "california",
  "colorado",
  "connecticut",
  "delaware",
  "district of columbia",
  "florida",
  "hawaii",
  "idaho",
  "illinois",
  "indiana",
  "iowa",
  "kansas",
  "kentucky",
  "louisiana",
  "maine",
  "maryland",
  "massachusetts",
  "michigan",
  "minnesota",
  "mississippi",
  "missouri",
  "montana",
  "nebraska",
  "nevada",
  "new hampshire",
  "new jersey",
  "new mexico",
  "new york",
  "north carolina",
  "north dakota",
  "ohio",
  "oklahoma",
  "oregon",
  "pennsylvania",
  "rhode island",
  "south carolina",
  "south dakota",
  "tennessee",
  "texas",
  "utah",
  "vermont",
  "virginia",
  "washington",
  "washington dc",
  "west virginia",
  "wisconsin",
  "wyoming",
]);

/** Names that are also US state names and so can never be matched loosely. */
const AMBIGUOUS_US_STATE = "georgia";

/**
 * Words that, immediately before a country name, mean the phrase is a *place
 * inside another country* rather than the country: "Little India", "New Mexico".
 * Longer aliases are always tried first, so real names such as "South Korea" and
 * "New Zealand" match before this guard is ever consulted.
 */
const PRECEDING_GUARD: ReadonlySet<string> = new Set([
  "new",
  "little",
  "old",
  "north",
  "south",
  "east",
  "west",
  "upper",
  "lower",
  "greater",
  "san",
  "santa",
  "saint",
  "st",
  "port",
  "cape",
  "lake",
  "mount",
  "fort",
  "nueva",
  "nuevo",
]);

/** Words that, immediately after a country name, mark it as a street or landmark. */
const FOLLOWING_GUARD: ReadonlySet<string> = new Set([
  "street",
  "st",
  "road",
  "rd",
  "avenue",
  "ave",
  "boulevard",
  "blvd",
  "lane",
  "ln",
  "drive",
  "dr",
  "way",
  "square",
  "plaza",
  "park",
  "creek",
  "river",
  "hill",
  "hills",
  "valley",
  "beach",
  "bay",
  "county",
  "township",
  "town",
  "market",
  "mall",
  "arcade",
  "house",
  "hotel",
  "restaurant",
  "cafe",
  "bar",
  "museum",
  "garden",
  "gardens",
  "centre",
  "center",
  "airport",
  "station",
  "bridge",
  "tower",
  "gate",
]);

/**
 * Strip accents and punctuation and collapse whitespace, so that "U.S.A.",
 * " usa " and "Österreich" all reduce to something comparable.
 */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['\u2019.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** normalized name -> ISO code, for whole-segment lookups. */
const NAME_TO_CODE: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const facts of Object.values(COUNTRY_FACTS)) {
    map.set(normalize(facts.name), facts.code);
  }
  for (const [code, aliases] of Object.entries(COUNTRY_ALIASES)) {
    for (const alias of aliases) {
      map.set(normalize(alias), code);
    }
  }
  return map;
})();

interface AliasPattern {
  readonly code: string;
  readonly pattern: RegExp;
}

/**
 * Word-boundary patterns for the loose pass, longest name first so that
 * "north macedonia" wins over "macedonia" and "south korea" over "korea".
 * Names shorter than three characters (and the ambiguous "georgia") are
 * excluded — they cause far more false positives than they resolve.
 */
const ALIAS_PATTERNS: ReadonlyArray<AliasPattern> = (() => {
  const entries = [...NAME_TO_CODE.entries()]
    .filter(([name]) => name.length >= 3 && name !== AMBIGUOUS_US_STATE)
    .sort((a, b) => b[0].length - a[0].length);
  return entries.map(([name, code]) => ({
    code,
    pattern: new RegExp(`\\b${name.replace(/ /g, "\\s+")}\\b`),
  }));
})();

/** Split a segment's trailing 5-digit postcode off, e.g. "georgia 31401". */
const TRAILING_POSTCODE = /^(.*?)\s+(\d{5})(?:\s+\d{4})?$/;

/**
 * A segment that is nothing but a US-shaped ZIP code. Five digits distinguishes
 * it from the four-digit postcodes used in the country of Georgia, which is the
 * only place this signal is consulted.
 */
const US_ZIP_ONLY = /^\d{5}(?:\s+\d{4})?$/;

function lastWordBefore(segment: string, index: number): string {
  const before = segment.slice(0, index).trim();
  if (!before) return "";
  const words = before.split(" ");
  return words[words.length - 1] ?? "";
}

function firstWordAfter(segment: string, index: number): string {
  const after = segment.slice(index).trim();
  if (!after) return "";
  return after.split(" ")[0] ?? "";
}

function matchWithinSegment(segment: string): string | undefined {
  for (const { code, pattern } of ALIAS_PATTERNS) {
    const match = pattern.exec(segment);
    if (!match) continue;
    const before = lastWordBefore(segment, match.index);
    const after = firstWordAfter(segment, match.index + match[0].length);
    if (PRECEDING_GUARD.has(before) || FOLLOWING_GUARD.has(after)) continue;
    return code;
  }
  return undefined;
}

/**
 * Best-effort ISO alpha-2 from a free-text address (Location.address is free text —
 * there is no structured country column anywhere in the schema).
 *
 * Comma-separated segments are examined from the end backwards, because an
 * address that names its country almost always names it last. Only whole
 * segments and whole words ever match, so "Chinatown, San Francisco, USA"
 * resolves to US and never to CN. When nothing matches confidently the function
 * returns undefined rather than guessing.
 *
 * Known limitation: an address ending in a bare "Georgia" with no other US
 * signal resolves to the country GE, since the two are indistinguishable
 * without a gazetteer. Any US marker elsewhere in the address ("USA", another
 * state name, "County", a five-digit ZIP) tips it back to US.
 */
export function resolveCountryFromAddress(
  address: string | null | undefined,
): string | undefined {
  if (!address) return undefined;

  const segments = address
    .split(",")
    .map(normalize)
    .filter((segment) => segment.length > 0);
  if (segments.length === 0) return undefined;

  // Pass 1 — whole-segment matches, trailing segments first.
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const segment = segments[i];
    const postcodeMatch = TRAILING_POSTCODE.exec(segment);
    const base = postcodeMatch ? postcodeMatch[1] : segment;
    const hasPostcode = postcodeMatch !== null;

    if (base === AMBIGUOUS_US_STATE) {
      // A trailing postcode segment does not stop "Georgia" from being the
      // country slot, so only later segments containing letters count.
      const isFinalNamedSegment = segments.every(
        (other, j) => j <= i || !/[a-z]/.test(other),
      );
      const otherUsSignal =
        hasPostcode ||
        segments.some(
          (other, j) =>
            j !== i &&
            (isUnitedStatesState(other) || US_ZIP_ONLY.test(other) || /\bcounty\b/.test(other)),
        );
      return isFinalNamedSegment && !otherUsSignal ? "GE" : "US";
    }

    const direct = NAME_TO_CODE.get(base);
    if (direct) return direct;
    if (isUnitedStatesState(base)) return "US";
  }

  // Pass 2 — word-boundary matches inside a segment, trailing segments first.
  // Catches forms like "Tokyo 150-0002, Japan" and "Shibuya, Tokyo, Japan 150".
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const hit = matchWithinSegment(segments[i]);
    if (hit) return hit;
  }

  return undefined;
}

/** True when the whole segment names a US state (optionally with a ZIP code). */
function isUnitedStatesState(segment: string): boolean {
  if (US_STATE_NAMES.has(segment)) return true;
  const postcodeMatch = TRAILING_POSTCODE.exec(segment);
  return postcodeMatch !== null && US_STATE_NAMES.has(postcodeMatch[1]);
}
