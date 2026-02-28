import { useState, useEffect, useRef, useCallback } from "react";
import type { ImmichAsset, ImmichAlbum } from "../types/immich";
import photoService from "../services/photo.service";
import immichService from "../services/immich.service";
import ImmichBrowser from "./ImmichBrowser";
import DragDropUpload from "./DragDropUpload";
import { useDragDropOverlay } from "../hooks/useDragDropOverlay";
import { PhotoSourcePicker } from "./CameraCapture";
import { useConfetti } from "../hooks/useConfetti";
import toast from "react-hot-toast";
import { parseDuration } from "../utils/duration";

interface PhotoUploadProps {
  tripId: number;
  onPhotoUploaded: () => void;
  tripStartDate?: string;
  tripEndDate?: string;
  existingImmichAssetIds?: Set<string>;
}

export default function PhotoUpload({
  tripId,
  onPhotoUploaded,
  tripStartDate,
  tripEndDate,
  existingImmichAssetIds,
}: PhotoUploadProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showImmichBrowser, setShowImmichBrowser] = useState(false);
  const [immichConfigured, setImmichConfigured] = useState(false);
  const { isDraggingFiles, setupListeners } = useDragDropOverlay();
  const { triggerConfetti } = useConfetti();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  // Cleanup: abort pending requests on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    checkImmichSettings();
  }, []);

  // Create and cleanup preview URLs when files change
  useEffect(() => {
    // Create URLs for new files
    const urls = selectedFiles.map(file => URL.createObjectURL(file));
    setPreviewUrls(urls);

    // Cleanup previous URLs on change or unmount
    return () => {
      urls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [selectedFiles]);

  useEffect(() => {
    // Setup global drag-and-drop overlay
    const cleanup = setupListeners();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // setupListeners is stable from custom hook

  const checkImmichSettings = async () => {
    try {
      const settings = await immichService.getSettings();
      setImmichConfigured(settings.immichConfigured);
    } catch (err) {
      console.error("Failed to check Immich settings:", err);
    }
  };


  const handleFilesDropped = (files: File[]) => {
    setSelectedFiles((prev) => [...prev, ...files]);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      handleFilesDropped(files);
      // Reset input so the same file can be selected again
      e.target.value = "";
    }
  };

  const handleSelectPhotosClick = () => {
    if (selectedFiles.length === 0) {
      // No files selected - open file picker
      fileInputRef.current?.click();
    } else {
      // Files selected - upload them
      handleUpload();
    }
  };

  const handleImmichSelect = async (assets: ImmichAsset[]) => {
    setIsUploading(true);
    setUploadProgress(0);

    try {
      // USE_BATCH_API_THRESHOLD: When to switch from individual API calls to batch endpoint
      // MAX_PHOTOS_PER_REQUEST: Maximum photos per HTTP request to avoid timeouts
      const USE_BATCH_API_THRESHOLD = 250;
      const MAX_PHOTOS_PER_REQUEST = 500;

      if (assets.length >= USE_BATCH_API_THRESHOLD) {
        // Use batch endpoint for large selections with chunking
        console.log(`[PhotoUpload] Using batch endpoint for ${assets.length} assets`);

        const batchData = assets.map((asset) => ({
          immichAssetId: asset.id,
          mediaType: asset.type === 'VIDEO' ? 'video' as const : 'image' as const,
          duration: asset.duration ? parseDuration(asset.duration) : undefined,
          caption: assets.length === 1 ? caption || undefined : undefined,
          takenAt: asset.exifInfo?.dateTimeOriginal || asset.fileCreatedAt,
          latitude: asset.exifInfo?.latitude ?? undefined,
          longitude: asset.exifInfo?.longitude ?? undefined,
        }));

        // Split into chunks to avoid request timeout
        const chunks = [];
        for (let i = 0; i < batchData.length; i += MAX_PHOTOS_PER_REQUEST) {
          chunks.push(batchData.slice(i, i + MAX_PHOTOS_PER_REQUEST));
        }

        console.log(`[PhotoUpload] Split ${assets.length} photos into ${chunks.length} chunks of up to ${MAX_PHOTOS_PER_REQUEST}`);

        // Process chunks sequentially with progress tracking
        let totalSuccessful = 0;
        let totalFailed = 0;
        const allErrors: string[] = [];

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const chunkNumber = i + 1;

          console.log(`[PhotoUpload] Processing chunk ${chunkNumber}/${chunks.length} (${chunk.length} photos)`);
          toast.loading(
            `Linking photos: chunk ${chunkNumber}/${chunks.length} (${totalSuccessful + totalFailed}/${assets.length})`,
            { id: 'batch-progress' }
          );

          try {
            const result = await photoService.linkImmichPhotosBatch({
              tripId,
              assets: chunk,
            });

            totalSuccessful += result.successful;
            totalFailed += result.failed;
            allErrors.push(...result.errors);

            // Update progress
            const progress = ((i + 1) / chunks.length) * 100;
            setUploadProgress(progress);

            console.log(`[PhotoUpload] Chunk ${chunkNumber} complete: ${result.successful} successful, ${result.failed} failed`);
          } catch (chunkErr) {
            console.error(`[PhotoUpload] Chunk ${chunkNumber} failed:`, chunkErr);
            totalFailed += chunk.length;
            allErrors.push(`Chunk ${chunkNumber} failed completely: ${chunkErr instanceof Error ? chunkErr.message : 'Unknown error'}`);
          }
        }

        toast.dismiss('batch-progress');

        console.log(`[PhotoUpload] Batch linking complete: ${totalSuccessful} successful, ${totalFailed} failed out of ${assets.length}`);

        if (totalFailed > 0) {
          toast.error(
            `Linked ${totalSuccessful} of ${assets.length} photos successfully (${totalFailed} failed)`,
            { duration: 5000 }
          );
          if (allErrors.length > 0) {
            console.error('[PhotoUpload] Errors:', allErrors);
          }
        } else {
          toast.success(`Successfully linked all ${totalSuccessful} photos!`);
        }
      } else {
        // Use individual linking for smaller selections
        console.log(`[PhotoUpload] Using individual linking for ${assets.length} assets`);
        for (let i = 0; i < assets.length; i++) {
          const asset = assets[i];
          const takenAt = asset.exifInfo?.dateTimeOriginal || asset.fileCreatedAt;

          await photoService.linkImmichPhoto({
            tripId,
            immichAssetId: asset.id,
            mediaType: asset.type === 'VIDEO' ? 'video' : 'image',
            duration: parseDuration(asset.duration),
            caption: assets.length === 1 ? caption || undefined : undefined,
            takenAt: takenAt ?? undefined,
            latitude: asset.exifInfo?.latitude ?? undefined,
            longitude: asset.exifInfo?.longitude ?? undefined,
          });
          setUploadProgress(((i + 1) / assets.length) * 100);
        }
      }

      setCaption("");
      setUploadProgress(0);
      setShowImmichBrowser(false);
      onPhotoUploaded();
    } catch (err) {
      console.error("Failed to link Immich photos:", err);
      toast.dismiss();
      toast.error("Failed to link Immich photos");
    } finally {
      setIsUploading(false);
    }
  };

  const handleImportAlbum = async (
    album: ImmichAlbum,
    assets: ImmichAsset[]
  ) => {
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const MAX_PHOTOS_PER_REQUEST = 500; // Max photos per HTTP request

      toast.loading(
        `Importing album "${album.albumName}" with ${assets.length} photos...`,
        { id: 'album-import' }
      );

      // Step 1: Create the album in the trip
      const newAlbum = await photoService.createAlbum({
        tripId,
        name: album.albumName,
        description: album.description || `Imported from Immich`,
      });

      // Step 2: Link all photos/videos from Immich using batch processing
      const batchData = assets.map((asset) => ({
        immichAssetId: asset.id,
        mediaType: asset.type === 'VIDEO' ? 'video' as const : 'image' as const,
        duration: asset.duration ? parseDuration(asset.duration) : undefined,
        caption: undefined,
        takenAt: asset.exifInfo?.dateTimeOriginal || asset.fileCreatedAt,
        latitude: asset.exifInfo?.latitude ?? undefined,
        longitude: asset.exifInfo?.longitude ?? undefined,
      }));

      // Split into chunks to avoid request timeout
      const chunks = [];
      for (let i = 0; i < batchData.length; i += MAX_PHOTOS_PER_REQUEST) {
        chunks.push(batchData.slice(i, i + MAX_PHOTOS_PER_REQUEST));
      }

      console.log(`[PhotoUpload] Album import: Split ${assets.length} photos into ${chunks.length} chunks`);

      // Process chunks sequentially with progress tracking
      const allPhotoIds: number[] = [];
      let totalSuccessful = 0;
      let totalFailed = 0;
      const allErrors: string[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkNumber = i + 1;

        console.log(`[PhotoUpload] Processing chunk ${chunkNumber}/${chunks.length} (${chunk.length} photos)`);
        toast.loading(
          `Importing "${album.albumName}": chunk ${chunkNumber}/${chunks.length} (${totalSuccessful}/${assets.length})`,
          { id: 'album-import' }
        );

        try {
          const result = await photoService.linkImmichPhotosBatch({
            tripId,
            assets: chunk,
          });

          totalSuccessful += result.successful;
          totalFailed += result.failed;
          allPhotoIds.push(...(result.photoIds || []));
          allErrors.push(...result.errors);

          // Update progress
          const progress = ((i + 1) / chunks.length) * 90; // Reserve 10% for album assignment
          setUploadProgress(progress);

          console.log(`[PhotoUpload] Chunk ${chunkNumber} complete: ${result.successful} successful, ${(result.photoIds || []).length} IDs`);
        } catch (chunkErr) {
          console.error(`[PhotoUpload] Chunk ${chunkNumber} failed:`, chunkErr);
          totalFailed += chunk.length;
          allErrors.push(`Chunk ${chunkNumber} failed: ${chunkErr instanceof Error ? chunkErr.message : 'Unknown error'}`);
        }
      }

      if (allErrors.length > 0) {
        console.error('[PhotoUpload] Album import errors:', allErrors);
      }

      // Step 3: Add all photos to the album (in batches if needed)
      if (allPhotoIds.length > 0) {
        toast.loading(
          `Adding ${allPhotoIds.length} photos to album...`,
          { id: 'album-import' }
        );

        // Add photos to album in chunks of 1000
        const ALBUM_MAX_PHOTOS_PER_REQUEST = 1000;
        for (let i = 0; i < allPhotoIds.length; i += ALBUM_MAX_PHOTOS_PER_REQUEST) {
          const photoIdChunk = allPhotoIds.slice(i, i + ALBUM_MAX_PHOTOS_PER_REQUEST);
          await photoService.addPhotosToAlbum(newAlbum.id, {
            photoIds: photoIdChunk,
          });
        }
      }

      setUploadProgress(100);
      setShowImmichBrowser(false);
      toast.dismiss('album-import');

      if (totalFailed > 0) {
        toast.error(
          `Imported album "${album.albumName}" with ${totalSuccessful} of ${assets.length} photos (${totalFailed} failed)`,
          { duration: 5000 }
        );
      } else {
        toast.success(
          `Successfully imported album "${album.albumName}" with ${totalSuccessful} photos!`
        );
      }
      onPhotoUploaded();
    } catch (err) {
      console.error("Failed to import album:", err);
      toast.dismiss('album-import');
      toast.error("Failed to import album");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleUpload = useCallback(async () => {
    if (selectedFiles.length === 0) return;

    // Abort any previous upload in progress
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        // Check if aborted before each upload
        if (controller.signal.aborted) return;

        const file = selectedFiles[i];
        await photoService.uploadPhoto(file, {
          tripId,
          caption: selectedFiles.length === 1 ? caption : undefined,
        }, { signal: controller.signal });

        if (!isMountedRef.current) return;
        setUploadProgress(((i + 1) / selectedFiles.length) * 100);
      }

      if (!isMountedRef.current) return;

      // Reset form
      setSelectedFiles([]);
      setCaption("");
      setUploadProgress(0);

      // Celebrate successful upload
      triggerConfetti('photo');

      onPhotoUploaded();
    } catch {
      if (!isMountedRef.current || controller.signal.aborted) return;
      alert("Failed to upload photos");
    } finally {
      if (isMountedRef.current) {
        setIsUploading(false);
      }
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [selectedFiles, tripId, caption, triggerConfetti, onPhotoUploaded]);

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Add Photos & Videos
          </h3>
          {immichConfigured && (
            <button
              onClick={() => setShowImmichBrowser(true)}
              disabled={isUploading}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-lg transition-colors text-sm disabled:cursor-not-allowed"
            >
              Browse Immich
            </button>
          )}
        </div>

        {/* Hidden file input for manual selection */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,.dng"
          multiple
          onChange={handleFileInputChange}
          className="hidden"
          aria-label="Select photos and videos to upload"
        />

        <div className="space-y-4">
          {/* Mobile Photo Source Picker - Shows on small screens */}
          <div className="md:hidden">
            <PhotoSourcePicker
              onFilesSelected={handleFilesDropped}
              multiple={true}
              disabled={isUploading}
            />
          </div>

          {/* Desktop Drag and Drop Upload - Shows on medium+ screens */}
          <div className="hidden md:block">
            <DragDropUpload
              onFilesSelected={handleFilesDropped}
              accept="image/*,video/*,.dng"
              multiple
              disabled={isUploading}
              text="Drag and drop photos or videos here"
              subtext="or click to browse from your computer"
            />
          </div>

          {selectedFiles.length > 0 && (
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {selectedFiles.length} file(s) ready to upload
              </p>
            </div>
          )}

          {/* Preview */}
          {selectedFiles.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {selectedFiles.map((file, index) => (
                <div key={index} className="relative aspect-square">
                  {file.type.startsWith('video/') ? (
                    <div className="w-full h-full bg-gray-900 rounded flex items-center justify-center relative">
                      <video
                        src={previewUrls[index] || ''}
                        className="w-full h-full object-cover rounded"
                        muted
                        aria-label={`Video preview ${index + 1}: ${file.name}`}
                      />
                      {/* Video indicator overlay */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="bg-black/50 rounded-full p-2">
                          <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <img
                      src={previewUrls[index] || ''}
                      alt={`Preview ${index + 1}`}
                      className="w-full h-full object-cover rounded"
                    />
                  )}
                  <button
                    onClick={() =>
                      setSelectedFiles(
                        selectedFiles.filter((_, i) => i !== index)
                      )
                    }
                    type="button"
                    aria-label={`Remove ${file.type.startsWith('video/') ? 'video' : 'photo'} ${index + 1}`}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-8 h-8 min-w-[44px] min-h-[44px] flex items-center justify-center text-sm hover:bg-red-600 shadow-md"
                    disabled={isUploading}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Caption (only for single upload) */}
          {selectedFiles.length === 1 && (
            <div>
              <label
                htmlFor="photo-upload-caption"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Caption
              </label>
              <textarea
                id="photo-upload-caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={2}
                className="input"
                placeholder="Add a caption\u2026"
                disabled={isUploading}
              />
            </div>
          )}

          {/* Upload Progress */}
          {isUploading && (
            <div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-[width]"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 text-center">
                Uploading... {Math.round(uploadProgress)}%
              </p>
            </div>
          )}

          {/* Upload Button */}
          <button
            onClick={handleSelectPhotosClick}
            disabled={isUploading}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
          >
            {isUploading
              ? "Uploading..."
              : selectedFiles.length > 0
              ? `Upload ${selectedFiles.length} Photo${
                  selectedFiles.length !== 1 ? "s" : ""
                }`
              : "Select Photos to Upload"}
          </button>
        </div>
      </div>

      {showImmichBrowser && (
        <ImmichBrowser
          onSelect={handleImmichSelect}
          onImportAlbum={handleImportAlbum}
          onClose={() => setShowImmichBrowser(false)}
          tripStartDate={tripStartDate}
          tripEndDate={tripEndDate}
          excludeAssetIds={existingImmichAssetIds}
        />
      )}

      {/* Global drag-and-drop overlay */}
      {isDraggingFiles && (
        <DragDropUpload
          onFilesSelected={handleFilesDropped}
          accept="image/*,video/*,.dng"
          multiple
          overlay
        />
      )}
    </>
  );
}
