import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import tripService from '../services/trip.service';
import { resolveTripCoverUrl, type TripCoverSource } from '../lib/tripCover';
import { getApiErrorMessage } from '../lib/errors';
import type { Trip } from '../types/trip';

interface TripCoverImageFieldProps {
  tripId: number;
  /** Current cover state of the trip (uploaded image and/or gallery photo) */
  cover: TripCoverSource;
  /** Called with the updated trip after an upload or removal */
  onChange: (trip: Trip) => void;
}

// Keep in sync with the 25MB limit enforced by the upload route
const MAX_FILE_SIZE = 25 * 1024 * 1024;

/**
 * Upload and manage a trip's cover image from the trip edit form.
 *
 * The uploaded image is stored outside the trip's photo library, so it never shows up
 * in photos or memories — which lets a trip that hasn't happened yet still have a cover.
 * A photo from the trip's gallery can replace it later via "set as cover" in the photo
 * gallery; that clears the upload, and uploading here clears the gallery selection.
 */
export default function TripCoverImageField({ tripId, cover, onChange }: TripCoverImageFieldProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { coverImagePath, coverImageThumbnailPath, coverPhoto } = cover;
  const hasUploadedCover = !!coverImagePath;
  const isGalleryPhoto = !hasUploadedCover && !!coverPhoto;

  useEffect(() => {
    let cancelled = false;
    let createdBlobUrl: string | null = null;

    const load = async () => {
      const { url, blobUrl } = await resolveTripCoverUrl(
        { coverImagePath, coverImageThumbnailPath, coverPhoto },
        { preferThumbnail: true }
      );
      createdBlobUrl = blobUrl;

      if (cancelled) {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        return;
      }
      setPreviewUrl(url);
    };

    load();

    return () => {
      cancelled = true;
      if (createdBlobUrl) URL.revokeObjectURL(createdBlobUrl);
    };
  }, [coverImagePath, coverImageThumbnailPath, coverPhoto]);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so picking the same file again still fires a change event
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('Image is too large (max 25MB)');
      return;
    }

    try {
      setBusy(true);
      const updatedTrip = await tripService.uploadCoverImage(tripId, file);
      onChange(updatedTrip);
      toast.success('Cover photo updated');
    } catch (error) {
      // Surfaces the backend's reason (e.g. rejected file type) rather than axios's
      // generic "Request failed with status code 400"
      toast.error(getApiErrorMessage(error, 'Failed to upload cover photo'));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    try {
      setBusy(true);
      const updatedTrip = await tripService.deleteCoverImage(tripId);
      onChange(updatedTrip);
      toast.success('Cover photo removed');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to remove cover photo'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <span className="label">Cover Photo</span>

      <div className="flex flex-col sm:flex-row gap-4 items-start">
        <div className="w-full sm:w-56 aspect-video rounded-lg overflow-hidden border border-gray-200 dark:border-dusk-700 bg-gray-100 dark:bg-dusk-700 flex items-center justify-center shrink-0">
          {previewUrl ? (
            <img src={previewUrl} alt="Trip cover" className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm text-gray-500 dark:text-dusk-400">No cover photo</span>
          )}
        </div>

        <div className="flex-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelected}
            className="hidden"
            id="coverImageInput"
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn btn-secondary"
              disabled={busy}
            >
              {busy ? 'Working...' : hasUploadedCover ? 'Replace Image' : 'Upload Image'}
            </button>

            {hasUploadedCover && (
              <button
                type="button"
                onClick={handleRemove}
                className="btn btn-danger"
                disabled={busy}
              >
                Remove
              </button>
            )}
          </div>

          <p className="text-sm text-gray-600 dark:text-dusk-400 mt-2">
            {isGalleryPhoto
              ? "This trip's cover comes from a photo in its gallery. Uploading an image here replaces it."
              : 'Uploaded cover images are not added to the trip’s photos or memories. You can swap in a real trip photo later from the Photos tab.'}
          </p>
        </div>
      </div>
    </div>
  );
}
