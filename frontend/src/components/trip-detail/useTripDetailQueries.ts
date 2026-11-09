import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import tripService from "../../services/trip.service";
import locationService from "../../services/location.service";
import photoService from "../../services/photo.service";
import activityService from "../../services/activity.service";
import transportationService from "../../services/transportation.service";
import lodgingService from "../../services/lodging.service";
import savedLinkService from "../../services/savedLink.service";
import customItemService from "../../services/customItem.service";
import journalService from "../../services/journalEntry.service";
import tagService from "../../services/tag.service";
import companionService from "../../services/companion.service";
import checklistService from "../../services/checklist.service";
import expenseService from "../../services/expense.service";

/**
 * Shared TanStack Query hooks and derived counts for TripDetailPage.
 *
 * @param tripId - Numeric trip identifier
 * @returns Trip entities, loading flags, album metadata, and derived counts
 */
export function useTripDetailQueries(tripId: number) {
  const enabled = Boolean(tripId) && !Number.isNaN(tripId);

  const { data: trip, isLoading: isTripLoading } = useQuery({
    queryKey: ["trip", tripId],
    queryFn: () => tripService.getTripById(tripId),
    enabled,
  });

  const { data: locations = [], isLoading: isLocationsLoading } = useQuery({
    queryKey: ["locations", tripId],
    queryFn: () => locationService.getLocationsByTrip(tripId),
    enabled,
  });

  const { data: activitiesData, isLoading: isActivitiesLoading } = useQuery({
    queryKey: ["activities", tripId],
    queryFn: () => activityService.getActivitiesByTrip(tripId),
    enabled,
  });

  const { data: transportationData, isLoading: isTransportationLoading } =
    useQuery({
      queryKey: ["transportation", tripId],
      queryFn: () => transportationService.getTransportationByTrip(tripId),
      enabled,
    });

  const { data: lodgingData, isLoading: isLodgingLoading } = useQuery({
    queryKey: ["lodging", tripId],
    queryFn: () => lodgingService.getLodgingByTrip(tripId),
    enabled,
  });

  const { data: savedLinksData } = useQuery({
    queryKey: ["savedLinks", tripId],
    queryFn: () => savedLinkService.getSavedLinksByTrip(tripId),
    enabled,
  });

  const { data: customItemsData } = useQuery({
    queryKey: ["customItems", tripId],
    queryFn: () => customItemService.getCustomItemsByTrip(tripId),
    enabled,
  });

  const { data: journalData, isLoading: isJournalLoading } = useQuery({
    queryKey: ["journal", tripId],
    queryFn: () => journalService.getJournalEntriesByTrip(tripId),
    enabled,
  });

  const { data: tags = [] } = useQuery({
    queryKey: ["tags", tripId],
    queryFn: () => tagService.getTagsByTrip(tripId),
    enabled,
  });

  const { data: checklists = [] } = useQuery({
    queryKey: ["checklists", tripId],
    queryFn: () => checklistService.getChecklistsByTripId(tripId),
    enabled,
  });

  const { data: companionsData, isLoading: areCompanionsLoading } = useQuery({
    queryKey: ["companions", tripId],
    queryFn: () => companionService.getCompanionsByTrip(tripId),
    enabled,
  });

  const { data: albumsData, isLoading: areAlbumsLoading } = useQuery({
    queryKey: ["albums", tripId],
    queryFn: () => photoService.getAlbumsByTrip(tripId),
    enabled,
  });

  const { data: budgetSummary } = useQuery({
    queryKey: ["budget-summary", tripId],
    queryFn: () => expenseService.getBudgetSummary(tripId),
    enabled,
  });

  // Only surface budget data on the dashboard when there is a budget set or
  // at least some recorded spending — the widget hides otherwise
  const budgetData = useMemo(() => {
    if (!budgetSummary) return null;
    if (budgetSummary.budget === null && budgetSummary.spent <= 0) return null;
    return budgetSummary;
  }, [budgetSummary]);

  const {
    albums = [],
    unsortedCount: unsortedPhotosCount = 0,
    totalCount: totalPhotosCount = 0,
  } = albumsData || {};

  const activitiesCount = useMemo(
    () => activitiesData?.length ?? 0,
    [activitiesData]
  );
  const unscheduledActivitiesCount = useMemo(
    () =>
      activitiesData?.filter((a) => !a.startTime && !a.allDay).length ?? 0,
    [activitiesData]
  );
  const transportationCount = useMemo(
    () => transportationData?.length ?? 0,
    [transportationData]
  );
  const unscheduledTransportationCount = useMemo(
    () => transportationData?.filter((t) => !t.departureTime).length ?? 0,
    [transportationData]
  );
  const lodgingCount = useMemo(() => lodgingData?.length ?? 0, [lodgingData]);
  const savedLinksCount = useMemo(
    () => savedLinksData?.length ?? 0,
    [savedLinksData]
  );
  const customItemsCount = useMemo(
    () => customItemsData?.length ?? 0,
    [customItemsData]
  );
  const unscheduledLodgingCount = useMemo(
    () => lodgingData?.filter((l) => !l.checkInDate).length ?? 0,
    [lodgingData]
  );
  const unscheduledCount = useMemo(
    () =>
      unscheduledActivitiesCount +
      unscheduledTransportationCount +
      unscheduledLodgingCount,
    [
      unscheduledActivitiesCount,
      unscheduledTransportationCount,
      unscheduledLodgingCount,
    ]
  );
  const journalCount = useMemo(() => journalData?.length ?? 0, [journalData]);
  const companionsCount = useMemo(
    () => companionsData?.length ?? 0,
    [companionsData]
  );

  return {
    trip,
    isTripLoading,
    locations,
    isLocationsLoading,
    activitiesData,
    isActivitiesLoading,
    transportationData,
    isTransportationLoading,
    lodgingData,
    isLodgingLoading,
    journalData,
    isJournalLoading,
    tags,
    checklists,
    companionsData,
    areCompanionsLoading,
    albums,
    areAlbumsLoading,
    unsortedPhotosCount,
    totalPhotosCount,
    budgetData,
    activitiesCount,
    transportationCount,
    lodgingCount,
    savedLinksCount,
    customItemsCount,
    unscheduledCount,
    journalCount,
    companionsCount,
  };
}
