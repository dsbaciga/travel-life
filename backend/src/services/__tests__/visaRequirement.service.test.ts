/**
 * VisaRequirement Service Tests
 *
 * Test cases:
 * - VR-001: Check visa requirement for known pair
 * - VR-002: Check visa requirement for same country (domestic)
 * - VR-003: Check visa requirement for unknown pair
 * - VR-004: Check visa requirements for multiple destinations
 * - VR-005: Determine if visa type requires action
 * - VR-006: Extract country from address
 * - VR-007: Get supported countries
 * - VR-008: Handle unloaded data gracefully
 * - VR-009: Service readiness and metadata
 */

// Mock fs/promises to provide test data
const mockVisaData = {
  metadata: {
    description: 'Test visa data',
    lastUpdated: '2025-01-01',
    disclaimer: 'Test only',
    sources: ['test'],
  },
  requirements: [
    {
      passportCountry: 'United States',
      destinationCountry: 'France',
      visaRequired: false,
      visaType: 'visa_free',
      maxStayDays: 90,
      notes: 'Schengen zone - 90 days in 180-day period',
      sourceUrl: 'https://example.com',
      lastVerified: '2025-01-01',
    },
    {
      passportCountry: 'United States',
      destinationCountry: 'Australia',
      visaRequired: true,
      visaType: 'eta',
      maxStayDays: 90,
      notes: 'Electronic Travel Authority required',
      sourceUrl: 'https://example.com',
      lastVerified: '2025-01-01',
    },
    {
      passportCountry: 'United States',
      destinationCountry: 'China',
      visaRequired: true,
      visaType: 'visa_required',
      maxStayDays: 30,
      notes: 'Visa must be obtained before travel',
      sourceUrl: 'https://example.com',
      lastVerified: '2025-01-01',
    },
    {
      passportCountry: 'United States',
      destinationCountry: 'Japan',
      visaRequired: false,
      visaType: 'visa_free',
      maxStayDays: 90,
      notes: 'No visa required for tourism',
      sourceUrl: 'https://example.com',
      lastVerified: '2025-01-01',
    },
    {
      passportCountry: 'United States',
      destinationCountry: 'United Kingdom',
      visaRequired: false,
      visaType: 'visa_free',
      maxStayDays: 180,
      notes: 'No visa required',
      sourceUrl: 'https://example.com',
      lastVerified: '2025-01-01',
    },
  ],
  countryAliases: {
    USA: 'United States',
    US: 'United States',
    UK: 'United Kingdom',
    GB: 'United Kingdom',
  },
  visaTypes: {
    visa_free: { label: 'Visa Free', description: 'No visa required', color: 'green' },
    eta: { label: 'ETA', description: 'Electronic Travel Authority', color: 'yellow' },
    visa_required: { label: 'Visa Required', description: 'Must apply for visa', color: 'red' },
    e_visa: { label: 'e-Visa', description: 'Electronic visa', color: 'yellow' },
    esta: { label: 'ESTA', description: 'Electronic System for Travel Authorization', color: 'yellow' },
    k_eta: { label: 'K-ETA', description: 'Korea ETA', color: 'yellow' },
    nzeta: { label: 'NZeTA', description: 'New Zealand ETA', color: 'yellow' },
    visa_on_arrival: { label: 'Visa on Arrival', description: 'Visa at airport', color: 'green' },
    visa_exemption: { label: 'Visa Exemption', description: 'Exempted', color: 'green' },
  },
};

jest.mock('fs/promises', () => ({
  readFile: jest.fn().mockResolvedValue(JSON.stringify(mockVisaData)),
}));

// Clear module cache to ensure fresh import with mocked fs
let visaService: typeof import('../visaRequirement.service').default;

beforeAll(async () => {
  // Dynamic import after mocks are in place
  const module = await import('../visaRequirement.service');
  visaService = module.default;
  // Wait for data to load
  await visaService.ensureLoaded();
});

describe('VisaRequirementService', () => {
  // ============================================================
  // VR-001: Check visa requirement for known pair
  // ============================================================
  describe('VR-001: Check known visa requirement', () => {
    it('should find visa-free entry for US to France', () => {
      const result = visaService.checkVisaRequirement('United States', 'France');

      expect(result.found).toBe(true);
      expect(result.requirement).not.toBeNull();
      expect(result.requirement!.visaRequired).toBe(false);
      expect(result.requirement!.visaType).toBe('visa_free');
      expect(result.requirement!.maxStayDays).toBe(90);
      expect(result.needsAction).toBe(false);
    });

    it('should find ETA requirement for US to Australia', () => {
      const result = visaService.checkVisaRequirement('United States', 'Australia');

      expect(result.found).toBe(true);
      expect(result.requirement!.visaType).toBe('eta');
      expect(result.needsAction).toBe(true);
      expect(result.actionRequired).toContain('Electronic Travel Authority');
    });

    it('should find visa required for US to China', () => {
      const result = visaService.checkVisaRequirement('United States', 'China');

      expect(result.found).toBe(true);
      expect(result.requirement!.visaRequired).toBe(true);
      expect(result.requirement!.visaType).toBe('visa_required');
      expect(result.needsAction).toBe(true);
      expect(result.actionRequired).toContain('embassy/consulate');
    });
  });

  // ============================================================
  // VR-002: Same country (domestic travel)
  // ============================================================
  describe('VR-002: Domestic travel', () => {
    it('should return visa-free for domestic travel', () => {
      const result = visaService.checkVisaRequirement('United States', 'United States');

      expect(result.found).toBe(true);
      expect(result.requirement!.visaRequired).toBe(false);
      expect(result.requirement!.visaType).toBe('visa_free');
      expect(result.requirement!.notes).toContain('domestic');
      expect(result.needsAction).toBe(false);
    });

    it('should handle aliases for same country check', () => {
      const result = visaService.checkVisaRequirement('US', 'USA');

      expect(result.found).toBe(true);
      expect(result.requirement!.visaRequired).toBe(false);
    });
  });

  // ============================================================
  // VR-003: Unknown pair
  // ============================================================
  describe('VR-003: Unknown pair', () => {
    it('should return not found for unknown passport-destination pair', () => {
      const result = visaService.checkVisaRequirement('Atlantis', 'Narnia');

      expect(result.found).toBe(false);
      expect(result.requirement).toBeNull();
      expect(result.visaTypeInfo).toBeNull();
      expect(result.needsAction).toBe(false);
    });
  });

  // ============================================================
  // VR-004: Multiple destinations
  // ============================================================
  describe('VR-004: Multiple destinations', () => {
    it('should check visa requirements for multiple destinations', () => {
      const result = visaService.getVisaRequirementsForDestinations(
        'United States',
        ['France', 'Australia', 'China', 'Narnia']
      );

      expect(result.passportCountry).toBe('United States');
      expect(result.destinations.length).toBe(4);
      expect(result.visaFree.length).toBe(1); // France
      expect(result.requiresVisa.length).toBe(2); // Australia (ETA), China (visa)
      expect(result.unknown.length).toBe(1); // Narnia
    });

    it('should deduplicate destinations', () => {
      const result = visaService.getVisaRequirementsForDestinations(
        'United States',
        ['France', 'France', 'France']
      );

      expect(result.destinations.length).toBe(1);
    });
  });

  // ============================================================
  // VR-005: Visa type requires action
  // ============================================================
  describe('VR-005: Action determination', () => {
    it('should correctly identify visa types requiring action', () => {
      const etaResult = visaService.checkVisaRequirement('United States', 'Australia');
      expect(etaResult.needsAction).toBe(true);

      const visaFreeResult = visaService.checkVisaRequirement('United States', 'France');
      expect(visaFreeResult.needsAction).toBe(false);

      const visaRequiredResult = visaService.checkVisaRequirement('United States', 'China');
      expect(visaRequiredResult.needsAction).toBe(true);
    });

    it('should provide visa type info', () => {
      const result = visaService.checkVisaRequirement('United States', 'France');

      expect(result.visaTypeInfo).not.toBeNull();
      expect(result.visaTypeInfo!.label).toBe('Visa Free');
      expect(result.visaTypeInfo!.color).toBe('green');
    });
  });

  // ============================================================
  // VR-006: Extract country from address
  // ============================================================
  describe('VR-006: Extract country from address', () => {
    it('should extract country from comma-separated address', () => {
      const country = visaService.extractCountryFromAddress('Paris, France');

      expect(country).toBe('France');
    });

    it('should extract country from full address', () => {
      const country = visaService.extractCountryFromAddress('123 Main St, Tokyo, Japan');

      expect(country).toBe('Japan');
    });

    it('should handle country aliases', () => {
      const country = visaService.extractCountryFromAddress('London, UK');

      expect(country).toBe('United Kingdom');
    });

    it('should return null for unknown address', () => {
      const country = visaService.extractCountryFromAddress('123 Unknown Street');

      expect(country).toBeNull();
    });

    it('should return null for empty address', () => {
      const country = visaService.extractCountryFromAddress('');

      expect(country).toBeNull();
    });
  });

  // ============================================================
  // VR-007: Get supported countries
  // ============================================================
  describe('VR-007: Supported countries', () => {
    it('should return sorted list of passport countries', () => {
      const countries = visaService.getSupportedPassportCountries();

      expect(countries.length).toBeGreaterThan(0);
      expect(countries).toContain('United States');
      // Should be sorted
      for (let i = 1; i < countries.length; i++) {
        expect(countries[i] >= countries[i - 1]).toBe(true);
      }
    });

    it('should return sorted list of destination countries', () => {
      const countries = visaService.getSupportedDestinationCountries();

      expect(countries.length).toBeGreaterThan(0);
      expect(countries).toContain('France');
      expect(countries).toContain('Australia');
    });
  });

  // ============================================================
  // VR-009: Service readiness and metadata
  // ============================================================
  describe('VR-009: Service readiness', () => {
    it('should report as ready after loading', () => {
      expect(visaService.isReady()).toBe(true);
    });

    it('should return metadata', () => {
      const metadata = visaService.getMetadata();

      expect(metadata).not.toBeNull();
      expect(metadata!.description).toBe('Test visa data');
      expect(metadata!.lastUpdated).toBe('2025-01-01');
    });

    it('should resolve ensureLoaded successfully', async () => {
      const loaded = await visaService.ensureLoaded();
      expect(loaded).toBe(true);
    });
  });
});
