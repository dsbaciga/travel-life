/**
 * RecentPhotosWidget - Carousel of recently uploaded photos
 */

import { useState, useEffect, useRef } from "react";
import type { Photo } from "../../types/photo";
import tripService from "../../services/trip.service";
import photoService from "../../services/photo.service";
import { getFullAssetUrl } from "../../lib/config";
import { getAccessToken } from "../../lib/axios";
import { Link } from "react-router";
import { Skeleton } from "../Skeleton";

export default function RecentPhotosWidget() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [thumbnailCache, setThumbnailCache] = useState<{
    [id: number]: string;
  }>({});
  const autoScrollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track blob URLs for cleanup (avoids stale closure issues)
  const blobUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    loadRecentPhotos();
    return () => {
      if (autoScrollRef.current) clearInterval(autoScrollRef.current);
      // Clean up blob URLs on unmount
      blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      blobUrlsRef.current = [];
    };
  }, []);

  // Auto-scroll carousel
  useEffect(() => {
    if (photos.length > 1) {
      autoScrollRef.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % photos.length);
      }, 5000); // Change photo every 5 seconds

      return () => {
        if (autoScrollRef.current) clearInterval(autoScrollRef.current);
      };
    }
  }, [photos.length]);

  const loadRecentPhotos = async () => {
    try {
      // Get recent trips
      const tripsResponse = await tripService.getTrips();
      const recentTrips = tripsResponse.trips.slice(0, 5); // Check last 5 trips

      // Collect photos from recent trips
      const allPhotos: Photo[] = [];
      for (const trip of recentTrips) {
        try {
          const photosResponse = await photoService.getPhotosByTrip(trip.id);
          allPhotos.push(...photosResponse.photos);
        } catch {
          // Skip if fails
        }
      }

      // Sort by creation date and take top 10
      const recentPhotos = allPhotos
        .sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        })
        .slice(0, 10);

      setPhotos(recentPhotos);

      // Load thumbnails for Immich photos
      const token = getAccessToken();
      if (token) {
        for (const photo of recentPhotos.filter(
          (p) => p.source === "immich" && p.thumbnailPath
        )) {
          try {
            const fullUrl = getFullAssetUrl(photo.thumbnailPath);
            if (!fullUrl) continue;

            const response = await fetch(fullUrl, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
              const blob = await response.blob();
              const blobUrl = URL.createObjectURL(blob);
              // Track blob URL for cleanup
              blobUrlsRef.current.push(blobUrl);
              setThumbnailCache((prev) => ({ ...prev, [photo.id]: blobUrl }));
            }
          } catch {
            // Skip if fails
          }
        }
      }
    } catch (error) {
      console.error("Failed to load recent photos:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getPhotoUrl = (photo: Photo): string | null => {
    if (photo.source === "local" && photo.thumbnailPath) {
      return getFullAssetUrl(photo.thumbnailPath);
    }
    if (photo.source === "immich") {
      return thumbnailCache[photo.id] || null;
    }
    return null;
  };

  const goToPhoto = (index: number) => {
    setCurrentIndex(index);
    // Reset auto-scroll timer
    if (autoScrollRef.current) {
      clearInterval(autoScrollRef.current);
      autoScrollRef.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % photos.length);
      }, 5000);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-navy-800 rounded-2xl p-6 shadow-lg border-2 border-primary-100 dark:border-gold/20 h-full flex flex-col">
        <Skeleton className="h-6 w-32 rounded mb-4" />
        <Skeleton className="flex-1 min-h-[200px] w-full rounded-xl" />
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="bg-white dark:bg-navy-800 rounded-2xl p-6 shadow-lg border-2 border-primary-100 dark:border-gold/20 hover:shadow-xl transition-shadow duration-300 h-full flex flex-col">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h3 className="text-xl font-display font-bold text-gray-900 dark:text-white">
            Recent Photos
          </h3>
        </div>
        <div className="text-center py-12">
          <svg
            className="w-16 h-16 mx-auto mb-3 text-gray-300 dark:text-dusk-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <p className="text-gray-500 dark:text-dusk-400">No photos yet</p>
        </div>
      </div>
    );
  }

  const currentPhoto = photos[currentIndex];
  const photoUrl = getPhotoUrl(currentPhoto);

  return (
    <div className="bg-white dark:bg-navy-800 rounded-2xl p-6 shadow-lg border-2 border-primary-100 dark:border-gold/20 hover:shadow-xl transition-shadow duration-300 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h3 className="text-xl font-display font-bold text-gray-900 dark:text-white truncate">
            Recent Photos
          </h3>
        </div>
        <span className="text-sm text-gray-500 dark:text-dusk-400 whitespace-nowrap flex-shrink-0">
          {currentIndex + 1} / {photos.length}
        </span>
      </div>

      {/* Carousel */}
      <div className="relative flex-1 min-h-[200px] rounded-xl overflow-hidden bg-gray-100 dark:bg-dusk-700 group">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={currentPhoto.caption || "Photo"}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg
              className="w-16 h-16 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}

        {/* Caption overlay */}
        {currentPhoto.caption && (
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
            <p className="text-white text-sm font-medium line-clamp-2">
              {currentPhoto.caption}
            </p>
          </div>
        )}

        {/* Navigation arrows */}
        {photos.length > 1 && (
          <>
            <button
              onClick={() =>
                goToPhoto((currentIndex - 1 + photos.length) % photos.length)
              }
              className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Previous photo"
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
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <button
              onClick={() => goToPhoto((currentIndex + 1) % photos.length)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Next photo"
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
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Dots indicator */}
      {photos.length > 1 && (
        <div className="flex justify-center gap-2 mt-4 px-2 flex-wrap">
          {photos.map((_, index) => (
            <button
              key={index}
              onClick={() => goToPhoto(index)}
              className={`w-2 h-2 rounded-full transition-all flex-shrink-0 ${
                index === currentIndex
                  ? "bg-primary-600 dark:bg-sky w-6"
                  : "bg-gray-300 dark:bg-dusk-600 hover:bg-gray-400 dark:hover:bg-dusk-500"
              }`}
              aria-label={`Go to photo ${index + 1}`}
            />
          ))}
        </div>
      )}

      {/* View all link */}
      <Link
        to="/trips"
        className="block text-center mt-4 text-sm text-primary-600 dark:text-sky hover:text-primary-700 dark:hover:text-sky/80 font-medium transition-colors pb-1"
      >
        View All Photos →
      </Link>
    </div>
  );
}
