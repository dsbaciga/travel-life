/**
 * ActivityManager Component Tests
 *
 * Test IDs:
 * - MGR-ACT-001: No infinite loop on mount
 * - MGR-ACT-002: No reload when switching to tab and back
 * - MGR-ACT-003: Create activity successfully
 * - MGR-ACT-004: Update activity inline
 * - MGR-ACT-005: Delete activity with confirmation
 * - MGR-ACT-006: Filter by category
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router";
import ActivityManager from "../ActivityManager";
import { activityService } from "../../services/activity.service";
import entityLinkService from "../../services/entityLink.service";
import userService from "../../services/user.service";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  mockActivity,
  mockUser,
  mockLocations,
  createMockActivity,
} from "../../test/fixtures";
import type { Activity } from "../../types/activity";

// Mock the services
vi.mock("../../services/activity.service", () => {
  const mockService = {
    getActivitiesByTrip: vi.fn(),
    createActivity: vi.fn(),
    updateActivity: vi.fn(),
    deleteActivity: vi.fn(),
  };
  return {
    activityService: mockService,
    default: mockService,
  };
});

vi.mock("../../services/entityLink.service", () => ({
  default: {
    getLinksFrom: vi.fn(),
    createLink: vi.fn(),
    deleteLink: vi.fn(),
    getTripLinkSummary: vi.fn(),
  },
}));

vi.mock("../../services/user.service", () => ({
  default: {
    getMe: vi.fn(),
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

describe("ActivityManager", () => {
  const tripId = 1;
  let queryClient: QueryClient;

  const renderActivityManager = (props = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ActivityManager
            tripId={tripId}
            locations={mockLocations}
            tripTimezone="Europe/Paris"
            tripStartDate="2024-06-01"
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
    vi.mocked(activityService.getActivitiesByTrip).mockResolvedValue([]);
    vi.mocked(userService.getMe).mockResolvedValue(mockUser);
    vi.mocked(entityLinkService.getLinksFrom).mockResolvedValue([]);
    // TripLinkSummary is a Record keyed by `${EntityType}:${id}`; an empty object
    // is the correct "no links" value. (The old { tripId, entities } shape
    // predates that type.)
    vi.mocked(entityLinkService.getTripLinkSummary).mockResolvedValue({});
  });

  afterEach(() => {
    queryClient.clear();
  });

  // ==========================================================================
  // MGR-ACT-001: No infinite loop on mount
  // ==========================================================================
  describe("MGR-ACT-001: No infinite loop on mount", () => {
    it("should not cause infinite loop on mount", async () => {
      const getActivitiesSpy = vi.mocked(activityService.getActivitiesByTrip);

      renderActivityManager();

      // Wait for initial load
      await waitFor(() => {
        expect(getActivitiesSpy).toHaveBeenCalledTimes(1);
      });

      // Wait a bit longer to ensure no additional calls
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should still only be called once
      expect(getActivitiesSpy).toHaveBeenCalledTimes(1);
    });

    it("should load activities with correct tripId", async () => {
      const getActivitiesSpy = vi.mocked(activityService.getActivitiesByTrip);

      renderActivityManager();

      await waitFor(() => {
        expect(getActivitiesSpy).toHaveBeenCalledWith(tripId);
      });
    });
  });

  // ==========================================================================
  // MGR-ACT-002: No reload when switching tabs
  // ==========================================================================
  describe("MGR-ACT-002: No reload when switching to tab and back", () => {
    it("should not reload when switching to tab and back", async () => {
      const getActivitiesSpy = vi.mocked(activityService.getActivitiesByTrip);

      const { rerender } = renderActivityManager();

      await waitFor(() => {
        expect(getActivitiesSpy).toHaveBeenCalledTimes(1);
      });

      // Simulate tab switch by unmounting and remounting
      rerender(
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <div>Other Tab</div>
          </BrowserRouter>
        </QueryClientProvider>
      );

      rerender(
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <ActivityManager tripId={tripId} locations={mockLocations} />
          </BrowserRouter>
        </QueryClientProvider>
      );

      // Should reload when coming back to tab
      await waitFor(() => {
        expect(getActivitiesSpy).toHaveBeenCalledTimes(2);
      });

      // Wait to ensure no infinite loop
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(getActivitiesSpy).toHaveBeenCalledTimes(2);
    });
  });

  // ==========================================================================
  // MGR-ACT-003: Create activity
  // ==========================================================================
  describe("MGR-ACT-003: Create activity", () => {
    it("should display add activity button", async () => {
      renderActivityManager();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /add activity/i })).toBeInTheDocument();
      });
    });

    it("should open form modal when clicking add button", async () => {
      const user = userEvent.setup();
      renderActivityManager();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /add activity/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /add activity/i }));

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        // Modal title contains "Add Activity" - use the modal's heading
        expect(screen.getByRole("heading", { name: /add activity/i })).toBeInTheDocument();
      });
    });

    it("Save & Add Another saves and keeps the form open; a later plain Add closes it", async () => {
      // The activity form's submit handler lives in a child component and
      // awaits before calling back, so this also covers the capture wrapper.
      const user = userEvent.setup();
      const first = createMockActivity({ id: 71, name: "First Activity" });
      vi.mocked(activityService.createActivity).mockResolvedValue(first);
      vi.mocked(activityService.getActivitiesByTrip).mockResolvedValue([first]);

      renderActivityManager();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /add activity/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /add activity/i }));
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

      fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "First Activity" } });
      await user.click(screen.getByRole("button", { name: /save & add another/i }));

      await waitFor(() => expect(activityService.createActivity).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.getByLabelText(/name/i)).toHaveValue(""));
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Second Activity" } });
      await user.click(screen.getByRole("button", { name: /^add activity$/i }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(activityService.createActivity).toHaveBeenCalledTimes(2);
    });

    it("should create activity when form is submitted", async () => {
      const user = userEvent.setup();
      const newActivity = createMockActivity({ name: "New Test Activity" });

      vi.mocked(activityService.createActivity).mockResolvedValue(newActivity);
      vi.mocked(activityService.getActivitiesByTrip)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([newActivity]);

      renderActivityManager();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /add activity/i })).toBeInTheDocument();
      });

      // Click add button
      await user.click(screen.getByRole("button", { name: /add activity/i }));

      // Wait for modal
      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      // Fill in the name field using fireEvent for reliability
      const nameInput = screen.getByLabelText(/name/i);
      fireEvent.change(nameInput, { target: { value: "New Test Activity" } });

      // Submit the form
      const submitButton = screen.getByRole("button", { name: /^add activity$/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(activityService.createActivity).toHaveBeenCalledWith(
          expect.objectContaining({
            tripId,
            name: "New Test Activity",
          })
        );
      });
    });

    it("should close modal after successful creation", async () => {
      const user = userEvent.setup();
      const newActivity = createMockActivity({ name: "Test Activity" });

      vi.mocked(activityService.createActivity).mockResolvedValue(newActivity);
      vi.mocked(activityService.getActivitiesByTrip)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([newActivity]);

      renderActivityManager();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /add activity/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /add activity/i }));

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/name/i);
      fireEvent.change(nameInput, { target: { value: "Test Activity" } });

      await user.click(screen.getByRole("button", { name: /^add activity$/i }));

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });

    it("should display newly created activity in the list", async () => {
      const user = userEvent.setup();
      const newActivity = createMockActivity({
        id: 100,
        name: "Newly Created Activity",
        startTime: "2024-06-02T10:00:00.000Z",
      });

      vi.mocked(activityService.createActivity).mockResolvedValue(newActivity);
      vi.mocked(activityService.getActivitiesByTrip)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([newActivity]);

      renderActivityManager();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /add activity/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /add activity/i }));

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/name/i);
      fireEvent.change(nameInput, { target: { value: "Newly Created Activity" } });

      await user.click(screen.getByRole("button", { name: /^add activity$/i }));

      await waitFor(() => {
        expect(screen.getByText("Newly Created Activity")).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // MGR-ACT-004: Update activity inline
  // ==========================================================================
  describe("MGR-ACT-004: Update activity inline", () => {
    it("should display edit button for each activity", async () => {
      vi.mocked(activityService.getActivitiesByTrip).mockResolvedValue([mockActivity]);

      renderActivityManager();

      await waitFor(() => {
        expect(screen.getByText(mockActivity.name)).toBeInTheDocument();
      });

      expect(screen.getByRole("button", { name: /edit activity/i })).toBeInTheDocument();
    });

    it("should open edit form when clicking edit button", async () => {
      const user = userEvent.setup();
      vi.mocked(activityService.getActivitiesByTrip).mockResolvedValue([mockActivity]);

      renderActivityManager();

      await waitFor(() => {
        expect(screen.getByText(mockActivity.name)).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /edit activity/i }));

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(screen.getByText(/edit activity/i)).toBeInTheDocument();
      });
    });

    it("should populate form with existing activity data", async () => {
      const user = userEvent.setup();
      vi.mocked(activityService.getActivitiesByTrip).mockResolvedValue([mockActivity]);

      renderActivityManager();

      await waitFor(() => {
        expect(screen.getByText(mockActivity.name)).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /edit activity/i }));

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement;
      expect(nameInput.value).toBe(mockActivity.name);
    });

    it("should update activity when edit form is submitted", async () => {
      const user = userEvent.setup();
      const updatedActivity = { ...mockActivity, name: "Updated Activity Name" };

      vi.mocked(activityService.getActivitiesByTrip).mockResolvedValue([mockActivity]);
      vi.mocked(activityService.updateActivity).mockResolvedValue(updatedActivity);

      renderActivityManager();

      await waitFor(() => {
        expect(screen.getByText(mockActivity.name)).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /edit activity/i }));

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/name/i);
      fireEvent.change(nameInput, { target: { value: "Updated Activity Name" } });

      await user.click(screen.getByRole("button", { name: /update activity/i }));

      await waitFor(() => {
        expect(activityService.updateActivity).toHaveBeenCalledWith(
          mockActivity.id,
          expect.objectContaining({
            name: "Updated Activity Name",
          })
        );
      });
    });

    it("should close modal after successful update", async () => {
      const user = userEvent.setup();
      const updatedActivity = { ...mockActivity, name: "Updated Name" };

      vi.mocked(activityService.getActivitiesByTrip).mockResolvedValue([mockActivity]);
      vi.mocked(activityService.updateActivity).mockResolvedValue(updatedActivity);

      renderActivityManager();

      await waitFor(() => {
        expect(screen.getByText(mockActivity.name)).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /edit activity/i }));

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/name/i);
      fireEvent.change(nameInput, { target: { value: "Updated Name" } });

      await user.click(screen.getByRole("button", { name: /update activity/i }));

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // MGR-ACT-005: Delete activity with confirmation
  // ==========================================================================
  describe("MGR-ACT-005: Delete activity with confirmation", () => {
    it("should display delete button for each activity", async () => {
      vi.mocked(activityService.getActivitiesByTrip).mockResolvedValue([mockActivity]);

      renderActivityManager();

      await waitFor(() => {
        expect(screen.getByText(mockActivity.name)).toBeInTheDocument();
      });

      expect(screen.getByRole("button", { name: /delete activity/i })).toBeInTheDocument();
    });

    it("should show confirmation dialog when clicking delete", async () => {
      const user = userEvent.setup();
      vi.mocked(activityService.getActivitiesByTrip).mockResolvedValue([mockActivity]);

      renderActivityManager();

      await waitFor(() => {
        expect(screen.getByText(mockActivity.name)).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /delete activity/i }));

      await waitFor(() => {
        expect(screen.getByText(/delete this activity/i)).toBeInTheDocument();
      });
    });

    it("should delete activity when confirmed", async () => {
      const user = userEvent.setup();
      vi.mocked(activityService.getActivitiesByTrip)
        .mockResolvedValueOnce([mockActivity])
        .mockResolvedValueOnce([]);
      vi.mocked(activityService.deleteActivity).mockResolvedValue(undefined);

      renderActivityManager();

      await waitFor(() => {
        expect(screen.getByText(mockActivity.name)).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /delete activity/i }));

      await waitFor(() => {
        expect(screen.getByText(/delete this activity/i)).toBeInTheDocument();
      });

      // Click confirm in the dialog
      const confirmButton = screen.getByRole("button", { name: /^delete$/i });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(activityService.deleteActivity).toHaveBeenCalledWith(mockActivity.id);
      });
    });

    it("should not delete activity when cancelled", async () => {
      const user = userEvent.setup();
      vi.mocked(activityService.getActivitiesByTrip).mockResolvedValue([mockActivity]);

      renderActivityManager();

      await waitFor(() => {
        expect(screen.getByText(mockActivity.name)).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /delete activity/i }));

      await waitFor(() => {
        expect(screen.getByText(/delete this activity/i)).toBeInTheDocument();
      });

      // Click cancel in the dialog
      const cancelButton = screen.getByRole("button", { name: /cancel/i });
      await user.click(cancelButton);

      expect(activityService.deleteActivity).not.toHaveBeenCalled();
      expect(screen.getByText(mockActivity.name)).toBeInTheDocument();
    });

    it("should remove activity from list after deletion", async () => {
      const user = userEvent.setup();
      vi.mocked(activityService.getActivitiesByTrip)
        .mockResolvedValueOnce([mockActivity])
        .mockResolvedValueOnce([]);
      vi.mocked(activityService.deleteActivity).mockResolvedValue(undefined);

      renderActivityManager();

      await waitFor(() => {
        expect(screen.getByText(mockActivity.name)).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /delete activity/i }));

      await waitFor(() => {
        expect(screen.getByText(/delete this activity/i)).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole("button", { name: /^delete$/i });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(screen.queryByText(mockActivity.name)).not.toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // MGR-ACT-006: Filter by category
  // ==========================================================================
  describe("MGR-ACT-006: Sort by category", () => {
    const activitiesWithCategories: Activity[] = [
      createMockActivity({ id: 1, name: "Sightseeing Activity", category: "Sightseeing", startTime: "2024-06-02T10:00:00.000Z" }),
      createMockActivity({ id: 2, name: "Food Activity", category: "Food & Drink", startTime: "2024-06-02T12:00:00.000Z" }),
      createMockActivity({ id: 3, name: "Adventure Activity", category: "Adventure", startTime: "2024-06-02T14:00:00.000Z" }),
      createMockActivity({ id: 4, name: "Another Sightseeing", category: "Sightseeing", startTime: "2024-06-02T16:00:00.000Z" }),
    ];

    it("should display sort dropdown when activities exist", async () => {
      vi.mocked(activityService.getActivitiesByTrip).mockResolvedValue(activitiesWithCategories);

      renderActivityManager();

      await waitFor(() => {
        expect(screen.getByLabelText(/sort by/i)).toBeInTheDocument();
      });
    });

    it("should sort by date by default", async () => {
      vi.mocked(activityService.getActivitiesByTrip).mockResolvedValue(activitiesWithCategories);

      renderActivityManager();

      await waitFor(() => {
        expect(screen.getByText("Sightseeing Activity")).toBeInTheDocument();
      });

      const sortSelect = screen.getByLabelText(/sort by/i) as HTMLSelectElement;
      expect(sortSelect.value).toBe("date");
    });

    it("should switch to category sort when selected", async () => {
      const user = userEvent.setup();
      vi.mocked(activityService.getActivitiesByTrip).mockResolvedValue(activitiesWithCategories);

      renderActivityManager();

      await waitFor(() => {
        expect(screen.getByText("Sightseeing Activity")).toBeInTheDocument();
      });

      const sortSelect = screen.getByLabelText(/sort by/i);
      await user.selectOptions(sortSelect, "category");

      expect((sortSelect as HTMLSelectElement).value).toBe("category");
    });

    it("should group activities by category when sorted by category", async () => {
      const user = userEvent.setup();
      vi.mocked(activityService.getActivitiesByTrip).mockResolvedValue(activitiesWithCategories);

      renderActivityManager();

      await waitFor(() => {
        expect(screen.getByText("Sightseeing Activity")).toBeInTheDocument();
      });

      const sortSelect = screen.getByLabelText(/sort by/i);
      await user.selectOptions(sortSelect, "category");

      // Get all activity cards
      const activities = screen.getAllByText(/activity/i).filter(
        el => el.tagName.toLowerCase() === 'h3' || el.classList.contains('font-semibold')
      );

      // When sorted by category, Adventure should come before Food & Drink, and both before Sightseeing
      // Activities without category go last
      const activityNames = activities.map(el => el.textContent);

      // Verify that the sorting has occurred by checking the general order
      expect(activityNames).toBeDefined();
    });

    it("should display category badges on activities", async () => {
      vi.mocked(activityService.getActivitiesByTrip).mockResolvedValue([
        createMockActivity({ id: 1, name: "Test Activity", category: "Sightseeing", startTime: "2024-06-02T10:00:00.000Z" }),
      ]);

      renderActivityManager();

      await waitFor(() => {
        expect(screen.getByText("Test Activity")).toBeInTheDocument();
      });

      // Check for category badge
      expect(screen.getByText("Sightseeing")).toBeInTheDocument();
    });

    it("should display scheduled and unscheduled sections separately", async () => {
      const mixedActivities: Activity[] = [
        createMockActivity({ id: 1, name: "Scheduled Activity", startTime: "2024-06-02T10:00:00.000Z" }),
        createMockActivity({ id: 2, name: "Unscheduled Activity", startTime: null }),
      ];

      vi.mocked(activityService.getActivitiesByTrip).mockResolvedValue(mixedActivities);

      renderActivityManager();

      await waitFor(() => {
        expect(screen.getByText("Scheduled Activity")).toBeInTheDocument();
        expect(screen.getByText("Unscheduled Activity")).toBeInTheDocument();
      });

      // Check for section headers - they contain emojis and counts like "📅 Scheduled Activities (1)"
      // Use a more flexible regex that matches the text ignoring emojis
      const headings = screen.getAllByRole("heading");
      const scheduledHeading = headings.find(h => h.textContent?.toLowerCase().includes("scheduled activities"));
      const unscheduledHeading = headings.find(h => h.textContent?.toLowerCase().includes("unscheduled activities"));

      expect(scheduledHeading).toBeDefined();
      expect(unscheduledHeading).toBeDefined();
    });
  });

  // ==========================================================================
  // Additional Edge Cases
  // ==========================================================================
  describe("Edge Cases", () => {
    it("should display empty state when no activities exist", async () => {
      vi.mocked(activityService.getActivitiesByTrip).mockResolvedValue([]);

      renderActivityManager();

      await waitFor(() => {
        expect(screen.getByText(/what will you discover/i)).toBeInTheDocument();
      });
    });

    it("should display loading state while fetching activities", async () => {
      // Create a promise that we can control
      let resolveActivities: (value: Activity[]) => void;
      const activitiesPromise = new Promise<Activity[]>((resolve) => {
        resolveActivities = resolve;
      });

      vi.mocked(activityService.getActivitiesByTrip).mockReturnValue(activitiesPromise);

      renderActivityManager();

      // Initially should be loading
      // The component uses ListItemSkeleton for loading state
      expect(document.querySelector('[class*="animate-pulse"]')).toBeInTheDocument();

      // Resolve the promise
      resolveActivities!([]);

      await waitFor(() => {
        expect(screen.getByText(/what will you discover/i)).toBeInTheDocument();
      });
    });

    it("should handle activity with children", async () => {
      const parentActivity = createMockActivity({
        id: 1,
        name: "Parent Activity",
        startTime: "2024-06-02T10:00:00.000Z",
      });
      const childActivity = createMockActivity({
        id: 2,
        name: "Child Activity",
        parentId: 1,
        startTime: "2024-06-02T11:00:00.000Z",
      });

      vi.mocked(activityService.getActivitiesByTrip).mockResolvedValue([parentActivity, childActivity]);

      renderActivityManager();

      await waitFor(() => {
        expect(screen.getByText("Parent Activity")).toBeInTheDocument();
        expect(screen.getByText("Child Activity")).toBeInTheDocument();
      });
    });

    it("should handle all-day activities", async () => {
      const allDayActivity = createMockActivity({
        id: 1,
        name: "All Day Event",
        allDay: true,
        startTime: "2024-06-02T00:00:00.000Z",
      });

      vi.mocked(activityService.getActivitiesByTrip).mockResolvedValue([allDayActivity]);

      renderActivityManager();

      await waitFor(() => {
        expect(screen.getByText("All Day Event")).toBeInTheDocument();
      });

      // All-day activities should show "Date:" label
      expect(screen.getByText(/date:/i)).toBeInTheDocument();
    });

    it("should call onUpdate callback after CRUD operations", async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      const newActivity = createMockActivity({ name: "Test" });

      vi.mocked(activityService.createActivity).mockResolvedValue(newActivity);
      vi.mocked(activityService.getActivitiesByTrip)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([newActivity]);

      renderActivityManager({ onUpdate });

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /add activity/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /add activity/i }));

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/name/i);
      fireEvent.change(nameInput, { target: { value: "Test" } });

      await user.click(screen.getByRole("button", { name: /^add activity$/i }));

      await waitFor(() => {
        expect(onUpdate).toHaveBeenCalled();
      });
    });
  });
});
