import * as fs from 'fs/promises';
import * as path from 'path';
import {
  getCountryFacts,
  normalizeCountryCode,
  resolveCountryCodeFromName,
} from './_shared/vendored/countryFacts';

// =============================================================================
// TYPES
// =============================================================================

export type VisaType =
  | 'visa_free'
  | 'visa_exemption'
  | 'visa_on_arrival'
  | 'e_visa'
  | 'eta'
  | 'esta'
  | 'k_eta'
  | 'nzeta'
  | 'visa_required';

export interface VisaRequirement {
  passportCountry: string;
  destinationCountry: string;
  /** ISO 3166-1 alpha-2 of passportCountry; derived from the name when the data file has none. */
  passportCountryCode?: string;
  /** ISO 3166-1 alpha-2 of destinationCountry; derived from the name when the data file has none. */
  destinationCountryCode?: string;
  visaRequired: boolean;
  visaType: VisaType;
  maxStayDays: number;
  notes: string;
  sourceUrl: string;
  lastVerified: string;
}

export interface VisaTypeInfo {
  label: string;
  description: string;
  color: 'green' | 'yellow' | 'red';
}

/** Optional structured codes for a check; names are the fallback when a code is absent. */
export interface VisaCheckCodes {
  passportCountryCode?: string | null;
  destinationCountryCode?: string | null;
}

/** A destination to check: a display name plus the ISO code when the caller knows it. */
export interface VisaDestination {
  name: string;
  countryCode?: string | null;
}

export interface VisaCheckResult {
  passportCountry: string;
  destinationCountry: string;
  /** ISO code the check was matched on, when one was known or derivable. */
  destinationCountryCode?: string;
  found: boolean;
  requirement: VisaRequirement | null;
  visaTypeInfo: VisaTypeInfo | null;
  needsAction: boolean;
  actionRequired: string | null;
}

export interface BulkVisaCheckResult {
  passportCountry: string;
  destinations: VisaCheckResult[];
  requiresVisa: VisaCheckResult[];
  visaFree: VisaCheckResult[];
  unknown: VisaCheckResult[];
}

interface VisaData {
  metadata: {
    description: string;
    lastUpdated: string;
    disclaimer: string;
    sources: string[];
  };
  requirements: VisaRequirement[];
  countryAliases: Record<string, string>;
  visaTypes: Record<string, VisaTypeInfo>;
}

// =============================================================================
// SERVICE
// =============================================================================

class VisaRequirementService {
  private data: VisaData | null = null;
  private requirementMap: Map<string, VisaRequirement> = new Map();
  /** Same rows keyed `PASSPORT_CODE|DESTINATION_CODE`; tried before the name keys. */
  private requirementByCode: Map<string, VisaRequirement> = new Map();
  /** ISO code -> the name the data file uses for it, for stable display and issue ids. */
  private destinationNameByCode: Map<string, string> = new Map();
  private knownCountries: Set<string> = new Set();
  private loaded = false;
  private loadPromise: Promise<void> | null = null;

  constructor() {
    // Start loading asynchronously (don't block constructor)
    this.loadPromise = this.loadData();
  }

  /**
   * Load visa requirements data from JSON file (async to avoid blocking event loop)
   */
  private async loadData(): Promise<void> {
    try {
      const dataPath = path.join(__dirname, '../../data/visa-requirements.json');
      const rawData = await fs.readFile(dataPath, 'utf-8');
      this.data = JSON.parse(rawData) as VisaData;

      // Build a lookup map for fast access
      for (const req of this.data.requirements) {
        const key = this.buildKey(req.passportCountry, req.destinationCountry);
        this.requirementMap.set(key, req);

        // Structured codes, derived from the names (the data file predates them). A name the
        // shared table does not know keeps no code and is only reachable through the name key.
        req.passportCountryCode = req.passportCountryCode ?? resolveCountryCodeFromName(req.passportCountry);
        req.destinationCountryCode =
          req.destinationCountryCode ?? resolveCountryCodeFromName(req.destinationCountry);
        if (req.destinationCountryCode && !this.destinationNameByCode.has(req.destinationCountryCode)) {
          this.destinationNameByCode.set(req.destinationCountryCode, req.destinationCountry);
        }
        if (req.passportCountryCode && req.destinationCountryCode) {
          this.requirementByCode.set(`${req.passportCountryCode}|${req.destinationCountryCode}`, req);
        }
      }

      // Build known countries set for fast lookup (includes aliases)
      for (const alias of Object.keys(this.data.countryAliases)) {
        this.knownCountries.add(alias.toLowerCase());
      }
      for (const req of this.data.requirements) {
        this.knownCountries.add(req.passportCountry.toLowerCase());
        this.knownCountries.add(req.destinationCountry.toLowerCase());
      }

      this.loaded = true;
      console.info(
        `[VisaRequirementService] Loaded ${this.data.requirements.length} visa requirements`
      );
    } catch (error) {
      console.error('[VisaRequirementService] Failed to load visa requirements data:', error);
      this.data = null;
      this.loaded = false;
    }
  }

  /**
   * Ensure data is loaded before accessing it (for callers that need to wait)
   */
  async ensureLoaded(): Promise<boolean> {
    if (this.loadPromise) {
      await this.loadPromise;
    }
    return this.loaded;
  }

  /**
   * Build a lookup key from passport and destination countries
   */
  private buildKey(passportCountry: string, destinationCountry: string): string {
    return `${this.normalizeCountry(passportCountry)}|${this.normalizeCountry(destinationCountry)}`;
  }

  /**
   * Normalize country name (handle aliases and case)
   */
  private normalizeCountry(country: string): string {
    if (!this.data) return country.toLowerCase().trim();

    const trimmed = country.trim();
    const alias = this.data.countryAliases[trimmed];
    if (alias) {
      return alias.toLowerCase();
    }
    return trimmed.toLowerCase();
  }

  /**
   * Get visa type info for a given visa type
   */
  private getVisaTypeInfo(visaType: VisaType): VisaTypeInfo | null {
    if (!this.data) return null;
    return this.data.visaTypes[visaType] || null;
  }

  /**
   * Determine if a visa type requires action before travel
   */
  private requiresAction(visaType: VisaType): boolean {
    // These types require obtaining something before travel
    return ['e_visa', 'eta', 'esta', 'k_eta', 'nzeta', 'visa_required'].includes(visaType);
  }

  /**
   * Get the action required for a visa type
   */
  private getActionRequired(visaType: VisaType): string | null {
    switch (visaType) {
      case 'e_visa':
        return 'Apply for e-Visa online before travel';
      case 'eta':
        return 'Apply for Electronic Travel Authority before travel';
      case 'esta':
        return 'Apply for ESTA before travel';
      case 'k_eta':
        return 'Apply for K-ETA before travel';
      case 'nzeta':
        return 'Apply for NZeTA before travel';
      case 'visa_required':
        return 'Apply for visa at embassy/consulate before travel';
      default:
        return null;
    }
  }

  /**
   * Check visa requirement for a single passport-destination pair
   */
  checkVisaRequirement(
    passportCountry: string,
    destinationCountry: string,
    codes: VisaCheckCodes = {}
  ): VisaCheckResult {
    // Structured codes first (supplied, else derived from the name); names are the fallback.
    const passportCode =
      normalizeCountryCode(codes.passportCountryCode) ?? resolveCountryCodeFromName(passportCountry);
    const destinationCode =
      normalizeCountryCode(codes.destinationCountryCode) ?? resolveCountryCodeFromName(destinationCountry);

    if (!this.loaded || !this.data) {
      return {
        passportCountry,
        destinationCountry,
        found: false,
        requirement: null,
        visaTypeInfo: null,
        needsAction: false,
        actionRequired: null,
      };
    }

    // Same country - no visa needed
    const sameCountry =
      passportCode && destinationCode
        ? passportCode === destinationCode
        : this.normalizeCountry(passportCountry) === this.normalizeCountry(destinationCountry);
    if (sameCountry) {
      return {
        passportCountry,
        destinationCountry,
        destinationCountryCode: destinationCode,
        found: true,
        requirement: {
          passportCountry,
          destinationCountry,
          visaRequired: false,
          visaType: 'visa_free',
          maxStayDays: -1,
          notes: 'No visa required for domestic travel',
          sourceUrl: '',
          lastVerified: new Date().toISOString().split('T')[0],
        },
        visaTypeInfo: this.getVisaTypeInfo('visa_free'),
        needsAction: false,
        actionRequired: null,
      };
    }

    const requirement =
      (passportCode && destinationCode
        ? this.requirementByCode.get(`${passportCode}|${destinationCode}`)
        : undefined) ?? this.requirementMap.get(this.buildKey(passportCountry, destinationCountry));

    if (!requirement) {
      return {
        passportCountry,
        destinationCountry,
        destinationCountryCode: destinationCode,
        found: false,
        requirement: null,
        visaTypeInfo: null,
        needsAction: false,
        actionRequired: null,
      };
    }

    return {
      passportCountry,
      destinationCountry,
      destinationCountryCode: destinationCode,
      found: true,
      requirement,
      visaTypeInfo: this.getVisaTypeInfo(requirement.visaType),
      needsAction: this.requiresAction(requirement.visaType),
      actionRequired: this.getActionRequired(requirement.visaType),
    };
  }

  /**
   * Check visa requirements for multiple destinations
   */
  getVisaRequirementsForDestinations(
    passportCountry: string,
    destinations: Array<string | VisaDestination>,
    passportCountryCode?: string | null
  ): BulkVisaCheckResult {
    const results: VisaCheckResult[] = [];
    const requiresVisa: VisaCheckResult[] = [];
    const visaFree: VisaCheckResult[] = [];
    const unknown: VisaCheckResult[] = [];

    // Remove duplicates: by ISO code when there is one (so "USA" and "United States" collapse),
    // otherwise by trimmed name.
    const unique = new Map<string, VisaDestination>();
    for (const entry of destinations) {
      const destination: VisaDestination =
        typeof entry === 'string' ? { name: entry.trim() } : { ...entry, name: entry.name.trim() };
      const code = normalizeCountryCode(destination.countryCode) ?? resolveCountryCodeFromName(destination.name);
      const key = code ? `code:${code}` : `name:${destination.name.toLowerCase()}`;
      if (!unique.has(key)) unique.set(key, destination);
    }

    for (const destination of unique.values()) {
      const result = this.checkVisaRequirement(passportCountry, destination.name, {
        passportCountryCode,
        destinationCountryCode: destination.countryCode,
      });
      results.push(result);

      if (!result.found) {
        unknown.push(result);
      } else if (result.requirement?.visaRequired || result.needsAction) {
        requiresVisa.push(result);
      } else {
        visaFree.push(result);
      }
    }

    return {
      passportCountry,
      destinations: results,
      requiresVisa,
      visaFree,
      unknown,
    };
  }

  /**
   * Extract country name from an address string
   * Attempts to find a country name in the address
   */
  extractCountryFromAddress(address: string): string | null {
    if (!address) return null;

    // Common pattern: country is usually the last part after a comma
    const parts = address.split(',').map((p) => p.trim());

    // Try the last part first
    if (parts.length > 0) {
      const lastPart = parts[parts.length - 1];
      if (this.isKnownCountry(lastPart)) {
        return this.resolveCountryAlias(lastPart);
      }
    }

    // Try the second-to-last part (sometimes there's a postal code after country)
    if (parts.length > 1) {
      const secondToLast = parts[parts.length - 2];
      if (this.isKnownCountry(secondToLast)) {
        return this.resolveCountryAlias(secondToLast);
      }
    }

    // Try to find any known country in the address
    for (const part of parts) {
      if (this.isKnownCountry(part)) {
        return this.resolveCountryAlias(part);
      }
    }

    return null;
  }

  /**
   * Check if a string matches a known country (in requirements or aliases)
   * Uses pre-built knownCountries set for O(1) lookup instead of O(n) iteration
   */
  private isKnownCountry(name: string): boolean {
    if (!this.data) return false;

    const normalized = name.trim().toLowerCase();
    return this.knownCountries.has(normalized);
  }

  /**
   * Resolve a country alias to its canonical name
   */
  private resolveCountryAlias(name: string): string {
    if (!this.data) return name;

    const trimmed = name.trim();

    // Check aliases first
    for (const [alias, canonical] of Object.entries(this.data.countryAliases)) {
      if (alias.toLowerCase() === trimmed.toLowerCase()) {
        return canonical;
      }
    }

    // Try to match against known countries (case-insensitive)
    const countriesInData = new Map<string, string>();
    for (const req of this.data.requirements) {
      countriesInData.set(req.passportCountry.toLowerCase(), req.passportCountry);
      countriesInData.set(req.destinationCountry.toLowerCase(), req.destinationCountry);
    }

    const canonical = countriesInData.get(trimmed.toLowerCase());
    return canonical || trimmed;
  }

  /**
   * The display name for an ISO country code: the name the visa data uses (so issue ids stay
   * stable), else the bundled country name, else the code itself.
   */
  getCountryName(code: string): string {
    const normalized = normalizeCountryCode(code);
    if (!normalized) return code;
    return this.destinationNameByCode.get(normalized) ?? getCountryFacts(normalized)?.name ?? normalized;
  }

  /**
   * Get list of supported passport countries
   */
  getSupportedPassportCountries(): string[] {
    if (!this.data) return [];

    const countries = new Set<string>();
    for (const req of this.data.requirements) {
      countries.add(req.passportCountry);
    }
    return Array.from(countries).sort();
  }

  /**
   * Get list of supported destination countries
   */
  getSupportedDestinationCountries(): string[] {
    if (!this.data) return [];

    const countries = new Set<string>();
    for (const req of this.data.requirements) {
      countries.add(req.destinationCountry);
    }
    return Array.from(countries).sort();
  }

  /**
   * Check if service is ready (data loaded)
   */
  isReady(): boolean {
    return this.loaded;
  }

  /**
   * Get metadata about the visa data
   */
  getMetadata(): VisaData['metadata'] | null {
    return this.data?.metadata || null;
  }
}

export default new VisaRequirementService();
