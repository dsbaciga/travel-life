/**
 * Emergency Card country/number helper tests (feature #111)
 *
 * Test IDs:
 * - EMG-CTY-001: The stored override wins over the trip's addresses
 * - EMG-CTY-002: Falls back to the first address that resolves confidently
 * - EMG-CTY-003: Reports "unknown" rather than guessing
 * - EMG-CTY-004: A code outside the bundled dataset resolves without facts
 * - EMG-NUM-001: Absent emergency numbers are omitted, never rendered as "none"
 * - EMG-NUM-002: Known numbers come back in dialling order
 * - EMG-TEL-001: tel: hrefs are built only from something dialable
 */

import { describe, it, expect } from "vitest";
import {
  resolveTripCountry,
  listEmergencyNumbers,
  telHref,
} from "../emergencyCountry";

describe("resolveTripCountry", () => {
  // ==========================================================================
  // EMG-CTY-001
  // ==========================================================================
  it("EMG-CTY-001: should prefer the stored override over the addresses", () => {
    const result = resolveTripCountry("jp", ["Rua Augusta, Lisbon, Portugal"]);

    expect(result.code).toBe("JP");
    expect(result.source).toBe("override");
    expect(result.facts?.name).toBe("Japan");
  });

  // ==========================================================================
  // EMG-CTY-002
  // ==========================================================================
  it("EMG-CTY-002: should fall back to the first address that resolves", () => {
    const result = resolveTripCountry(null, [
      "Some Unnamed Trailhead",
      "Rua Augusta, Lisbon, Portugal",
      "Plaza Mayor, Madrid, Spain",
    ]);

    expect(result.code).toBe("PT");
    expect(result.source).toBe("address");
    expect(result.facts?.emergency.universal).toBe("112");
  });

  it("EMG-CTY-002: should treat a blank override as absent", () => {
    const result = resolveTripCountry("   ", ["Shibuya City, Tokyo, Japan"]);

    expect(result.code).toBe("JP");
    expect(result.source).toBe("address");
  });

  it("EMG-CTY-002b: a structured location code beats parsing the addresses, the override still wins", () => {
    const fromLocation = resolveTripCountry(null, ["Rua Augusta, Lisbon, Portugal"], ["jp"]);
    expect(fromLocation.code).toBe("JP");
    expect(fromLocation.source).toBe("location");
    expect(fromLocation.facts?.name).toBe("Japan");

    const overridden = resolveTripCountry("PT", [], ["JP"]);
    expect(overridden.code).toBe("PT");
    expect(overridden.source).toBe("override");

    // No codes (an older cached payload): the address path is unchanged.
    expect(resolveTripCountry(null, ["Rua Augusta, Lisbon, Portugal"], []).source).toBe("address");
  });

  // ==========================================================================
  // EMG-CTY-003
  // ==========================================================================
  it("EMG-CTY-003: should report unknown when nothing resolves", () => {
    const result = resolveTripCountry(null, ["Somewhere off the map"]);

    expect(result.code).toBeUndefined();
    expect(result.facts).toBeUndefined();
    expect(result.source).toBe("unknown");
  });

  it("EMG-CTY-003: should report unknown for a trip with no locations at all", () => {
    expect(resolveTripCountry(null).source).toBe("unknown");
    expect(resolveTripCountry(undefined, []).source).toBe("unknown");
  });

  // ==========================================================================
  // EMG-CTY-004
  // ==========================================================================
  it("EMG-CTY-004: should return a code with no facts when it is outside the dataset", () => {
    // Turkmenistan is a real ISO code the bundled snapshot does not cover. The
    // country is known; its numbers are not — and the two must stay separable so
    // the card can say which.
    const result = resolveTripCountry("TM", []);

    expect(result.code).toBe("TM");
    expect(result.facts).toBeUndefined();
    expect(result.source).toBe("override");
  });
});

describe("listEmergencyNumbers", () => {
  // ==========================================================================
  // EMG-NUM-001 — the rule the whole feature hangs on
  // ==========================================================================
  it("EMG-NUM-001: should omit absent numbers rather than reporting none", () => {
    // Belgium in the bundled dataset knows only universal + police. A missing
    // `ambulance` means "not confidently known", not "no ambulance service".
    const entries = listEmergencyNumbers({ universal: "112", police: "101" });

    expect(entries.map((entry) => entry.key)).toEqual(["universal", "police"]);
    expect(entries.some((entry) => /none|unknown|n\/a/i.test(entry.number))).toBe(false);
  });

  it("EMG-NUM-001: should drop blank strings the same way as missing keys", () => {
    const entries = listEmergencyNumbers({ universal: "999", ambulance: "   " });

    expect(entries).toHaveLength(1);
    expect(entries[0].key).toBe("universal");
  });

  it("EMG-NUM-001: should return an empty list when no country resolved", () => {
    expect(listEmergencyNumbers(undefined)).toEqual([]);
    expect(listEmergencyNumbers({})).toEqual([]);
  });

  // ==========================================================================
  // EMG-NUM-002
  // ==========================================================================
  it("EMG-NUM-002: should order entries universal, ambulance, police, fire", () => {
    const entries = listEmergencyNumbers({
      fire: "115",
      police: "113",
      ambulance: "118",
      universal: "112",
    });

    expect(entries.map((entry) => entry.key)).toEqual([
      "universal",
      "ambulance",
      "police",
      "fire",
    ]);
    expect(entries[0].label).toBe("All emergencies");
  });

  it("EMG-NUM-002: should trim surrounding whitespace from the number", () => {
    expect(listEmergencyNumbers({ universal: " 112 " })[0].number).toBe("112");
  });
});

describe("telHref", () => {
  // ==========================================================================
  // EMG-TEL-001
  // ==========================================================================
  it("EMG-TEL-001: should keep a leading plus and strip formatting", () => {
    expect(telHref("+351 21 727 3300")).toBe("tel:+351217273300");
    expect(telHref("(800) 555-0100")).toBe("tel:8005550100");
  });

  it("EMG-TEL-001: should return null when nothing dialable remains", () => {
    expect(telHref(null)).toBeNull();
    expect(telHref(undefined)).toBeNull();
    expect(telHref("call the front desk")).toBeNull();
  });
});
