import { useState, useEffect } from 'react';
import type { Photo } from '../types/photo';
import type { ImmichAsset } from '../types/immich';
import immichService from '../services/immich.service';

interface PhotoDetailsPanelProps {
  photo: Photo;
  isOpen: boolean;
  onClose: () => void;
}

interface DetailRowProps {
  label: string;
  value: string | number | null | undefined;
  icon?: React.ReactNode;
}

function DetailRow({ label, value, icon }: DetailRowProps) {
  if (value === null || value === undefined || value === '') return null;

  return (
    <div className="py-2 border-b border-white/10 last:border-b-0">
      <div className="text-white/60 text-xs uppercase tracking-wide mb-1 flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="text-white text-sm">{value}</div>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="text-white/80 font-medium text-sm mb-2 pb-1 border-b border-white/20">
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

export default function PhotoDetailsPanel({ photo, isOpen, onClose }: PhotoDetailsPanelProps) {
  const [immichData, setImmichData] = useState<ImmichAsset | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch Immich data when panel opens for Immich photos
  useEffect(() => {
    let isCancelled = false;

    if (isOpen && photo.source === 'immich' && photo.immichAssetId) {
      setLoading(true);
      setError(null);
      immichService
        .getAssetById(photo.immichAssetId)
        .then((data) => {
          if (!isCancelled) {
            setImmichData(data);
          }
        })
        .catch((err) => {
          if (!isCancelled) {
            console.error('Failed to fetch Immich asset:', err);
            setError('Failed to load photo details from Immich');
          }
        })
        .finally(() => {
          if (!isCancelled) {
            setLoading(false);
          }
        });
    } else {
      setImmichData(null);
    }

    return () => {
      isCancelled = true;
    };
  }, [isOpen, photo.id, photo.source, photo.immichAssetId]);

  // Format exposure time (e.g., "1/1000" or "1.5")
  const formatExposure = (exposure: string | undefined) => {
    if (!exposure) return null;
    return `${exposure}s`;
  };

  // Format aperture (e.g., "f/2.8")
  const formatAperture = (fNumber: number | undefined) => {
    if (!fNumber) return null;
    return `f/${fNumber}`;
  };

  // Format focal length (e.g., "35mm")
  const formatFocalLength = (focalLength: number | undefined) => {
    if (!focalLength) return null;
    return `${focalLength}mm`;
  };

  // Format coordinates
  const formatCoordinates = (lat: number | null, lng: number | null) => {
    if (lat === null || lng === null) return null;
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  };

  // Format date/time
  const formatDateTime = (dateStr: string | null | undefined) => {
    if (!dateStr) return null;
    try {
      const date = new Date(dateStr);
      return date.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return dateStr;
    }
  };

  const exif = immichData?.exifInfo;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 z-[101] transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Photo details"
        className={`fixed top-0 right-0 h-full w-80 max-w-[90vw] bg-gray-900 z-[102] shadow-2xl transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ overscrollBehavior: 'contain' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-white font-semibold flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Photo Details
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-white/60 hover:text-white p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded transition-colors"
            aria-label="Close details panel"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto h-[calc(100%-64px)]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-white/20 border-t-white"></div>
            </div>
          ) : error ? (
            <div className="text-red-400 text-sm py-4">{error}</div>
          ) : (
            <>
              {/* Basic Info */}
              <DetailSection title="Basic Information">
                <DetailRow
                  label="Caption"
                  value={photo.caption}
                  icon={
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                  }
                />
                <DetailRow
                  label="Date Taken"
                  value={formatDateTime(photo.takenAt || exif?.dateTimeOriginal)}
                  icon={
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  }
                />
                <DetailRow
                  label="Source"
                  value={photo.source === 'local' ? 'Uploaded' : 'Immich'}
                  icon={
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  }
                />
                {photo.location && (
                  <DetailRow
                    label="Linked Location"
                    value={photo.location.name}
                    icon={
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    }
                  />
                )}
              </DetailSection>

              {/* Camera Info (Immich photos) */}
              {exif && (exif.make || exif.model || exif.lensModel) && (
                <DetailSection title="Camera">
                  <DetailRow
                    label="Camera"
                    value={[exif.make, exif.model].filter(Boolean).join(' ')}
                    icon={
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    }
                  />
                  <DetailRow
                    label="Lens"
                    value={exif.lensModel}
                    icon={
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" strokeWidth={2} />
                        <circle cx="12" cy="12" r="6" strokeWidth={2} />
                        <circle cx="12" cy="12" r="2" strokeWidth={2} />
                      </svg>
                    }
                  />
                </DetailSection>
              )}

              {/* Exposure Settings (Immich photos) */}
              {exif && (exif.fNumber || exif.exposureTime || exif.iso || exif.focalLength) && (
                <DetailSection title="Exposure Settings">
                  <div className="grid grid-cols-2 gap-2">
                    {exif.fNumber && (
                      <div className="bg-white/5 rounded p-2 text-center">
                        <div className="text-white/60 text-xs mb-1">Aperture</div>
                        <div className="text-white font-medium">{formatAperture(exif.fNumber)}</div>
                      </div>
                    )}
                    {exif.exposureTime && (
                      <div className="bg-white/5 rounded p-2 text-center">
                        <div className="text-white/60 text-xs mb-1">Shutter</div>
                        <div className="text-white font-medium">{formatExposure(exif.exposureTime)}</div>
                      </div>
                    )}
                    {exif.iso && (
                      <div className="bg-white/5 rounded p-2 text-center">
                        <div className="text-white/60 text-xs mb-1">ISO</div>
                        <div className="text-white font-medium">{exif.iso}</div>
                      </div>
                    )}
                    {exif.focalLength && (
                      <div className="bg-white/5 rounded p-2 text-center">
                        <div className="text-white/60 text-xs mb-1">Focal Length</div>
                        <div className="text-white font-medium">{formatFocalLength(exif.focalLength)}</div>
                      </div>
                    )}
                  </div>
                </DetailSection>
              )}

              {/* Location Info */}
              {(photo.latitude !== null || exif?.latitude || exif?.city) && (
                <DetailSection title="Location">
                  {(exif?.city || exif?.state || exif?.country) && (
                    <DetailRow
                      label="Place"
                      value={[exif.city, exif.state, exif.country].filter(Boolean).join(', ')}
                      icon={
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      }
                    />
                  )}
                  <DetailRow
                    label="Coordinates"
                    value={formatCoordinates(
                      photo.latitude ?? exif?.latitude ?? null,
                      photo.longitude ?? exif?.longitude ?? null
                    )}
                    icon={
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      </svg>
                    }
                  />
                </DetailSection>
              )}

              {/* File Info (Immich photos) */}
              {immichData && (
                <DetailSection title="File">
                  <DetailRow
                    label="Filename"
                    value={immichData.originalFileName}
                    icon={
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    }
                  />
                  <DetailRow
                    label="Type"
                    value={immichData.type}
                    icon={
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                    }
                  />
                  <DetailRow
                    label="Created"
                    value={formatDateTime(immichData.fileCreatedAt)}
                    icon={
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    }
                  />
                </DetailSection>
              )}

              {/* No EXIF data message for local photos */}
              {photo.source === 'local' && (
                <div className="text-white/40 text-xs text-center py-4 mt-4 border-t border-white/10">
                  <svg className="w-8 h-8 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  EXIF data is only available for photos from Immich
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
