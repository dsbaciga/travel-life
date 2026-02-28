import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import type { Photo } from "../types/photo";
import { useSwipeGesture } from "../hooks/useSwipeGesture";
import { useTripLinkSummary } from "../hooks/useTripLinkSummary";
import LinkButton from "./LinkButton";
import LinkedEntitiesDisplay from "./LinkedEntitiesDisplay";
import PhotoDetailsPanel from "./PhotoDetailsPanel";

interface PhotoLightboxProps {
  photo: Photo;
  photos: Photo[];
  getPhotoUrl: (photo: Photo) => string | null;
  onClose: () => void;
  onNavigate: (photo: Photo) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onSetCover?: () => void;
  showCoverButton?: boolean;
  editMode?: boolean;
  editCaption?: string;
  onEditCaptionChange?: (caption: string) => void;
  editTakenAt?: string | null;
  onEditTakenAtChange?: (date: string | null) => void;
  onSaveEdit?: () => void;
  onCancelEdit?: () => void;
  tripId?: number;
  onPhotoLinksUpdated?: () => void;
}

export default function PhotoLightbox({
  photo,
  photos,
  getPhotoUrl,
  onClose,
  onNavigate,
  onEdit,
  onDelete,
  onSetCover,
  showCoverButton = false,
  editMode = false,
  editCaption = "",
  onEditCaptionChange,
  editTakenAt,
  onEditTakenAtChange,
  onSaveEdit,
  onCancelEdit,
  tripId,
  onPhotoLinksUpdated,
}: PhotoLightboxProps) {
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showControls, setShowControls] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isVideo = photo.mediaType === 'video';

  const { getLinkSummary, invalidate: invalidateLinkSummary } = useTripLinkSummary(tripId);

  const currentIndex = photos.findIndex((p) => p.id === photo.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < photos.length - 1;

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
    setShowDetails(false);
  }, []);

  const handlePrev = useCallback(() => {
    if (hasPrev) {
      resetZoom();
      onNavigate(photos[currentIndex - 1]);
    }
  }, [hasPrev, currentIndex, photos, onNavigate, resetZoom]);

  const handleNext = useCallback(() => {
    if (hasNext) {
      resetZoom();
      onNavigate(photos[currentIndex + 1]);
    }
  }, [hasNext, currentIndex, photos, onNavigate, resetZoom]);

  // Swipe gesture support for mobile
  const swipeHandlers = useSwipeGesture({
    onSwipeLeft: handleNext,
    onSwipeRight: handlePrev,
    onSwipeDown: onClose,
  }, {
    minSwipeDistance: 50,
    maxSwipeTime: 300,
  });

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 0.5, 4));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => {
      const newZoom = Math.max(prev - 0.5, 1);
      if (newZoom === 1) {
        setPosition({ x: 0, y: 0 });
      }
      return newZoom;
    });
  }, []);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY < 0) {
        handleZoomIn();
      } else {
        handleZoomOut();
      }
    },
    [handleZoomIn, handleZoomOut]
  );

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editMode) return; // Don't intercept keys in edit mode

      switch (e.key) {
        case "Escape":
          if (showDetails) {
            setShowDetails(false);
          } else {
            onClose();
          }
          break;
        case "ArrowLeft":
          handlePrev();
          break;
        case "ArrowRight":
          handleNext();
          break;
        case "+":
        case "=":
          handleZoomIn();
          break;
        case "-":
          handleZoomOut();
          break;
        case "0":
          resetZoom();
          break;
        case "i":
        case "I":
          setShowDetails((prev) => !prev);
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    editMode,
    onClose,
    handlePrev,
    handleNext,
    handleZoomIn,
    handleZoomOut,
    resetZoom,
    showDetails,
  ]);

  // Mouse wheel zoom
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener("wheel", handleWheel, { passive: false });
      return () => container.removeEventListener("wheel", handleWheel);
    }
  }, [handleWheel]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Auto-hide controls
  useEffect(() => {
    const showControlsTemporarily = () => {
      setShowControls(true);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      controlsTimeoutRef.current = setTimeout(() => {
        if (!editMode) {
          setShowControls(false);
        }
      }, 3000);
    };

    showControlsTemporarily();

    const handleMouseMove = () => showControlsTemporarily();
    document.addEventListener("mousemove", handleMouseMove);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [editMode]);

  // Pan functionality when zoomed (disabled for videos)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1 && !isVideo) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const photoUrl = getPhotoUrl(photo);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black"
      role="dialog"
      aria-modal="true"
      aria-label="Photo lightbox"
      style={{ overscrollBehavior: 'contain' }}
    >
      {/* Main image container */}
      <div
        ref={containerRef}
        className="absolute inset-0 flex items-center justify-center cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        {...swipeHandlers}
      >
        {photoUrl ? (
          isVideo ? (
            <video
              ref={videoRef}
              src={photoUrl}
              className="max-w-full max-h-full object-contain select-none"
              width={1200}
              height={800}
              controls
              autoPlay
              muted
              playsInline
              preload="metadata"
              onClick={(e) => e.stopPropagation()}
            >
              Your browser does not support this video format. Supported formats: MP4, WebM, OGG.
            </video>
          ) : (
            <img
              ref={imageRef}
              src={photoUrl}
              alt={photo.caption || "Photo"}
              className="max-w-full max-h-full object-contain select-none transition-transform duration-150"
              width={1200}
              height={800}
              style={{
                transform: `scale(${zoom}) translate(${position.x / zoom}px, ${
                  position.y / zoom
                }px)`,
              }}
              draggable={false}
            />
          )
        ) : (
          <div className="text-center text-gray-400">
            <svg
              className="w-24 h-24 mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p>{isVideo ? 'Video' : 'Photo'} not available</p>
          </div>
        )}
      </div>

      {/* Top controls */}
      <div
        className={`absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/70 to-transparent transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="flex justify-between items-start max-w-[1600px] mx-auto">
          {/* Photo info */}
          <div className="text-white">
            <p className="text-sm font-medium">
              {currentIndex + 1} / {photos.length}
            </p>
            {photo.caption && (
              <p className="text-sm mt-1 max-w-md truncate">{photo.caption}</p>
            )}
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="text-white bg-black/50 hover:bg-black/75 rounded-full w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors"
            aria-label="Close lightbox"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Navigation arrows */}
      {hasPrev && (
        <button
          type="button"
          onClick={handlePrev}
          className={`absolute left-4 top-1/2 -translate-y-1/2 text-white bg-black/50 hover:bg-black/75 rounded-full w-12 h-12 flex items-center justify-center transition-opacity ${
            showControls ? "opacity-100" : "opacity-0"
          }`}
          aria-label="Previous photo"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
      )}

      {hasNext && (
        <button
          type="button"
          onClick={handleNext}
          className={`absolute right-4 top-1/2 -translate-y-1/2 text-white bg-black/50 hover:bg-black/75 rounded-full w-12 h-12 flex items-center justify-center transition-opacity ${
            showControls ? "opacity-100" : "opacity-0"
          }`}
          aria-label="Next photo"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      )}

      {/* Bottom controls */}
      <div
        className={`absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="max-w-[1600px] mx-auto">
          {editMode ? (
            /* Edit mode panel */
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 max-w-lg mx-auto">
              {/* Caption field */}
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Caption
              </label>
              <textarea
                value={editCaption}
                onChange={(e) => onEditCaptionChange?.(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Add a caption..."
                autoFocus
              />

              {/* Date/Time field */}
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 mt-4">
                Date & Time Taken
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="datetime-local"
                  value={editTakenAt || ""}
                  onChange={(e) => onEditTakenAtChange?.(e.target.value || null)}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                {editTakenAt && (
                  <button
                    type="button"
                    onClick={() => onEditTakenAtChange?.(null)}
                    className="p-2 text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
                    title="Clear date"
                    aria-label="Clear date"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Set when this photo was taken for timeline organization
              </p>

              <div className="flex gap-2 mt-4">
                <button
                  type="button"
                  onClick={onSaveEdit}
                  className="btn btn-primary text-sm"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={onCancelEdit}
                  className="btn btn-secondary text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            /* Normal controls */
            <div className="flex flex-col md:flex-row justify-between items-center gap-3">
              {/* Photo details */}
              <div className="flex-1">
                <div className="flex gap-2 md:gap-4 text-white text-xs md:text-sm flex-wrap justify-center md:justify-start">
                  {photo.location && (
                    <span className="flex items-center gap-1">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                      {photo.location.name}
                    </span>
                  )}
                  {photo.takenAt && (
                    <span className="flex items-center gap-1">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      {new Date(photo.takenAt).toLocaleDateString()}
                    </span>
                  )}
                  <span className="hidden sm:inline px-2 py-0.5 bg-white/20 rounded text-xs">
                    {photo.source === "local" ? "Uploaded" : "Immich"}
                  </span>
                </div>
                {/* Linked entities */}
                {tripId && (
                  <div className="mt-2 hidden md:block [&_.mt-3]:mt-1 [&_*]:text-white/90 [&_.text-gray-500]:text-white/60 [&_.dark\\:text-gray-400]:text-white/60 [&_.bg-blue-100]:bg-blue-500/30 [&_.dark\\:bg-blue-900\\/50]:bg-blue-500/30 [&_.bg-green-100]:bg-green-500/30 [&_.dark\\:bg-green-900\\/50]:bg-green-500/30 [&_.bg-purple-100]:bg-purple-500/30 [&_.dark\\:bg-purple-900\\/50]:bg-purple-500/30 [&_.bg-orange-100]:bg-orange-500/30 [&_.dark\\:bg-orange-900\\/50]:bg-orange-500/30 [&_.bg-yellow-100]:bg-yellow-500/30 [&_.dark\\:bg-yellow-900\\/50]:bg-yellow-500/30 [&_.bg-pink-100]:bg-pink-500/30 [&_.dark\\:bg-pink-900\\/50]:bg-pink-500/30 [&_.bg-gray-100]:bg-gray-500/30 [&_.dark\\:bg-gray-700]:bg-gray-500/30 [&_.border-blue-300]:border-blue-400/50 [&_.border-green-300]:border-green-400/50 [&_.border-purple-300]:border-purple-400/50 [&_.border-orange-300]:border-orange-400/50 [&_.border-yellow-300]:border-yellow-400/50 [&_.border-pink-300]:border-pink-400/50 [&_.border-gray-300]:border-gray-400/50 [&_.dark\\:border-blue-700]:border-blue-400/50 [&_.dark\\:border-green-700]:border-green-400/50 [&_.dark\\:border-purple-700]:border-purple-400/50 [&_.dark\\:border-orange-700]:border-orange-400/50 [&_.dark\\:border-yellow-700]:border-yellow-400/50 [&_.dark\\:border-pink-700]:border-pink-400/50 [&_.dark\\:border-gray-600]:border-gray-400/50">
                    <LinkedEntitiesDisplay
                      tripId={tripId}
                      entityType="PHOTO"
                      entityId={photo.id}
                      excludeTypes={['PHOTO']}
                      compact
                      maxItemsPerType={3}
                    />
                  </div>
                )}
              </div>

              {/* Zoom and action controls */}
              <div className="flex items-center gap-2">
                {/* Zoom controls - hidden on small screens and for videos */}
                {!isVideo && (
                <div className="hidden sm:flex items-center bg-black/50 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={handleZoomOut}
                    disabled={zoom <= 1}
                    className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-white hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    aria-label="Zoom out"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7"
                      />
                    </svg>
                  </button>
                  <span className="px-2 text-white text-sm min-w-[3rem] text-center">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={handleZoomIn}
                    disabled={zoom >= 4}
                    className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-white hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    aria-label="Zoom in"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7"
                      />
                    </svg>
                  </button>
                  {zoom > 1 && (
                    <button
                      type="button"
                      onClick={resetZoom}
                      className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-white hover:bg-white/20 border-l border-white/20 transition-colors"
                      aria-label="Reset zoom"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                    </button>
                  )}
                </div>
                )}

                {/* Divider - hidden on small screens and for videos */}
                {!isVideo && <div className="hidden sm:block w-px h-8 bg-white/30" />}

                {/* Action buttons */}
                <div className="flex gap-2">
                  {/* Details button */}
                  <button
                    type="button"
                    onClick={() => setShowDetails(true)}
                    className="p-3 text-white bg-black/50 hover:bg-white/20 rounded-lg transition-colors"
                    aria-label="View photo details"
                    title="View details"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </button>
                  {onEdit && (
                    <button
                      type="button"
                      onClick={onEdit}
                      className="p-3 text-white bg-black/50 hover:bg-white/20 rounded-lg transition-colors"
                      aria-label="Edit caption"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>
                  )}
                  {tripId && (
                    <div className="bg-black/50 rounded-lg">
                      <LinkButton
                        tripId={tripId}
                        entityType="PHOTO"
                        entityId={photo.id}
                        linkSummary={getLinkSummary('PHOTO', photo.id)}
                        onUpdate={() => {
                          invalidateLinkSummary();
                          onPhotoLinksUpdated?.();
                        }}
                        className="text-white hover:text-blue-400"
                      />
                    </div>
                  )}
                  {showCoverButton && onSetCover && (
                    <button
                      type="button"
                      onClick={onSetCover}
                      className="p-3 text-white bg-black/50 hover:bg-green-600/70 rounded-lg transition-colors"
                      aria-label="Set as cover photo"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                    </button>
                  )}
                  {onDelete && (
                    <button
                      type="button"
                      onClick={onDelete}
                      className="p-3 text-white bg-black/50 hover:bg-red-600/70 rounded-lg transition-colors"
                      aria-label="Delete photo"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Keyboard shortcuts help (visible on hover of controls) */}
      <div
        className={`absolute bottom-20 left-1/2 -translate-x-1/2 text-white/60 text-xs text-center transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      >
        <p>← → Navigate &bull; {!isVideo && '+ - Zoom &bull; 0 Reset &bull; '}i Info &bull; ESC Close</p>
      </div>

      {/* Photo Details Panel */}
      <PhotoDetailsPanel
        photo={photo}
        isOpen={showDetails}
        onClose={() => setShowDetails(false)}
      />
    </div>,
    document.body
  );
}
