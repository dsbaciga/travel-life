import { useState, useEffect, useRef, useCallback, Suspense, lazy } from "react";
import {
  useParams,
  useNavigate,
  useSearchParams,
} from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import photoService from "../services/photo.service";
import userService from "../services/user.service";
import checklistService from "../services/checklist.service";
import TripSeriesNav from "../components/TripSeriesNav";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import type { Photo } from "../types/photo";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorBoundary from "../components/ErrorBoundary";
import FloatingTripHeader from "../components/FloatingTripHeader";
import { usePagedPagination } from "../hooks/usePagedPagination";
import { useScrollToHighlight } from "../hooks/useScrollToHighlight";
import Breadcrumbs from "../components/Breadcrumbs";
import { useScrollStore } from "../store/scrollStore";
import { emergencyCardQueryKey } from "../hooks/useEmergencyCard";
import TabGroup from "../components/TabGroup";
import TripSidebar from "../components/TripSidebar";
import NavigationLayoutToggle from "../components/NavigationLayoutToggle";
import { useNavigationStore } from "../store/navigationStore";
import { Skeleton } from "../components/Skeleton";
import DuplicateTripModal from "../components/trip-detail/DuplicateTripModal";
import ShareTripModal from "../components/trip-detail/ShareTripModal";
import TripHeroHeader from "../components/trip-detail/TripHeroHeader";
import TripPhotosTab from "../components/trip-detail/TripPhotosTab";
import {
  type TabId,
  isTabId,
  useTripTabGroups,
} from "../components/trip-detail/tripDetailTabs";
import { useTripDetailQueries } from "../components/trip-detail/useTripDetailQueries";

// Lazy-loaded heavy tab components (only loaded when their tab is active)
const PhotosMapView = lazy(() => import("../components/PhotosMapView"));
const Timeline = lazy(() => import("../components/Timeline"));
const DailyView = lazy(() => import("../components/daily-view/DailyView"));
const TripMap = lazy(() => import("../components/TripMap"));
const ItineraryDayView = lazy(() => import("../components/agenda/ItineraryDayView"));
const PhotoTimeline = lazy(() => import("../components/PhotoTimeline"));
const ActivityManager = lazy(() => import("../components/ActivityManager"));
const UnscheduledItems = lazy(() => import("../components/UnscheduledItems"));
const TransportationManager = lazy(() => import("../components/TransportationManager"));
const LodgingManager = lazy(() => import("../components/LodgingManager"));
const JournalManager = lazy(() => import("../components/JournalManager"));
const CompanionManager = lazy(() => import("../components/CompanionManager"));
const LocationManager = lazy(() => import("../components/LocationManager"));
const BudgetManager = lazy(() => import("../components/BudgetManager"));
const DeadlinesManager = lazy(() => import("../components/DeadlinesManager"));
const FoodLogManager = lazy(() => import("../components/FoodLogManager"));
const SavedLinksManager = lazy(() => import("../components/SavedLinksManager"));
const CustomItemsManager = lazy(() => import("../components/CustomItemsManager"));
const EmergencyCard = lazy(() => import("../components/EmergencyCard"));
const LocalNormsCard = lazy(() => import("../components/LocalNormsCard"));
const TagsModal = lazy(() => import("../components/TagsModal"));
const TripDashboard = lazy(() => import("../components/trip-dashboard/TripDashboard"));

export default function TripDetailPage() {
  const { id } = useParams();
  const tripId = parseInt(id ?? "");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const [searchParams, setSearchParams] = useSearchParams();
  const { clearPosition: clearTripsPageState } = useScrollStore();

  const [userTimezone, setUserTimezone] = useState<string>("");

  // Album and photo view state
  const [selectedAlbumId, setSelectedAlbumId] = useState<number | null>(null);
  const [filteredPhotos, setFilteredPhotos] = useState<Photo[]>([]);

  // Initialize activeTab from URL parameter or default to 'dashboard'
  const tabParam = searchParams.get("tab");
  const initialTab: TabId = isTabId(tabParam) ? tabParam : "dashboard";
  // `?edit=<id>` deep link, written by the timeline/daily-view Edit buttons.
  const editParam = searchParams.get("edit");
  const editItemId =
    editParam != null && /^\d+$/.test(editParam) ? Number(editParam) : null;
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  // Day the Day Plan view should open on, set when arriving from the Overview.
  const [itineraryDay, setItineraryDay] = useState<string | null>(null);

  // Sync activeTab with URL when tab parameter changes externally (e.g., from EntityDetailModal navigation)
  useEffect(() => {
    const urlTab = searchParams.get("tab");
    if (isTabId(urlTab) && urlTab !== activeTab) {
      setActiveTab(urlTab);
    }
  }, [searchParams, activeTab]);

  // Redirect to trips list if the URL param is not a valid numeric ID
  useEffect(() => {
    if (isNaN(tripId)) navigate("/trips", { replace: true });
  }, [tripId, navigate]);

  // Enable scroll-to-highlight for entity link navigation
  useScrollToHighlight({ scrollDelay: 300 });

  // Navigation layout preference (tabs vs sidebar)
  const { layout: navigationLayout } = useNavigationStore();

  const [showTagsModal, setShowTagsModal] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  const {
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
  } = useTripDetailQueries(tripId);

  // Photo sorting state
  const sortByRef = useRef<string>("date");
  const sortOrderRef = useRef<string>("desc");

  // Ref for floating header observation
  const tripHeaderRef = useRef<HTMLDivElement>(null);

  // Pagination hooks - using paged pagination for memory efficiency
  const photosPagination = usePagedPagination<Photo>(
    async (skip, take) => {
      if (!trip) return { items: [], total: 0, hasMore: false };
      const result = await photoService.getPhotosByTrip(trip.id, {
        skip,
        take,
        sortBy: sortByRef.current,
        sortOrder: sortOrderRef.current,
      });
      return {
        items: result.photos,
        total: result.total || 0,
        hasMore: result.hasMore,
      };
    },
    { pageSize: 40 }
  );

  const unsortedPagination = usePagedPagination<Photo>(
    async (skip, take) => {
      if (!trip) return { items: [], total: 0, hasMore: false };
      const result = await photoService.getUnsortedPhotosByTrip(trip.id, {
        skip,
        take,
        sortBy: sortByRef.current,
        sortOrder: sortOrderRef.current,
      });
      return {
        items: result.photos,
        total: result.total || 0,
        hasMore: result.hasMore,
      };
    },
    { pageSize: 40 }
  );

  const albumPhotosPagination = usePagedPagination<Photo>(
    async (skip, take) => {
      if (!selectedAlbumId || selectedAlbumId <= 0)
        return { items: [], total: 0, hasMore: false };
      const result = await photoService.getAlbumById(selectedAlbumId, {
        skip,
        take,
        sortBy: sortByRef.current,
        sortOrder: sortOrderRef.current,
      });
      const albumPhotos = result.photos.map((p) => p.photo);
      return {
        items: albumPhotos,
        total: result.total || 0,
        hasMore: result.hasMore || false,
      };
    },
    { pageSize: 40 }
  );

  // State for existing Immich asset IDs to exclude from Immich browser
  const [existingImmichAssetIds, setExistingImmichAssetIds] = useState<
    Set<string>
  >(new Set());

  const loadImmichAssetIds = useCallback(async (targetTripId: number) => {
    try {
      const assetIds = await photoService.getImmichAssetIdsByTrip(targetTripId);
      setExistingImmichAssetIds(new Set(assetIds));
    } catch (error) {
      console.error("Failed to load Immich asset IDs:", error);
    }
  }, []);

  // Handle photo sort change
  const handlePhotoSortChange = (sortBy: string, sortOrder: string) => {
    sortByRef.current = sortBy;
    sortOrderRef.current = sortOrder;

    if (selectedAlbumId === null) {
      photosPagination.clear();
      photosPagination.loadInitial();
    } else if (selectedAlbumId === -1) {
      unsortedPagination.clear();
      unsortedPagination.loadInitial();
    } else if (selectedAlbumId > 0) {
      albumPhotosPagination.clear();
      albumPhotosPagination.loadInitial();
    }
  };

  useEffect(() => {
    let cancelled = false;
    userService
      .getMe()
      .then((user) => {
        if (!cancelled) setUserTimezone(user.timezone || "");
      })
      .catch(() => {
        if (!cancelled) console.error("Failed to load user timezone");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Only load Immich asset IDs when the user visits the Photos tab
  useEffect(() => {
    let cancelled = false;
    if (tripId && !isNaN(tripId) && activeTab === "photos") {
      photoService
        .getImmichAssetIdsByTrip(tripId)
        .then((assetIds) => {
          if (!cancelled) setExistingImmichAssetIds(new Set(assetIds));
        })
        .catch((error) => {
          if (!cancelled)
            console.error("Failed to load Immich asset IDs:", error);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [tripId, activeTab]);

  // Function to change tabs and update URL
  const changeTab = useCallback(
    (tab: TabId) => {
      setActiveTab(tab);
      setSearchParams({ tab });
    },
    [setSearchParams]
  );

  const tabGroups = useTripTabGroups({
    activitiesCount,
    transportationCount,
    lodgingCount,
    savedLinksCount,
    customItemsCount,
    unscheduledCount,
    totalPhotosCount,
    journalCount,
    locationsCount: locations.length,
    companionsCount,
  });

  // Only load paginated photos when on a tab that displays them (dashboard or photos)
  const shouldLoadPhotos =
    Boolean(trip?.id) && (activeTab === "dashboard" || activeTab === "photos");

  useEffect(() => {
    if (!trip || !shouldLoadPhotos) return;

    // Clear filtered photos IMMEDIATELY to prevent thumbnail loading race condition
    setFilteredPhotos([]);

    // Clear non-active pagination states when switching views
    if (selectedAlbumId === null) {
      unsortedPagination.clear();
      albumPhotosPagination.clear();
      photosPagination.loadInitial();
    } else if (selectedAlbumId === -1) {
      photosPagination.clear();
      albumPhotosPagination.clear();
      unsortedPagination.loadInitial();
    } else if (selectedAlbumId > 0) {
      photosPagination.clear();
      unsortedPagination.clear();
      albumPhotosPagination.loadInitial();
    }
    // The three pagination objects are intentionally omitted because their
    // loadFunction is an inline arrow and loadPage depends on currentPage, so
    // loadInitial gets a new identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldLoadPhotos, selectedAlbumId, trip?.id]);

  // Update filtered photos based on selected album
  useEffect(() => {
    if (selectedAlbumId === null) {
      setFilteredPhotos(photosPagination.items);
    } else if (selectedAlbumId === -1) {
      setFilteredPhotos(unsortedPagination.items);
    } else {
      setFilteredPhotos(albumPhotosPagination.items);
    }
  }, [
    selectedAlbumId,
    photosPagination.items,
    unsortedPagination.items,
    albumPhotosPagination.items,
  ]);

  const handleToggleChecklistItem = async (
    _checklistId: number,
    itemId: number,
    completed: boolean
  ) => {
    try {
      await checklistService.updateChecklistItem(itemId, {
        isChecked: completed,
      });
      queryClient.invalidateQueries({ queryKey: ["checklists", tripId] });
    } catch (error) {
      console.error("Failed to update checklist item:", error);
      toast.error("Failed to update checklist item");
    }
  };

  const handleNavigateToEntity = (entityType: string, entityId: string) => {
    const tabMap: Record<string, TabId> = {
      activity: "activities",
      transportation: "transportation",
      lodging: "lodging",
      location: "locations",
      photo: "photos",
      journal: "journal",
    };
    const targetTab = tabMap[entityType];
    if (targetTab) {
      changeTab(targetTab);
      // Wait for tab change then scroll to entity
      setTimeout(() => {
        const element = document.querySelector(
          `[data-entity-id="${entityType}-${entityId}"]`
        );
        if (element) {
          const prefersReducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)"
          ).matches;
          element.scrollIntoView({
            behavior: prefersReducedMotion ? "auto" : "smooth",
            block: "center",
          });
          element.classList.add("scroll-highlight");
          setTimeout(() => element.classList.remove("scroll-highlight"), 2000);
        }
      }, 100);
    }
  };

  if (isTripLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream dark:bg-navy-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-dusk-400">
            Loading trip...
          </p>
        </div>
      </div>
    );
  }

  if (!trip) {
    return <div className="text-gray-900 dark:text-white">Trip not found</div>;
  }

  return (
    <div className="bg-cream dark:bg-navy-900 min-h-screen">
      {/* Floating Trip Header - appears when main header scrolls out */}
      <FloatingTripHeader trip={trip} observeRef={tripHeaderRef} />

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-8">
        <Breadcrumbs
          items={[
            {
              label: "Trips",
              href: "/trips",
              onClick: () => clearTripsPageState("trips-page"),
            },
            { label: trip.title },
          ]}
        />

        {/* Trip Header */}
        <TripHeroHeader
          trip={trip}
          tags={tags}
          checklists={checklists}
          userTimezone={userTimezone}
          headerRef={tripHeaderRef}
          onManageTags={() => setShowTagsModal(true)}
          onShare={() => setShowShareModal(true)}
          onDuplicate={() => setShowDuplicateDialog(true)}
        />

        {/* Trip Series Navigation */}
        {trip.series && (
          <TripSeriesNav
            tripId={trip.id}
            seriesId={trip.series.id}
            seriesName={trip.series.name}
          />
        )}

        {/* Navigation Layout Toggle - Desktop only */}
        <div className="hidden md:flex justify-end mb-2">
          <NavigationLayoutToggle />
        </div>

        {/* Sidebar Layout Container - Desktop only when sidebar mode enabled */}
        <div
          className={
            navigationLayout === "sidebar" ? "hidden md:flex md:gap-6" : ""
          }
        >
          {/* Sidebar Navigation - Desktop only when sidebar layout selected */}
          {navigationLayout === "sidebar" && (
            <TripSidebar
              tabs={tabGroups}
              activeTab={activeTab}
              onTabChange={(tabId) => {
                if (isTabId(tabId)) changeTab(tabId);
              }}
              className="sticky top-32 h-[calc(100vh-8rem)] rounded-lg shadow flex-shrink-0"
            />
          )}

          {/* Main Content Column */}
          <div
            className={
              navigationLayout === "sidebar" ? "flex-1 min-w-0" : ""
            }
          >
            {/* Tab Navigation - Mobile always, Desktop only when tabs layout selected */}
            <TabGroup
              tabs={tabGroups}
              activeTab={activeTab}
              onTabChange={(tabId) => {
                if (isTabId(tabId)) changeTab(tabId);
              }}
              className={`mb-6 sticky top-28 sm:top-32 bg-cream dark:bg-navy-900 z-20 ${
                navigationLayout === "sidebar" ? "md:hidden" : ""
              }`}
            />

            {/* Tab Content with smooth transitions */}
            <div className="transition-opacity duration-300 ease-in-out">
              {/* Dashboard Tab */}
              {activeTab === "dashboard" && (
                <div className="animate-fadeIn">
                  <ErrorBoundary>
                    <Suspense
                      fallback={
                        <LoadingSpinner.FullPage message="Loading dashboard..." />
                      }
                    >
                      <TripDashboard
                        trip={trip}
                        activities={activitiesData || []}
                        transportation={transportationData || []}
                        lodging={lodgingData || []}
                        locations={locations}
                        journalEntries={journalData || []}
                        photos={photosPagination.items}
                        photosCount={totalPhotosCount}
                        checklists={checklists}
                        companions={companionsData || []}
                        onNavigateToTab={(tab, options) => {
                          if (tab === "duplicate") {
                            setShowDuplicateDialog(true);
                            return;
                          }
                          if (isTabId(tab)) changeTab(tab);
                          if (tab === "itinerary") {
                            setItineraryDay(options?.scrollToDate ?? null);
                          }
                          if (options?.action === "add") {
                            // Handle specific actions if needed
                          }
                        }}
                        onToggleChecklistItem={handleToggleChecklistItem}
                        onNavigateToEntity={handleNavigateToEntity}
                        budgetData={budgetData}
                      />
                    </Suspense>
                  </ErrorBoundary>
                </div>
              )}

              {/* Day Plan Tab: one day as a numbered list beside a map */}
              {activeTab === "itinerary" && (
                <div className="bg-white dark:bg-navy-800 rounded-2xl shadow-lg border border-primary-100 dark:border-navy-700 p-4 sm:p-6 animate-fadeIn">
                  <ErrorBoundary>
                    <Suspense
                      fallback={
                        <LoadingSpinner.FullPage message="Loading day plan..." />
                      }
                    >
                      <ItineraryDayView
                        tripId={tripId}
                        tripStartDate={trip.startDate}
                        tripEndDate={trip.endDate}
                        tripTimezone={trip.timezone}
                        activities={activitiesData || []}
                        transportation={transportationData || []}
                        lodging={lodgingData || []}
                        locations={locations}
                        initialDay={itineraryDay}
                        onOpenTab={changeTab}
                        onEditItem={(tab, itemId) => {
                          // Same deep link the Timeline and Day By Day edit buttons write.
                          setActiveTab(tab);
                          setSearchParams({ tab, edit: String(itemId) });
                        }}
                      />
                    </Suspense>
                  </ErrorBoundary>
                </div>
              )}

              {/* Timeline Tab */}
              {activeTab === "timeline" && (
                <div className="space-y-6 animate-fadeIn">
                  <div className="bg-white dark:bg-navy-800 rounded-2xl shadow-lg border border-primary-100 dark:border-gold/20 p-6">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                      Timeline
                    </h2>
                    <ErrorBoundary>
                      <Suspense
                        fallback={
                          <LoadingSpinner.FullPage message="Loading timeline..." />
                        }
                      >
                        <Timeline
                          tripId={tripId}
                          tripTitle={trip.title}
                          tripTimezone={trip.timezone || undefined}
                          userTimezone={userTimezone || undefined}
                          tripStartDate={trip.startDate || undefined}
                          tripEndDate={trip.endDate || undefined}
                          tripStatus={trip.status || undefined}
                          tripType={trip.tripType || undefined}
                          tripTypeEmoji={trip.tripTypeEmoji || undefined}
                          onNavigateToTab={(tab) => {
                            if (isTabId(tab)) changeTab(tab);
                          }}
                          onRefresh={() =>
                            queryClient.invalidateQueries({
                              queryKey: ["trip", tripId],
                            })
                          }
                        />
                      </Suspense>
                    </ErrorBoundary>
                  </div>
                </div>
              )}

              {/* Day By Day Tab */}
              {activeTab === "daily" && (
                <div className="space-y-6 animate-fadeIn">
                  <div className="bg-white dark:bg-navy-800 rounded-2xl shadow-lg border border-primary-100 dark:border-gold/20 p-6">
                    <ErrorBoundary>
                      <Suspense
                        fallback={
                          <LoadingSpinner.FullPage message="Loading daily view..." />
                        }
                      >
                        <DailyView
                          tripId={tripId}
                          tripTitle={trip.title}
                          tripTimezone={trip.timezone || undefined}
                          userTimezone={userTimezone || undefined}
                          tripStartDate={trip.startDate || undefined}
                          tripEndDate={trip.endDate || undefined}
                          onRefresh={() =>
                            queryClient.invalidateQueries({
                              queryKey: ["trip", tripId],
                            })
                          }
                        />
                      </Suspense>
                    </ErrorBoundary>
                  </div>
                </div>
              )}

              {/* Trip Map Tab */}
              {activeTab === "trip-map" && (
                <div className="space-y-6 animate-fadeIn">
                  <div className="bg-white dark:bg-navy-800 rounded-2xl shadow-lg border border-primary-100 dark:border-gold/20 p-6">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                      Trip Map
                    </h2>
                    {isTransportationLoading ? (
                      <Skeleton className="h-96" />
                    ) : (
                      <ErrorBoundary>
                        <Suspense
                          fallback={
                            <LoadingSpinner.FullPage message="Loading map..." />
                          }
                        >
                          <TripMap
                            transportations={transportationData || []}
                            height="600px"
                          />
                        </Suspense>
                      </ErrorBoundary>
                    )}
                  </div>
                </div>
              )}

              {/* Locations Tab */}
              {activeTab === "locations" && (
                <div className="bg-white dark:bg-navy-800 rounded-2xl shadow-lg border border-primary-100 dark:border-gold/20 p-4 sm:p-6 animate-fadeIn">
                  <ErrorBoundary>
                    {isLocationsLoading ? (
                      <Skeleton />
                    ) : (
                      <Suspense
                        fallback={
                          <LoadingSpinner.FullPage message="Loading locations..." />
                        }
                      >
                        <LocationManager
                          tripId={trip.id}
                          tripTimezone={trip.timezone}
                          onUpdate={() =>
                            queryClient.invalidateQueries({
                              queryKey: ["locations", tripId],
                            })
                          }
                        />
                      </Suspense>
                    )}
                  </ErrorBoundary>
                </div>
              )}

              {/* Photos Tab */}
              {activeTab === "photos" && (
                <ErrorBoundary>
                  <Suspense
                    fallback={
                      <LoadingSpinner.FullPage message="Loading photos..." />
                    }
                  >
                    <TripPhotosTab
                      trip={trip}
                      albums={albums}
                      areAlbumsLoading={areAlbumsLoading}
                      totalPhotosCount={totalPhotosCount}
                      unsortedPhotosCount={unsortedPhotosCount}
                      selectedAlbumId={selectedAlbumId}
                      onSelectAlbum={setSelectedAlbumId}
                      filteredPhotos={filteredPhotos}
                      photosPagination={photosPagination}
                      unsortedPagination={unsortedPagination}
                      albumPhotosPagination={albumPhotosPagination}
                      onPhotoSortChange={handlePhotoSortChange}
                      initialSortBy={sortByRef.current}
                      initialSortOrder={sortOrderRef.current}
                      existingImmichAssetIds={existingImmichAssetIds}
                      onRefreshImmichAssetIds={() => loadImmichAssetIds(trip.id)}
                      confirm={confirm}
                    />
                  </Suspense>
                </ErrorBoundary>
              )}

              {/* Photo Map Tab */}
              {activeTab === "photo-map" && (
                <div className="bg-white dark:bg-navy-800 rounded-2xl shadow-lg border border-primary-100 dark:border-gold/20 p-6 animate-fadeIn">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                    Photo Map
                  </h2>
                  <ErrorBoundary>
                    <Suspense
                      fallback={
                        <LoadingSpinner.FullPage message="Loading photo map..." />
                      }
                    >
                      <PhotosMapView
                        tripId={trip.id}
                        fetchAllPhotos
                        onPhotoClick={() => {
                          // TODO: Implement lightbox or photo navigation
                        }}
                      />
                    </Suspense>
                  </ErrorBoundary>
                </div>
              )}

              {/* Photo Timeline Tab */}
              {activeTab === "photo-timeline" && (
                <div className="bg-white dark:bg-navy-800 rounded-2xl shadow-lg border border-primary-100 dark:border-gold/20 p-6 animate-fadeIn">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                    Photo Timeline
                  </h2>
                  <ErrorBoundary>
                    <Suspense
                      fallback={
                        <LoadingSpinner.FullPage message="Loading photo timeline..." />
                      }
                    >
                      <PhotoTimeline
                        tripId={trip.id}
                        tripTimezone={trip.timezone || undefined}
                        tripStartDate={trip.startDate || undefined}
                      />
                    </Suspense>
                  </ErrorBoundary>
                </div>
              )}

              {/* Activities Tab */}
              {activeTab === "activities" && (
                <div className="bg-white dark:bg-navy-800 rounded-2xl shadow-lg border border-primary-100 dark:border-gold/20 p-6 animate-fadeIn">
                  {isActivitiesLoading ? (
                    <Skeleton />
                  ) : (
                    <ErrorBoundary>
                      <Suspense
                        fallback={
                          <LoadingSpinner.FullPage message="Loading activities..." />
                        }
                      >
                        <ActivityManager
                          tripId={trip.id}
                          locations={locations}
                          tripTimezone={trip.timezone}
                          tripStartDate={trip.startDate}
                          onUpdate={() =>
                            queryClient.invalidateQueries({
                              queryKey: ["activities", tripId],
                            })
                          }
                        />
                      </Suspense>
                    </ErrorBoundary>
                  )}
                </div>
              )}

              {/* Unscheduled Tab */}
              {activeTab === "unscheduled" && (
                <div className="bg-white dark:bg-navy-800 rounded-2xl shadow-lg border border-primary-100 dark:border-gold/20 p-6 animate-fadeIn">
                  {isActivitiesLoading ||
                  isTransportationLoading ||
                  isLodgingLoading ? (
                    <Skeleton />
                  ) : (
                    <ErrorBoundary>
                      <Suspense
                        fallback={
                          <LoadingSpinner.FullPage message="Loading unscheduled items..." />
                        }
                      >
                        <UnscheduledItems
                          tripId={trip.id}
                          locations={locations}
                          tripTimezone={trip.timezone}
                          tripStartDate={trip.startDate}
                          onUpdate={() =>
                            queryClient.invalidateQueries({
                              queryKey: ["trip", tripId],
                            })
                          }
                        />
                      </Suspense>
                    </ErrorBoundary>
                  )}
                </div>
              )}

              {/* Transportation Tab */}
              {activeTab === "transportation" && (
                <div className="bg-white dark:bg-navy-800 rounded-2xl shadow-lg border border-primary-100 dark:border-gold/20 p-6 animate-fadeIn">
                  {isTransportationLoading ? (
                    <Skeleton />
                  ) : (
                    <ErrorBoundary>
                      <Suspense
                        fallback={
                          <LoadingSpinner.FullPage message="Loading transportation..." />
                        }
                      >
                        <TransportationManager
                          tripId={trip.id}
                          locations={locations}
                          tripTimezone={trip.timezone}
                          tripStartDate={trip.startDate}
                          onUpdate={() =>
                            queryClient.invalidateQueries({
                              queryKey: ["transportation", tripId],
                            })
                          }
                        />
                      </Suspense>
                    </ErrorBoundary>
                  )}
                </div>
              )}

              {/* Lodging Tab */}
              {activeTab === "lodging" && (
                <div className="bg-white dark:bg-navy-800 rounded-2xl shadow-lg border border-primary-100 dark:border-gold/20 p-6 animate-fadeIn">
                  {isLodgingLoading ? (
                    <Skeleton />
                  ) : (
                    <ErrorBoundary>
                      <Suspense
                        fallback={
                          <LoadingSpinner.FullPage message="Loading lodging..." />
                        }
                      >
                        <LodgingManager
                          tripId={trip.id}
                          locations={locations}
                          tripTimezone={trip.timezone}
                          tripStartDate={trip.startDate}
                          onUpdate={() =>
                            queryClient.invalidateQueries({
                              queryKey: ["lodging", tripId],
                            })
                          }
                        />
                      </Suspense>
                    </ErrorBoundary>
                  )}
                </div>
              )}

              {/* Budget Tab */}
              {activeTab === "budget" && (
                <div className="bg-white dark:bg-navy-800 rounded-2xl shadow-lg border border-primary-100 dark:border-gold/20 p-6 animate-fadeIn">
                  <ErrorBoundary>
                    <Suspense
                      fallback={
                        <LoadingSpinner.FullPage message="Loading budget..." />
                      }
                    >
                      <BudgetManager
                        tripId={trip.id}
                        budget={trip.budget ?? null}
                        budgetCurrency={trip.budgetCurrency ?? null}
                        onUpdate={() => {
                          queryClient.invalidateQueries({
                            queryKey: ["trip", tripId],
                          });
                          queryClient.invalidateQueries({
                            queryKey: ["budget-summary", tripId],
                          });
                        }}
                      />
                    </Suspense>
                  </ErrorBoundary>
                </div>
              )}

              {/* Food Log Tab */}
              {activeTab === "food-log" && (
                <div className="bg-white dark:bg-navy-800 rounded-2xl shadow-lg border border-primary-100 dark:border-gold/20 p-6 animate-fadeIn">
                  <ErrorBoundary>
                    <Suspense
                      fallback={
                        <LoadingSpinner.FullPage message="Loading food log..." />
                      }
                    >
                      <FoodLogManager
                        tripId={trip.id}
                        tripStartDate={trip.startDate || undefined}
                        tripEndDate={trip.endDate || undefined}
                      />
                    </Suspense>
                  </ErrorBoundary>
                </div>
              )}

              {/* Deadlines Tab */}
              {activeTab === "deadlines" && (
                <div className="bg-white dark:bg-navy-800 rounded-2xl shadow-lg border border-primary-100 dark:border-gold/20 p-6 animate-fadeIn">
                  <ErrorBoundary>
                    <Suspense
                      fallback={
                        <LoadingSpinner.FullPage message="Loading deadlines..." />
                      }
                    >
                      <DeadlinesManager
                        tripId={trip.id}
                        tripTimezone={trip.timezone}
                        onUpdate={() => {
                          queryClient.invalidateQueries({
                            queryKey: ["trip", tripId],
                          });
                        }}
                      />
                    </Suspense>
                  </ErrorBoundary>
                </div>
              )}

              {/* Links Tab */}
              {activeTab === "links" && (
                <div className="bg-white dark:bg-navy-800 rounded-2xl shadow-lg border border-primary-100 dark:border-gold/20 p-6 animate-fadeIn">
                  <ErrorBoundary>
                    <Suspense
                      fallback={
                        <LoadingSpinner.FullPage message="Loading links..." />
                      }
                    >
                      <SavedLinksManager
                        tripId={trip.id}
                        onUpdate={() => {
                          queryClient.invalidateQueries({
                            queryKey: ["savedLinks", tripId],
                          });
                        }}
                      />
                    </Suspense>
                  </ErrorBoundary>
                </div>
              )}

              {/* Custom Items Tab */}
              {activeTab === "custom" && (
                <div className="bg-white dark:bg-navy-800 rounded-2xl shadow-lg border border-primary-100 dark:border-gold/20 p-6 animate-fadeIn">
                  <ErrorBoundary>
                    <Suspense
                      fallback={
                        <LoadingSpinner.FullPage message="Loading custom items..." />
                      }
                    >
                      <CustomItemsManager
                        tripId={trip.id}
                        tripTimezone={trip.timezone}
                        editId={editItemId}
                        onUpdate={() => {
                          queryClient.invalidateQueries({
                            queryKey: ["customItems", tripId],
                          });
                        }}
                      />
                    </Suspense>
                  </ErrorBoundary>
                </div>
              )}

              {/* Journal Tab */}
              {activeTab === "journal" && (
                <div className="bg-white dark:bg-navy-800 rounded-2xl shadow-lg border border-primary-100 dark:border-gold/20 p-6 animate-fadeIn">
                  {isJournalLoading ? (
                    <Skeleton />
                  ) : (
                    <ErrorBoundary>
                      <Suspense
                        fallback={
                          <LoadingSpinner.FullPage message="Loading journal..." />
                        }
                      >
                        <JournalManager
                          tripId={trip.id}
                          tripStartDate={trip.startDate}
                          onUpdate={() =>
                            queryClient.invalidateQueries({
                              queryKey: ["journal", tripId],
                            })
                          }
                        />
                      </Suspense>
                    </ErrorBoundary>
                  )}
                </div>
              )}

              {/* Companions Tab */}
              {activeTab === "companions" && (
                <div className="bg-white dark:bg-navy-800 rounded-2xl shadow-lg border border-primary-100 dark:border-gold/20 p-6 animate-fadeIn">
                  {areCompanionsLoading ? (
                    <Skeleton />
                  ) : (
                    <ErrorBoundary>
                      <Suspense
                        fallback={
                          <LoadingSpinner.FullPage message="Loading companions..." />
                        }
                      >
                        <CompanionManager
                          tripId={trip.id}
                          onUpdate={() =>
                            queryClient.invalidateQueries({
                              queryKey: ["companions", tripId],
                            })
                          }
                        />
                      </Suspense>
                    </ErrorBoundary>
                  )}
                </div>
              )}

              {/* Emergency Card Tab */}
              {activeTab === "emergency" && (
                <div className="bg-white dark:bg-navy-800 rounded-2xl shadow-lg border border-primary-100 dark:border-gold/20 p-6 animate-fadeIn">
                  <ErrorBoundary>
                    <Suspense
                      fallback={
                        <LoadingSpinner.FullPage message="Loading emergency card..." />
                      }
                    >
                      <EmergencyCard
                        tripId={trip.id}
                        onUpdate={() =>
                          queryClient.invalidateQueries({
                            queryKey: emergencyCardQueryKey(trip.id),
                          })
                        }
                      />
                    </Suspense>
                  </ErrorBoundary>
                </div>
              )}

              {/* Local Norms Tab */}
              {activeTab === "local-norms" && (
                <div className="bg-white dark:bg-navy-800 rounded-2xl shadow-lg border border-primary-100 dark:border-gold/20 p-6 animate-fadeIn">
                  <ErrorBoundary>
                    <Suspense
                      fallback={
                        <LoadingSpinner.FullPage message="Loading local norms..." />
                      }
                    >
                      <LocalNormsCard
                        tripId={trip.id}
                        locations={locations}
                        countryCode={trip.countryCode}
                      />
                    </Suspense>
                  </ErrorBoundary>
                </div>
              )}
            </div>
            {/* Close Main Content Column */}
          </div>
          {/* Close Sidebar Layout Container */}
        </div>
      </main>

      {/* Tags Modal */}
      {showTagsModal && (
        <ErrorBoundary>
          <Suspense fallback={null}>
            <TagsModal
              tripId={trip.id}
              onClose={() => setShowTagsModal(false)}
              onTagsUpdated={() => {
                queryClient.invalidateQueries({ queryKey: ["tags", tripId] });
                queryClient.invalidateQueries({ queryKey: ["trip", tripId] });
                queryClient.invalidateQueries({ queryKey: ["trips"] });
              }}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* Share / Collaborators Modal */}
      <ShareTripModal
        isOpen={showShareModal}
        tripId={trip.id}
        tripTitle={trip.title}
        onClose={() => setShowShareModal(false)}
      />

      {/* Duplicate Trip Dialog */}
      <DuplicateTripModal
        isOpen={showDuplicateDialog}
        tripId={trip.id}
        tripTitle={trip.title}
        onClose={() => setShowDuplicateDialog(false)}
        onDuplicated={(newTripId) => navigate(`/trips/${newTripId}`)}
      />

      <ConfirmDialogComponent />
    </div>
  );
}
