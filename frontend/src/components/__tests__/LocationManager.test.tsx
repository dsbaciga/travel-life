/**
 * LocationManager Component Tests
 *
 * Test IDs:
 * - MGR-LOC-001: No infinite loop on mount
 * - MGR-LOC-002: Create location with map picker
 * - MGR-LOC-003: Geocoding search
 * - MGR-LOC-004: Update location
 * - MGR-LOC-005: Delete location
 * - MGR-LOC-006: Category assignment
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router";
import LocationManager from "../LocationManager";
import locationService from "../../services/location.service";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  mockLocation,
  mockLocationCategories,
  createMockLocation,
} from "../../test/fixtures";
import type { Location } from "../../types/location";

// Mock the location service
vi.mock("../../services/location.service", () => ({
  default: {
    getLocationsByTrip: vi.fn(),
    createLocation: vi.fn(),
    updateLocation: vi.fn(),
    deleteLocation: vi.fn(),
    getCategories: vi.fn(),
    createCategory: vi.fn(),
  },
}));

// Mock entity link service
vi.mock("../../services/entityLink.service", () => ({
  default: {
    getLinksFrom: vi.fn(),
    getLinksTo: vi.fn(),
    getAllLinksForEntity: vi.fn(),
    getPhotosForEntity: vi.fn(),
    getTripLinkSummary: vi.fn(),
    createLink: vi.fn(),
    deleteLink: vi.fn(),
  },
}));

// Mock react-hot-toast
vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
  Toaster: () => null,
}));

// Mock the hooks that use entity links
vi.mock("../../hooks/useTripLinkSummary", () => ({
  useTripLinkSummary: () => ({
    getLinkSummary: vi.fn().mockReturnValue(null),
    invalidate: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock("../../hooks/useEntityLinking", () => ({
  useEntityLinking: () => ({
    openLinkPanel: vi.fn(),
    closeLinkPanel: vi.fn(),
    linkingEntityId: null,
    showLinkPanel: false,
  }),
}));

// Mock the map components that require Leaflet
vi.mock("../LocationSearchMap", () => ({
  default: ({ onLocationSelect }: { onLocationSelect: (data: { name: string; address: string; latitude: number; longitude: number }) => void }) => (
    <div data-testid="mock-location-search-map">
      <button
        type="button"
        data-testid="select-location-btn"
        onClick={() => onLocationSelect({
          name: "Eiffel Tower",
          address: "Paris, France",
          latitude: 48.8584,
          longitude: 2.2945,
        })}
      >
        Select Location
      </button>
    </div>
  ),
}));

vi.mock("../TripLocationsMap", () => ({
  default: () => <div data-testid="mock-trip-locations-map">Map</div>,
}));

describe("LocationManager", () => {
  const tripId = 1;
  let queryClient: QueryClient;

  const renderLocationManager = (props = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <LocationManager
            tripId={tripId}
            tripTimezone="Europe/Paris"
            {...props}
          />
        </BrowserRouter>
      </QueryClientProvider>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // Default mock implementations
    vi.mocked(locationService.getLocationsByTrip).mockResolvedValue([]);
    vi.mocked(locationService.getCategories).mockResolvedValue(mockLocationCategories);
  });

  afterEach(() => {
    queryClient.clear();
  });

  // ==========================================================================
  // MGR-LOC-001: No infinite loop on mount
  // ==========================================================================
  describe("MGR-LOC-001: No infinite loop on mount", () => {
    it("should not cause infinite loop on mount", async () => {
      const getLocationsSpy = vi.mocked(locationService.getLocationsByTrip);

      renderLocationManager();

      // Wait for initial load
      await waitFor(() => {
        expect(getLocationsSpy).toHaveBeenCalledTimes(1);
      });

      // Wait a bit longer to ensure no additional calls
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should still only be called once
      expect(getLocationsSpy).toHaveBeenCalledTimes(1);
    });

    it("should load locations with correct tripId", async () => {
      const getLocationsSpy = vi.mocked(locationService.getLocationsByTrip);

      renderLocationManager();

      await waitFor(() => {
        expect(getLocationsSpy).toHaveBeenCalledWith(tripId);
      });
    });

    it("should load categories on mount", async () => {
      const getCategoriesSpy = vi.mocked(locationService.getCategories);

      renderLocationManager();

      await waitFor(() => {
        expect(getCategoriesSpy).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ==========================================================================
  // MGR-LOC-002: Create location with map picker
  // ==========================================================================
  describe("MGR-LOC-002: Create location with map picker", () => {
    it("should display add location button", async () => {
      renderLocationManager();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /add location/i })).toBeInTheDocument();
      });
    });

    it("should open form modal when clicking add button", async () => {
      const user = userEvent.setup();
      renderLocationManager();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /add location/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /add location/i }));

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        // Modal title contains "Add Location" - use the modal's heading
        expect(screen.getByRole("heading", { name: /add location/i })).toBeInTheDocument();
      });
    });

    it("should display map search component in form", async () => {
      const user = userEvent.setup();
      renderLocationManager();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /add location/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /add location/i }));

      await waitFor(() => {
        expect(screen.getByTestId("mock-location-search-map")).toBeInTheDocument();
      });
    });

    it("should populate form when location is selected from map", async () => {
      const user = userEvent.setup();
      renderLocationManager();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /add location/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /add location/i }));

      await waitFor(() => {
        expect(screen.getByTestId("mock-location-search-map")).toBeInTheDocument();
      });

      // Click the mock map's select button
      await user.click(screen.getByTestId("select-location-btn"));

      // Check that form fields are populated
      await waitFor(() => {
        const nameInput = screen.getByLabelText(/^name/i) as HTMLInputElement;
        expect(nameInput.value).toBe("Eiffel Tower");
      });

      const addressInput = screen.getByLabelText(/address/i) as HTMLInputElement;
      expect(addressInput.value).toBe("Paris, France");
    });

    it("should create location when form is submitted", async () => {
      const user = userEvent.setup();
      const newLocation = createMockLocation({ name: "New Test Location" });

      vi.mocked(locationService.createLocation).mockResolvedValue(newLocation);
      vi.mocked(locationService.getLocationsByTrip)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([newLocation]);

      renderLocationManager();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /add location/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /add location/i }));

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      // Fill in the name field using fireEvent for reliability
      const nameInput = screen.getByLabelText(/^name/i);
      fireEvent.change(nameInput, { target: { value: "New Test Location" } });

      // Submit the form
      const submitButton = screen.getByRole("button", { name: /^add location$/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(locationService.createLocation).toHaveBeenCalledWith(
          expect.objectContaining({
            tripId,
            name: "New Test Location",
          })
        );
      });
    });

    it("should close modal after successful creation", async () => {
      const user = userEvent.setup();
      const newLocation = createMockLocation({ name: "Test Location" });

      vi.mocked(locationService.createLocation).mockResolvedValue(newLocation);
      vi.mocked(locationService.getLocationsByTrip)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([newLocation]);

      renderLocationManager();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /add location/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /add location/i }));

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/^name/i);
      fireEvent.change(nameInput, { target: { value: "Test Location" } });

      await user.click(screen.getByRole("button", { name: /^add location$/i }));

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });

    it("should include coordinates when location is selected from map", async () => {
      const user = userEvent.setup();
      const newLocation = createMockLocation({
        name: "Eiffel Tower",
        address: "Paris, France",
        latitude: 48.8584,
        longitude: 2.2945,
      });

      vi.mocked(locationService.createLocation).mockResolvedValue(newLocation);
      vi.mocked(locationService.getLocationsByTrip)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([newLocation]);

      renderLocationManager();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /add location/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /add location/i }));

      await waitFor(() => {
        expect(screen.getByTestId("mock-location-search-map")).toBeInTheDocument();
      });

      // Select location from map
      await user.click(screen.getByTestId("select-location-btn"));

      // Submit the form
      await user.click(screen.getByRole("button", { name: /^add location$/i }));

      await waitFor(() => {
        expect(locationService.createLocation).toHaveBeenCalledWith(
          expect.objectContaining({
            tripId,
            name: "Eiffel Tower",
            address: "Paris, France",
            latitude: 48.8584,
            longitude: 2.2945,
          })
        );
      });
    });
  });

  // ==========================================================================
  // MGR-LOC-003: Geocoding search
  // ==========================================================================
  describe("MGR-LOC-003: Geocoding search", () => {
    it("should display map search component for geocoding", async () => {
      const user = userEvent.setup();
      renderLocationManager();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /add location/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /add location/i }));

      await waitFor(() => {
        // The mock LocationSearchMap component should be visible
        expect(screen.getByTestId("mock-location-search-map")).toBeInTheDocument();
      });
    });

    it("should auto-populate form fields when location is selected from search", async () => {
      const user = userEvent.setup();
      renderLocationManager();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /add location/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /add location/i }));

      await waitFor(() => {
        expect(screen.getByTestId("mock-location-search-map")).toBeInTheDocument();
      });

      // Simulate selecting a location from the search
      await user.click(screen.getByTestId("select-location-btn"));

      // Verify form fields are populated
      await waitFor(() => {
        const nameInput = screen.getByLabelText(/^name/i) as HTMLInputElement;
        const addressInput = screen.getByLabelText(/address/i) as HTMLInputElement;

        expect(nameInput.value).toBe("Eiffel Tower");
        expect(addressInput.value).toBe("Paris, France");
      });
    });
  });

  // ==========================================================================
  // MGR-LOC-004: Update location
  // ==========================================================================
  describe("MGR-LOC-004: Update location", () => {
    it("should display edit button for each location", async () => {
      vi.mocked(locationService.getLocationsByTrip).mockResolvedValue([mockLocation]);

      renderLocationManager();

      await waitFor(() => {
        expect(screen.getByText(mockLocation.name)).toBeInTheDocument();
      });

      expect(screen.getByRole("button", { name: /edit location/i })).toBeInTheDocument();
    });

    it("should open edit form when clicking edit button", async () => {
      const user = userEvent.setup();
      vi.mocked(locationService.getLocationsByTrip).mockResolvedValue([mockLocation]);

      renderLocationManager();

      await waitFor(() => {
        expect(screen.getByText(mockLocation.name)).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /edit location/i }));

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(screen.getByText(/edit location/i)).toBeInTheDocument();
      });
    });

    it("should populate form with existing location data", async () => {
      const user = userEvent.setup();
      vi.mocked(locationService.getLocationsByTrip).mockResolvedValue([mockLocation]);

      renderLocationManager();

      await waitFor(() => {
        expect(screen.getByText(mockLocation.name)).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /edit location/i }));

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/^name/i) as HTMLInputElement;
      expect(nameInput.value).toBe(mockLocation.name);

      const addressInput = screen.getByLabelText(/address/i) as HTMLInputElement;
      expect(addressInput.value).toBe(mockLocation.address);
    });

    it("should update location when edit form is submitted", async () => {
      const user = userEvent.setup();
      const updatedLocation = { ...mockLocation, name: "Updated Location Name" };

      vi.mocked(locationService.getLocationsByTrip).mockResolvedValue([mockLocation]);
      vi.mocked(locationService.updateLocation).mockResolvedValue(updatedLocation);

      renderLocationManager();

      await waitFor(() => {
        expect(screen.getByText(mockLocation.name)).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /edit location/i }));

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/^name/i);
      fireEvent.change(nameInput, { target: { value: "Updated Location Name" } });

      await user.click(screen.getByRole("button", { name: /update location/i }));

      await waitFor(() => {
        expect(locationService.updateLocation).toHaveBeenCalledWith(
          mockLocation.id,
          expect.objectContaining({
            name: "Updated Location Name",
          })
        );
      });
    });

    it("should close modal after successful update", async () => {
      const user = userEvent.setup();
      const updatedLocation = { ...mockLocation, name: "Updated Name" };

      vi.mocked(locationService.getLocationsByTrip).mockResolvedValue([mockLocation]);
      vi.mocked(locationService.updateLocation).mockResolvedValue(updatedLocation);

      renderLocationManager();

      await waitFor(() => {
        expect(screen.getByText(mockLocation.name)).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /edit location/i }));

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/^name/i);
      fireEvent.change(nameInput, { target: { value: "Updated Name" } });

      await user.click(screen.getByRole("button", { name: /update location/i }));

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // MGR-LOC-005: Delete location
  // ==========================================================================
  describe("MGR-LOC-005: Delete location", () => {
    it("should display delete button for each location", async () => {
      vi.mocked(locationService.getLocationsByTrip).mockResolvedValue([mockLocation]);

      renderLocationManager();

      await waitFor(() => {
        expect(screen.getByText(mockLocation.name)).toBeInTheDocument();
      });

      expect(screen.getByRole("button", { name: /delete location/i })).toBeInTheDocument();
    });

    it("should show confirmation dialog when clicking delete", async () => {
      const user = userEvent.setup();
      vi.mocked(locationService.getLocationsByTrip).mockResolvedValue([mockLocation]);

      renderLocationManager();

      await waitFor(() => {
        expect(screen.getByText(mockLocation.name)).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /delete location/i }));

      await waitFor(() => {
        expect(screen.getByText(/delete.*location/i)).toBeInTheDocument();
      });
    });

    it("should delete location when confirmed", async () => {
      const user = userEvent.setup();
      vi.mocked(locationService.getLocationsByTrip)
        .mockResolvedValueOnce([mockLocation])
        .mockResolvedValueOnce([]);
      vi.mocked(locationService.deleteLocation).mockResolvedValue(undefined);

      renderLocationManager();

      await waitFor(() => {
        expect(screen.getByText(mockLocation.name)).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /delete location/i }));

      await waitFor(() => {
        expect(screen.getByText(/delete.*location/i)).toBeInTheDocument();
      });

      // Click confirm in the dialog
      const confirmButton = screen.getByRole("button", { name: /^delete$/i });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(locationService.deleteLocation).toHaveBeenCalledWith(mockLocation.id);
      });
    });

    it("should not delete location when cancelled", async () => {
      const user = userEvent.setup();
      vi.mocked(locationService.getLocationsByTrip).mockResolvedValue([mockLocation]);

      renderLocationManager();

      await waitFor(() => {
        expect(screen.getByText(mockLocation.name)).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /delete location/i }));

      await waitFor(() => {
        expect(screen.getByText(/delete.*location/i)).toBeInTheDocument();
      });

      // Click cancel in the dialog
      const cancelButton = screen.getByRole("button", { name: /cancel/i });
      await user.click(cancelButton);

      expect(locationService.deleteLocation).not.toHaveBeenCalled();
      expect(screen.getByText(mockLocation.name)).toBeInTheDocument();
    });

    it("should remove location from list after deletion", async () => {
      const user = userEvent.setup();
      vi.mocked(locationService.getLocationsByTrip)
        .mockResolvedValueOnce([mockLocation])
        .mockResolvedValueOnce([]);
      vi.mocked(locationService.deleteLocation).mockResolvedValue(undefined);

      renderLocationManager();

      await waitFor(() => {
        expect(screen.getByText(mockLocation.name)).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /delete location/i }));

      await waitFor(() => {
        expect(screen.getByText(/delete.*location/i)).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole("button", { name: /^delete$/i });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(screen.queryByText(mockLocation.name)).not.toBeInTheDocument();
      });
    });

    it("should show special message for locations with children", async () => {
      const user = userEvent.setup();
      // Parent location with children
      const parentLoc = createMockLocation({
        id: 1,
        name: "Paris",
        parentId: null,
      });
      const childLoc = createMockLocation({
        id: 2,
        name: "Eiffel Tower",
        parentId: 1,
      });

      vi.mocked(locationService.getLocationsByTrip).mockResolvedValue([parentLoc, childLoc]);

      renderLocationManager();

      await waitFor(() => {
        expect(screen.getByText("Paris")).toBeInTheDocument();
      });

      // Click delete on the parent location (first one)
      const deleteButtons = screen.getAllByRole("button", { name: /delete location/i });
      await user.click(deleteButtons[0]);

      await waitFor(() => {
        // Should mention child locations
        expect(screen.getByText(/child locations/i)).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // MGR-LOC-006: Category assignment
  // ==========================================================================
  describe("MGR-LOC-006: Category assignment", () => {
    it("should display category dropdown in form", async () => {
      const user = userEvent.setup();
      renderLocationManager();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /add location/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /add location/i }));

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
    });

    it("should display available categories in dropdown", async () => {
      const user = userEvent.setup();
      renderLocationManager();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /add location/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /add location/i }));

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      const categorySelect = screen.getByLabelText(/category/i) as HTMLSelectElement;

      // Check that categories are available as options
      // Categories may appear as options in the select dropdown
      const options = Array.from(categorySelect.querySelectorAll("option"));

      // Should have at least the default "select category" option plus our mock categories
      expect(options.length).toBeGreaterThan(1);

      // Check that at least one of our mock category names appears in an option
      const categoryNames = mockLocationCategories.map(cat => cat.name);
      const hasCategory = options.some(opt =>
        categoryNames.some(name => opt.textContent?.includes(name))
      );
      expect(hasCategory).toBe(true);
    });

    it("should save location with selected category", async () => {
      const user = userEvent.setup();
      const categoryId = mockLocationCategories[0].id;
      const newLocation = createMockLocation({
        name: "Test Location",
        categoryId,
        category: mockLocationCategories[0],
      });

      vi.mocked(locationService.createLocation).mockResolvedValue(newLocation);
      vi.mocked(locationService.getLocationsByTrip)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([newLocation]);

      renderLocationManager();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /add location/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /add location/i }));

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      // Fill in name
      const nameInput = screen.getByLabelText(/^name/i);
      fireEvent.change(nameInput, { target: { value: "Test Location" } });

      // Select category
      const categorySelect = screen.getByLabelText(/category/i);
      await user.selectOptions(categorySelect, categoryId.toString());

      // Submit
      await user.click(screen.getByRole("button", { name: /^add location$/i }));

      await waitFor(() => {
        expect(locationService.createLocation).toHaveBeenCalledWith(
          expect.objectContaining({
            tripId,
            name: "Test Location",
            categoryId,
          })
        );
      });
    });

    it("should display category badge on location cards", async () => {
      const locationWithCategory = createMockLocation({
        id: 1,
        name: "Test With Category",
        categoryId: mockLocationCategories[0].id,
        category: mockLocationCategories[0],
      });

      vi.mocked(locationService.getLocationsByTrip).mockResolvedValue([locationWithCategory]);

      renderLocationManager();

      // Wait for location to render
      await waitFor(() => {
        expect(screen.getByText("Test With Category")).toBeInTheDocument();
      });

      // Check for category badge - use custom text matcher to handle text nodes split by emoji
      await waitFor(() => {
        const badge = screen.getByText((_content, element) => {
          return element?.tagName.toLowerCase() === "span" &&
                 element?.textContent?.includes("Restaurant") === true;
        });
        expect(badge).toBeInTheDocument();
      });
    });

    it("should show category icon in badge when available", async () => {
      const categoryWithIcon = { ...mockLocationCategories[0], icon: "🏛️" };
      const locationWithCategory = createMockLocation({
        id: 1,
        name: "Test Location",
        categoryId: categoryWithIcon.id,
        category: categoryWithIcon,
      });

      vi.mocked(locationService.getLocationsByTrip).mockResolvedValue([locationWithCategory]);

      renderLocationManager();

      await waitFor(() => {
        expect(screen.getByText("Test Location")).toBeInTheDocument();
      });

      // The icon and name may be in separate text nodes, so check the container
      await waitFor(() => {
        const badgeElements = screen.getAllByText(new RegExp(categoryWithIcon.name));
        expect(badgeElements.length).toBeGreaterThan(0);
      });
    });
  });

  // ==========================================================================
  // Additional Edge Cases
  // ==========================================================================
  describe("Edge Cases", () => {
    it("should display empty state when no locations exist", async () => {
      vi.mocked(locationService.getLocationsByTrip).mockResolvedValue([]);

      renderLocationManager();

      await waitFor(() => {
        expect(screen.getByText(/pin your destinations/i)).toBeInTheDocument();
      });
    });

    it("should display loading state while fetching locations", async () => {
      // Create a promise that we can control
      let resolveLocations: (value: Location[]) => void;
      const locationsPromise = new Promise<Location[]>((resolve) => {
        resolveLocations = resolve;
      });

      vi.mocked(locationService.getLocationsByTrip).mockReturnValue(locationsPromise);

      renderLocationManager();

      // Initially should be loading
      expect(document.querySelector('[class*="animate-pulse"]')).toBeInTheDocument();

      // Resolve the promise
      resolveLocations!([]);

      await waitFor(() => {
        expect(screen.getByText(/pin your destinations/i)).toBeInTheDocument();
      });
    });

    it("should display parent-child location hierarchy", async () => {
      const parentLoc = createMockLocation({
        id: 1,
        name: "Paris",
        parentId: null,
      });
      const childLoc = createMockLocation({
        id: 2,
        name: "Eiffel Tower",
        parentId: 1,
      });

      vi.mocked(locationService.getLocationsByTrip).mockResolvedValue([parentLoc, childLoc]);

      renderLocationManager();

      await waitFor(() => {
        expect(screen.getByText("Paris")).toBeInTheDocument();
        expect(screen.getByText("Eiffel Tower")).toBeInTheDocument();
      });
    });

    it("should show number of child locations on parent", async () => {
      const parentLoc = createMockLocation({
        id: 1,
        name: "Paris",
        parentId: null,
      });
      const childLoc1 = createMockLocation({
        id: 2,
        name: "Eiffel Tower",
        parentId: 1,
      });
      const childLoc2 = createMockLocation({
        id: 3,
        name: "Louvre Museum",
        parentId: 1,
      });

      vi.mocked(locationService.getLocationsByTrip).mockResolvedValue([parentLoc, childLoc1, childLoc2]);

      renderLocationManager();

      await waitFor(() => {
        expect(screen.getByText("Paris")).toBeInTheDocument();
      });

      // Should show child count badge
      expect(screen.getByText(/2 places/i)).toBeInTheDocument();
    });

    it("should display trip locations map when locations exist", async () => {
      vi.mocked(locationService.getLocationsByTrip).mockResolvedValue([mockLocation]);

      renderLocationManager();

      await waitFor(() => {
        expect(screen.getByText(mockLocation.name)).toBeInTheDocument();
      });

      expect(screen.getByTestId("mock-trip-locations-map")).toBeInTheDocument();
    });

    it("should not display map when no locations exist", async () => {
      vi.mocked(locationService.getLocationsByTrip).mockResolvedValue([]);

      renderLocationManager();

      await waitFor(() => {
        expect(screen.getByText(/pin your destinations/i)).toBeInTheDocument();
      });

      expect(screen.queryByTestId("mock-trip-locations-map")).not.toBeInTheDocument();
    });

    it("should call onUpdate callback after CRUD operations", async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      const newLocation = createMockLocation({ name: "Test" });

      vi.mocked(locationService.createLocation).mockResolvedValue(newLocation);
      vi.mocked(locationService.getLocationsByTrip)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([newLocation]);

      renderLocationManager({ onUpdate });

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /add location/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /add location/i }));

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/^name/i);
      fireEvent.change(nameInput, { target: { value: "Test" } });

      await user.click(screen.getByRole("button", { name: /^add location$/i }));

      await waitFor(() => {
        expect(onUpdate).toHaveBeenCalled();
      });
    });

    it("should allow setting parent location for hierarchical organization", async () => {
      const user = userEvent.setup();
      const parentLoc = createMockLocation({
        id: 1,
        name: "Paris",
        parentId: null,
      });

      vi.mocked(locationService.getLocationsByTrip).mockResolvedValue([parentLoc]);
      vi.mocked(locationService.createLocation).mockResolvedValue(
        createMockLocation({ id: 2, name: "Eiffel Tower", parentId: 1 })
      );

      renderLocationManager();

      await waitFor(() => {
        expect(screen.getByText("Paris")).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /add location/i }));

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      // Fill in name
      const nameInput = screen.getByLabelText(/^name/i);
      fireEvent.change(nameInput, { target: { value: "Eiffel Tower" } });

      // Select parent
      const parentSelect = screen.getByLabelText(/parent location/i);
      await user.selectOptions(parentSelect, "1");

      // Submit
      await user.click(screen.getByRole("button", { name: /^add location$/i }));

      await waitFor(() => {
        expect(locationService.createLocation).toHaveBeenCalledWith(
          expect.objectContaining({
            tripId,
            name: "Eiffel Tower",
            parentId: 1,
          })
        );
      });
    });
  });
});
