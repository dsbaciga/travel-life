import { useState, lazy } from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import type { Trip } from "../../types/trip";
import type { Photo, PhotoAlbum } from "../../types/photo";
import type { ConfirmDialogProps } from "../ConfirmDialog";
import type { usePagedPagination } from "../../hooks/usePagedPagination";
import photoService from "../../services/photo.service";
import tripService from "../../services/trip.service";
import AlbumsSidebar from "../AlbumsSidebar";
import AlbumModal from "../AlbumModal";
import AddPhotosToAlbumModal from "../AddPhotosToAlbumModal";
import Pagination from "../Pagination";
import { Skeleton } from "../Skeleton";

const PhotoGallery = lazy(() => import("../PhotoGallery"));
const PhotoUpload = lazy(() => import("../PhotoUpload"));
const AlbumSuggestions = lazy(() => import("../AlbumSuggestions"));

type ConfirmOptions = Omit<
  ConfirmDialogProps,
  "isOpen" | "onClose" | "onConfirm" | "isLoading"
>;
type PagedPaginationResult = ReturnType<typeof usePagedPagination<Photo>>;

interface TripPhotosTabProps {
  trip: Trip;
  albums: PhotoAlbum[];
  areAlbumsLoading: boolean;
  totalPhotosCount: number;
  unsortedPhotosCount: number;
  selectedAlbumId: number | null;
  onSelectAlbum: (albumId: number | null) => void;
  filteredPhotos: Photo[];
  photosPagination: PagedPaginationResult;
  unsortedPagination: PagedPaginationResult;
  albumPhotosPagination: PagedPaginationResult;
  onPhotoSortChange: (sortBy: string, sortOrder: string) => void;
  initialSortBy: string;
  initialSortOrder: string;
  existingImmichAssetIds: Set<string>;
  onRefreshImmichAssetIds: () => Promise<void>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

export default function TripPhotosTab({
  trip,
  albums,
  areAlbumsLoading,
  totalPhotosCount,
  unsortedPhotosCount,
  selectedAlbumId,
  onSelectAlbum,
  filteredPhotos,
  photosPagination,
  unsortedPagination,
  albumPhotosPagination,
  onPhotoSortChange,
  initialSortBy,
  initialSortOrder,
  existingImmichAssetIds,
  onRefreshImmichAssetIds,
  confirm,
}: TripPhotosTabProps) {
  const queryClient = useQueryClient();
  const tripId = trip.id;

  const [showAlbumModal, setShowAlbumModal] = useState(false);
  const [editingAlbum, setEditingAlbum] = useState<PhotoAlbum | null>(null);
  const [showAlbumsMobileDrawer, setShowAlbumsMobileDrawer] = useState(false);
  const [showAddPhotosModal, setShowAddPhotosModal] = useState(false);

  const currentAlbum =
    selectedAlbumId !== null && selectedAlbumId > 0
      ? albums.find((a) => a.id === selectedAlbumId)
      : undefined;

  const refreshCurrentPhotoView = () => {
    if (selectedAlbumId === null) {
      photosPagination.loadInitial();
    } else if (selectedAlbumId === -1) {
      unsortedPagination.loadInitial();
    } else {
      albumPhotosPagination.loadInitial();
    }
  };

  const handleCreateAlbum = () => {
    setEditingAlbum(null);
    setShowAlbumModal(true);
  };

  const handleEditAlbum = (album: PhotoAlbum) => {
    setEditingAlbum(album);
    setShowAlbumModal(true);
  };

  const handleSaveAlbum = async (data: { name: string; description: string }) => {
    try {
      if (editingAlbum) {
        await photoService.updateAlbum(editingAlbum.id, data);
        toast.success("Album updated");
      } else {
        await photoService.createAlbum({
          tripId,
          ...data,
        });
        toast.success("Album created");
      }

      queryClient.invalidateQueries({ queryKey: ["albums", tripId] });
      setShowAlbumModal(false);
      setEditingAlbum(null);
    } catch (err) {
      toast.error(
        editingAlbum ? "Failed to update album" : "Failed to create album"
      );
      throw err;
    }
  };

  const handleDeleteAlbum = async (albumId: number) => {
    const confirmed = await confirm({
      title: "Delete Album",
      message: "Delete this album? Photos will not be deleted, only the album.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) {
      return;
    }

    try {
      await photoService.deleteAlbum(albumId);
      toast.success("Album deleted");

      if (selectedAlbumId === albumId) {
        onSelectAlbum(null);
      }

      queryClient.invalidateQueries({ queryKey: ["albums", tripId] });
    } catch {
      toast.error("Failed to delete album");
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Upload Interface - Full Width */}
      <PhotoUpload
        tripId={trip.id}
        onPhotoUploaded={async () => {
          await queryClient.invalidateQueries({ queryKey: ["trip", tripId] });
          await queryClient.invalidateQueries({ queryKey: ["albums", tripId] });
          await onRefreshImmichAssetIds();
          refreshCurrentPhotoView();
        }}
        tripStartDate={trip.startDate || undefined}
        tripEndDate={trip.endDate || undefined}
        existingImmichAssetIds={existingImmichAssetIds}
      />

      {/* Smart Album Suggestions — show in "All Photos" and "Unsorted" views */}
      {(selectedAlbumId === null || selectedAlbumId === -1) &&
        unsortedPhotosCount >= 3 && (
          <AlbumSuggestions
            tripId={trip.id}
            onAlbumCreated={() => {
              queryClient.invalidateQueries({ queryKey: ["albums", tripId] });
              if (selectedAlbumId === null) {
                photosPagination.loadInitial();
              } else {
                unsortedPagination.loadInitial();
              }
            }}
          />
        )}

      {/* Mobile Albums Drawer Toggle Button */}
      <button
        onClick={() => setShowAlbumsMobileDrawer(true)}
        className="md:hidden fixed bottom-20 left-6 z-30 p-4 bg-primary-500 dark:bg-gold text-white dark:text-navy-900 rounded-full shadow-lg hover:bg-primary-600 dark:hover:bg-gold/80 transition-colors"
        aria-label="Open albums"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
          />
        </svg>
      </button>

      {/* Sidebar Layout */}
      <div className="flex gap-0 bg-white dark:bg-navy-800 rounded-2xl shadow-lg border border-primary-100 dark:border-gold/20 overflow-hidden">
        {/* Left: Albums Sidebar */}
        {areAlbumsLoading ? (
          <Skeleton className="w-64" />
        ) : (
          <AlbumsSidebar
            albums={albums}
            selectedAlbumId={selectedAlbumId}
            totalPhotos={totalPhotosCount}
            unsortedPhotosCount={unsortedPhotosCount}
            onSelectAlbum={onSelectAlbum}
            onCreateAlbum={handleCreateAlbum}
            onEditAlbum={handleEditAlbum}
            onDeleteAlbum={handleDeleteAlbum}
            isMobileDrawerOpen={showAlbumsMobileDrawer}
            onCloseMobileDrawer={() => setShowAlbumsMobileDrawer(false)}
          />
        )}

        {/* Right: Photo Gallery */}
        <div className="flex-1 min-w-0 p-4 sm:p-6">
          {/* Header row - stacks on mobile */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:justify-between sm:items-start mb-4 sm:mb-6 gap-3">
            <div className="flex flex-col gap-1 w-full sm:w-auto sm:min-w-0 sm:flex-1">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white break-words">
                {selectedAlbumId === null
                  ? `All Photos (${totalPhotosCount})`
                  : selectedAlbumId === -1
                  ? `Unsorted (${unsortedPhotosCount})`
                  : `${currentAlbum?.name ?? "Album"} (${
                      currentAlbum?._count?.photoAssignments ?? 0
                    })`}
              </h2>
              {currentAlbum?.description && (
                <p
                  className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2"
                  title={currentAlbum.description}
                >
                  {currentAlbum.description}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
              {/* Add Photos button - only show when viewing a specific album */}
              {selectedAlbumId !== null && selectedAlbumId > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAddPhotosModal(true)}
                  className="px-3 py-2 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800 whitespace-nowrap flex items-center gap-2"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Add Photos
                </button>
              )}
              {trip.coverPhoto && (
                <button
                  type="button"
                  onClick={async () => {
                    const confirmed = await confirm({
                      title: "Remove Cover Photo",
                      message:
                        "Are you sure you want to remove the cover photo from this trip?",
                      confirmLabel: "Remove",
                      variant: "warning",
                    });
                    if (!confirmed) return;

                    try {
                      await tripService.updateCoverPhoto(trip.id, null);
                      toast.success("Cover photo removed");
                      queryClient.invalidateQueries({
                        queryKey: ["trip", tripId],
                      });
                      queryClient.invalidateQueries({ queryKey: ["trips"] });
                    } catch {
                      toast.error("Failed to remove cover photo");
                    }
                  }}
                  className="px-3 py-2 text-sm bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-800 whitespace-nowrap flex-shrink-0"
                >
                  Remove Cover Photo
                </button>
              )}
            </div>
          </div>

          <PhotoGallery
            photos={filteredPhotos}
            albums={albums}
            onPhotoDeleted={() => {
              queryClient.invalidateQueries({ queryKey: ["trip", tripId] });
              queryClient.invalidateQueries({ queryKey: ["albums", tripId] });
              refreshCurrentPhotoView();
            }}
            onPhotoUpdated={() => {
              queryClient.invalidateQueries({ queryKey: ["trip", tripId] });
              refreshCurrentPhotoView();
            }}
            onPhotosAddedToAlbum={() => {
              queryClient.invalidateQueries({ queryKey: ["albums", tripId] });
              refreshCurrentPhotoView();
              toast.success("Photos added to album");
            }}
            onSetCoverPhoto={async (photoId: number) => {
              try {
                await tripService.updateCoverPhoto(trip.id, photoId);
                toast.success("Cover photo updated");
                queryClient.invalidateQueries({ queryKey: ["trip", tripId] });
                queryClient.invalidateQueries({ queryKey: ["trips"] });
              } catch {
                toast.error("Failed to set cover photo");
              }
            }}
            coverPhotoId={trip.coverPhotoId}
            totalPhotosInView={
              selectedAlbumId === null
                ? photosPagination.total
                : selectedAlbumId === -1
                ? unsortedPagination.total
                : albumPhotosPagination.total
            }
            onLoadAllPhotos={async () => {
              toast.error(
                "Loading all photos at once is not available with paged view. Use page navigation instead."
              );
            }}
            currentAlbumId={selectedAlbumId}
            onPhotosRemovedFromAlbum={() => {
              queryClient.invalidateQueries({ queryKey: ["albums", tripId] });
              refreshCurrentPhotoView();
              toast.success("Photos removed from album");
            }}
            onSortChange={onPhotoSortChange}
            initialSortBy={initialSortBy}
            initialSortOrder={initialSortOrder}
            tripId={trip.id}
          />

          {/* Pagination Controls */}
          {selectedAlbumId === null && photosPagination.totalPages > 1 && (
            <Pagination
              currentPage={photosPagination.currentPage}
              totalPages={photosPagination.totalPages}
              pageNumbers={photosPagination.pageNumbers}
              onPageChange={photosPagination.goToPage}
              onPrevious={photosPagination.previousPage}
              onNext={photosPagination.nextPage}
              hasPreviousPage={photosPagination.hasPreviousPage}
              hasNextPage={photosPagination.hasNextPage}
              loading={photosPagination.loading}
              rangeStart={photosPagination.rangeStart}
              rangeEnd={photosPagination.rangeEnd}
              total={photosPagination.total}
              className="mt-6"
            />
          )}
          {selectedAlbumId === -1 && unsortedPagination.totalPages > 1 && (
            <Pagination
              currentPage={unsortedPagination.currentPage}
              totalPages={unsortedPagination.totalPages}
              pageNumbers={unsortedPagination.pageNumbers}
              onPageChange={unsortedPagination.goToPage}
              onPrevious={unsortedPagination.previousPage}
              onNext={unsortedPagination.nextPage}
              hasPreviousPage={unsortedPagination.hasPreviousPage}
              hasNextPage={unsortedPagination.hasNextPage}
              loading={unsortedPagination.loading}
              rangeStart={unsortedPagination.rangeStart}
              rangeEnd={unsortedPagination.rangeEnd}
              total={unsortedPagination.total}
              className="mt-6"
            />
          )}
          {selectedAlbumId !== null &&
            selectedAlbumId > 0 &&
            albumPhotosPagination.totalPages > 1 && (
              <Pagination
                currentPage={albumPhotosPagination.currentPage}
                totalPages={albumPhotosPagination.totalPages}
                pageNumbers={albumPhotosPagination.pageNumbers}
                onPageChange={albumPhotosPagination.goToPage}
                onPrevious={albumPhotosPagination.previousPage}
                onNext={albumPhotosPagination.nextPage}
                hasPreviousPage={albumPhotosPagination.hasPreviousPage}
                hasNextPage={albumPhotosPagination.hasNextPage}
                loading={albumPhotosPagination.loading}
                rangeStart={albumPhotosPagination.rangeStart}
                rangeEnd={albumPhotosPagination.rangeEnd}
                total={albumPhotosPagination.total}
                className="mt-6"
              />
            )}
          {selectedAlbumId === -1 && filteredPhotos.length === 0 && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <p>All photos are sorted into albums!</p>
            </div>
          )}
        </div>
      </div>

      {/* Album Modal */}
      {showAlbumModal && (
        <AlbumModal
          album={editingAlbum || undefined}
          tripId={trip.id}
          onSave={handleSaveAlbum}
          onClose={() => {
            setShowAlbumModal(false);
            setEditingAlbum(null);
          }}
          onUpdate={() => {
            queryClient.invalidateQueries({ queryKey: ["albums", tripId] });
          }}
        />
      )}

      {/* Add Photos to Album Modal */}
      {showAddPhotosModal && selectedAlbumId && selectedAlbumId > 0 && (
        <AddPhotosToAlbumModal
          tripId={trip.id}
          albumId={selectedAlbumId}
          albumName={currentAlbum?.name ?? "Album"}
          existingPhotoIds={new Set(filteredPhotos.map((p) => p.id))}
          onClose={() => setShowAddPhotosModal(false)}
          onPhotosAdded={() => {
            queryClient.invalidateQueries({ queryKey: ["albums", tripId] });
            refreshCurrentPhotoView();
            toast.success("Photos added to album");
          }}
        />
      )}
    </div>
  );
}
