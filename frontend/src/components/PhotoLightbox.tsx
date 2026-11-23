import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import type { Photo } from "../types/photo";
import { useTripLinkSummary } from "../hooks/useTripLinkSummary";
import LinkButton from "./LinkButton";
import LinkedEntitiesDisplay from "./LinkedEntitiesDisplay";
import PhotoDetailsPanel from "./PhotoDetailsPanel";
import FavoriteStarButton from "./FavoriteStarButton";
import Icon from "./ui/Icon";
import { pushModal, popModal } from "../utils/modalStack";
import { getFullAssetUrl } from "../lib/config";
import { getAccessToken } from "../lib/axios";
import {
  classifyRelease,
  clampPan,
  distance,
  DOUBLE_TAP_ZOOM,
  isDoubleTap,
  pinchZoom,
  type Point,
  type TapRecord,
} from "../utils/lightboxGestures";

/** History-state marker for the entry the lightbox pushes so Back closes it. */
const HISTORY_MARKER = "tlLightbox";

interface TouchStart extends Point {
  time: number;
  onImage: boolean;
  onBackdrop: boolean;
}

interface TouchGesture {
  pointers: Map<number, Point>;
  start: TouchStart | null;
  origin: Point;
  pinch: { distance: number; zoom: number } | null;
  lastTap: TapRecord | null;
}

/**
 * Fetch an Immich original with auth and expose it as a blob URL. `<video src>`
 * can't send the Bearer header the proxy requires, so it can't load it directly.
 */
type ImmichVideoStatus = 'idle' | 'loading' | 'ready' | 'error';

interface ImmichVideoState {
  assetId: string | null;
  url: string | null;
  status: ImmichVideoStatus;
}

function useImmichVideoUrl(assetId: string | null): { url: string | null; status: ImmichVideoStatus } {
  const [state, setState] = useState<ImmichVideoState>({ assetId: null, url: null, status: 'idle' });

  useEffect(() => {
    const token = getAccessToken();
    const fullUrl = assetId && getFullAssetUrl(`/api/immich/assets/${assetId}/original`);
    if (!assetId || !fullUrl || !token) {
      setState({ assetId, url: null, status: assetId ? 'error' : 'idle' });
      return;
    }

    setState({ assetId, url: null, status: 'loading' });
    const controller = new AbortController();
    let objectUrl: string | null = null;

    fetch(fullUrl, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Video fetch failed: ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ assetId, url: objectUrl, status: 'ready' });
      })
      .catch(() => {
        // Aborted fetches are superseded by a newer request; only real failures are errors
        if (controller.signal.aborted) return;
        setState({ assetId, url: null, status: 'error' });
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId]);

  // State from a previous asset must never leak into the current one: during the
  // render before the effect runs, report loading instead of a stale blob URL.
  if (assetId && state.assetId !== assetId) return { url: null, status: 'loading' };
  return { url: state.url, status: state.status };
}

interface PhotoLightboxProps {
  photo: Photo;
  photos: Photo[];
  getPhotoUrl: (photo: Photo) => string | null;
  onClose: () => void;
  onNavigate: (photo: Photo) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onSetCover?: () => void;
  /** Toggles the favorite star. When omitted the star is read-only (indicator only). */
  onToggleFavorite?: () => void;
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
  onToggleFavorite,
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
  const [isTouching, setIsTouching] = useState(false);
  const [expandedCaptionId, setExpandedCaptionId] = useState<number | null>(null);
  const gestureRef = useRef<TouchGesture>({
    pointers: new Map(),
    start: null,
    origin: { x: 0, y: 0 },
    pinch: null,
    lastTap: null,
  });
  const zoomRef = useRef(1);
  const positionRef = useRef({ x: 0, y: 0 });
  const onCloseRef = useRef(onClose);
  const backdropTapRef = useRef(false);

  useEffect(() => {
    zoomRef.current = zoom;
    positionRef.current = position;
    onCloseRef.current = onClose;
  });

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

  // Prevent body scroll.
  // Uses the shared modal stack rather than writing document.body directly:
  // the lightbox can open on top of an existing Modal, and an unconditional
  // reset on cleanup would re-enable background scrolling while that modal is
  // still open. The stack restores the original value only when the last
  // modal/lightbox closes.
  useEffect(() => {
    const modalId = pushModal();
    return () => popModal(modalId);
  }, []);

  // Browser Back closes the lightbox instead of leaving the page. The history
  // entry is pushed after a tick so a StrictMode remount does not push twice.
  useEffect(() => {
    let pushed = false;
    const timer = setTimeout(() => {
      window.history.pushState({ ...(window.history.state ?? {}), [HISTORY_MARKER]: true }, "");
      pushed = true;
    }, 0);
    const handlePopState = () => {
      if (!pushed) return;
      pushed = false;
      onCloseRef.current();
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("popstate", handlePopState);
      // Closed from the UI while our entry is still current: drop it.
      if (pushed && window.history.state?.[HISTORY_MARKER]) {
        window.history.back();
      }
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
    // Touch screens have no mouse movement; any touch brings the controls back.
    document.addEventListener("pointerdown", handleMouseMove);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("pointerdown", handleMouseMove);
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

  // Touch gestures (the mouse keeps its own drag-to-pan above): swipe to
  // navigate, double-tap to zoom, pinch to zoom, drag to pan when zoomed.
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "touch" || isVideo) return;
    const g = gestureRef.current;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture is best effort; moves still arrive while the finger stays over the container.
    }
    backdropTapRef.current = false;
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setIsTouching(true);
    if (g.pointers.size === 2) {
      const [a, b] = Array.from(g.pointers.values());
      g.pinch = { distance: distance(a, b), zoom: zoomRef.current };
      g.start = null;
    } else if (g.pointers.size === 1) {
      g.pinch = null;
      g.origin = { ...positionRef.current };
      g.start = {
        x: e.clientX,
        y: e.clientY,
        time: Date.now(),
        onImage: e.target === imageRef.current,
        onBackdrop: e.target === e.currentTarget,
      };
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "touch") return;
    const g = gestureRef.current;
    if (!g.pointers.has(e.pointerId)) return;
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const width = imageRef.current?.offsetWidth ?? 0;
    const height = imageRef.current?.offsetHeight ?? 0;
    if (g.pointers.size >= 2 && g.pinch) {
      const [a, b] = Array.from(g.pointers.values());
      const nextZoom = pinchZoom(g.pinch.zoom, g.pinch.distance, distance(a, b));
      setZoom(nextZoom);
      setPosition((prev) => clampPan(prev, nextZoom, width, height));
    } else if (g.pointers.size === 1 && g.start && zoomRef.current > 1) {
      setPosition(
        clampPan(
          { x: g.origin.x + e.clientX - g.start.x, y: g.origin.y + e.clientY - g.start.y },
          zoomRef.current,
          width,
          height
        )
      );
    }
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "touch") return;
    const g = gestureRef.current;
    if (!g.pointers.delete(e.pointerId)) return;
    if (g.pointers.size > 0) {
      // One finger left after a pinch: it never swipes or taps.
      g.pinch = null;
      g.start = null;
      return;
    }
    setIsTouching(false);
    const start = g.start;
    g.start = null;
    g.pinch = null;
    if (zoomRef.current <= 1.01) {
      setZoom(1);
      setPosition({ x: 0, y: 0 });
    }
    if (!start || e.type !== "pointerup") return;

    const kind = classifyRelease(e.clientX - start.x, e.clientY - start.y, Date.now() - start.time);
    if (kind === "swipe-next" || kind === "swipe-prev") {
      if (zoomRef.current > 1) return;
      if (kind === "swipe-next") handleNext();
      else handlePrev();
      return;
    }
    if (kind !== "tap") return;

    const tap: TapRecord = { x: e.clientX, y: e.clientY, time: Date.now() };
    if (start.onImage && isDoubleTap(g.lastTap, tap)) {
      g.lastTap = null;
      if (zoomRef.current > 1) {
        setZoom(1);
        setPosition({ x: 0, y: 0 });
      } else {
        setZoom(DOUBLE_TAP_ZOOM);
      }
      return;
    }
    g.lastTap = tap;
    // Close from the click that follows, not here: closing now would let that click land on the page underneath.
    backdropTapRef.current = start.onBackdrop && zoomRef.current <= 1;
  };

  const thumbnailUrl = getPhotoUrl(photo);
  // Immich videos: the parent hands us the JPEG thumbnail, which a <video> can't
  // play, so stream the authenticated original instead.
  const needsImmichVideo = isVideo && photo.source === 'immich' && !!photo.immichAssetId;
  const { url: immichVideoUrl, status: immichVideoStatus } = useImmichVideoUrl(
    needsImmichVideo ? photo.immichAssetId : null
  );
  const photoUrl = needsImmichVideo ? immichVideoUrl : thumbnailUrl;
  const isLoadingVideo = needsImmichVideo && immichVideoStatus === 'loading';

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
        className="absolute inset-0 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onClick={(e) => {
          if (backdropTapRef.current && e.target === e.currentTarget) onClose();
          backdropTapRef.current = false;
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
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
              className={`max-w-full max-h-full object-contain select-none ${
                isTouching ? "" : "transition-transform duration-150"
              }`}
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
        ) : isLoadingVideo ? (
          <div
            className="flex items-center justify-center"
            role="status"
            aria-live="polite"
          >
            <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin" />
            <span className="sr-only">Loading video</span>
          </div>
        ) : (
          <div className="text-center text-gray-400">
            <Icon name="photo" size={96} className="mx-auto mb-4" />
            <p>{isVideo ? 'Video' : 'Photo'} not available</p>
          </div>
        )}
      </div>

      {/* Top controls */}
      <div
        className={`absolute top-0 left-0 right-0 p-4 pointer-events-none bg-gradient-to-b from-black/70 to-transparent transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="flex justify-between items-start gap-3 max-w-[1600px] mx-auto">
          {/* Photo info */}
          <div className="text-white min-w-0 flex-1">
            <p className="text-sm font-medium">
              {currentIndex + 1} / {photos.length}
            </p>
            {photo.caption && (
              <button
                type="button"
                onClick={() =>
                  setExpandedCaptionId((id) => (id === photo.id ? null : photo.id))
                }
                aria-expanded={expandedCaptionId === photo.id}
                className={`touch-compact pointer-events-auto max-w-md text-left text-sm mt-1 break-words [overflow-wrap:anywhere] ${
                  expandedCaptionId === photo.id
                    ? "block max-h-[40vh] overflow-y-auto"
                    : "line-clamp-2"
                }`}
              >
                {photo.caption}
              </button>
            )}
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="text-white bg-black/50 hover:bg-black/75 pointer-events-auto rounded-full w-11 h-11 min-w-[44px] min-h-[44px] flex-shrink-0 flex items-center justify-center transition-colors"
            aria-label="Close lightbox"
          >
            <Icon name="close" size={24} />
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
          <Icon name="chevronLeft" size={24} />
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
          <Icon name="chevronRight" size={24} />
        </button>
      )}

      {/* Bottom controls */}
      <div
        className={`absolute bottom-0 left-0 right-0 p-4 pointer-events-none bg-gradient-to-t from-black/70 to-transparent transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="max-w-[1600px] mx-auto">
          {editMode ? (
            /* Edit mode panel */
            <div className="pointer-events-auto bg-white dark:bg-dusk-800 rounded-lg p-4 max-w-lg mx-auto">
              {/* Caption field */}
              <label className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-2">
                Caption
              </label>
              <textarea
                value={editCaption}
                onChange={(e) => onEditCaptionChange?.(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dusk-600 rounded-lg bg-white dark:bg-dusk-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Add a caption…"
                autoFocus
              />

              {/* Date/Time field */}
              <label className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-2 mt-4">
                Date & Time Taken
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="datetime-local"
                  value={editTakenAt || ""}
                  onChange={(e) => onEditTakenAtChange?.(e.target.value || null)}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-dusk-600 rounded-lg bg-white dark:bg-dusk-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                {editTakenAt && (
                  <button
                    type="button"
                    onClick={() => onEditTakenAtChange?.(null)}
                    className="p-2 text-gray-500 hover:text-red-500 dark:text-dusk-400 dark:hover:text-red-400 transition-colors"
                    title="Clear date"
                    aria-label="Clear date"
                  >
                    <Icon name="close" />
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-dusk-400 mt-1">
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
                  {photo.takenAt && (
                    <span className="flex items-center gap-1">
                      <Icon name="calendar" size={16} />
                      {new Date(photo.takenAt).toLocaleDateString()}
                    </span>
                  )}
                  <span className="hidden sm:inline px-2 py-0.5 bg-white/20 rounded text-xs">
                    {photo.source === "local" ? "Uploaded" : "Immich"}
                  </span>
                </div>
                {/* Linked entities */}
                {tripId && (
                  <div className="pointer-events-auto mt-2 hidden md:block [&_.mt-3]:mt-1 [&_*]:text-white/90 [&_.text-gray-500]:text-white/60 [&_.dark\\:text-gray-400]:text-white/60 [&_.bg-blue-100]:bg-blue-500/30 [&_.dark\\:bg-blue-900\\/50]:bg-blue-500/30 [&_.bg-green-100]:bg-green-500/30 [&_.dark\\:bg-green-900\\/50]:bg-green-500/30 [&_.bg-purple-100]:bg-purple-500/30 [&_.dark\\:bg-purple-900\\/50]:bg-purple-500/30 [&_.bg-orange-100]:bg-orange-500/30 [&_.dark\\:bg-orange-900\\/50]:bg-orange-500/30 [&_.bg-yellow-100]:bg-yellow-500/30 [&_.dark\\:bg-yellow-900\\/50]:bg-yellow-500/30 [&_.bg-pink-100]:bg-pink-500/30 [&_.dark\\:bg-pink-900\\/50]:bg-pink-500/30 [&_.bg-gray-100]:bg-gray-500/30 [&_.dark\\:bg-gray-700]:bg-gray-500/30 [&_.border-blue-300]:border-blue-400/50 [&_.border-green-300]:border-green-400/50 [&_.border-purple-300]:border-purple-400/50 [&_.border-orange-300]:border-orange-400/50 [&_.border-yellow-300]:border-yellow-400/50 [&_.border-pink-300]:border-pink-400/50 [&_.border-gray-300]:border-gray-400/50 [&_.dark\\:border-blue-700]:border-blue-400/50 [&_.dark\\:border-green-700]:border-green-400/50 [&_.dark\\:border-purple-700]:border-purple-400/50 [&_.dark\\:border-orange-700]:border-orange-400/50 [&_.dark\\:border-yellow-700]:border-yellow-400/50 [&_.dark\\:border-pink-700]:border-pink-400/50 [&_.dark\\:border-gray-600]:border-gray-400/50">
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
              <div className="pointer-events-auto flex items-center gap-2">
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
                    <Icon name="zoomOut" />
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
                    <Icon name="zoomIn" />
                  </button>
                  {zoom > 1 && (
                    <button
                      type="button"
                      onClick={resetZoom}
                      className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-white hover:bg-white/20 border-l border-white/20 transition-colors"
                      aria-label="Reset zoom"
                    >
                      <Icon name="refresh" />
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
                    <Icon name="info" />
                  </button>
                  {/* Editors get a toggle; view-only users only see that the photo is starred */}
                  <FavoriteStarButton
                    variant="toolbar"
                    readOnly={!onToggleFavorite}
                    isFavorite={photo.isFavorite === true}
                    onToggle={onToggleFavorite ?? (() => {})}
                  />
                  {onEdit && (
                    <button
                      type="button"
                      onClick={onEdit}
                      className="p-3 text-white bg-black/50 hover:bg-white/20 rounded-lg transition-colors"
                      aria-label="Edit caption"
                    >
                      <Icon name="edit" />
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
                      <Icon name="photo" />
                    </button>
                  )}
                  {onDelete && (
                    <button
                      type="button"
                      onClick={onDelete}
                      className="p-3 text-white bg-black/50 hover:bg-red-600/70 rounded-lg transition-colors"
                      aria-label="Delete photo"
                    >
                      <Icon name="delete" />
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
        className={`absolute bottom-20 left-1/2 -translate-x-1/2 w-max max-w-[calc(100%-2rem)] pointer-events-none text-white/60 text-xs text-center transition-opacity duration-300 [@media(max-height:500px)]:hidden ${
          showControls && !editMode ? "opacity-100" : "opacity-0"
        }`}
      >
        <p className="[@media(pointer:coarse)]:hidden">
          ← → Navigate • {!isVideo && "+ - Zoom • 0 Reset • "}i Info • ESC Close
        </p>
        <p className="hidden [@media(pointer:coarse)]:block">
          Swipe to navigate{!isVideo && " · Double-tap to zoom"}
        </p>
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
