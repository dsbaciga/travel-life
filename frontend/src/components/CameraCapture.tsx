/**
 * CameraCapture Component
 *
 * Provides camera integration for mobile devices
 * Allows users to capture photos directly from their device camera
 */

import { useRef, useState } from 'react';

interface CameraCaptureProps {
  onPhotosCapture: (files: File[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
  buttonText?: string;
  mode?: 'camera' | 'both'; // 'camera' = camera only, 'both' = camera or gallery
}

export default function CameraCapture({
  onPhotosCapture,
  multiple = true,
  disabled = false,
  className = '',
  buttonText = 'Take Photo',
  mode = 'camera',
}: CameraCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onPhotosCapture(files);
    }
    setIsCapturing(false);

    // Reset input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClick = () => {
    setIsCapturing(true);
    fileInputRef.current?.click();
  };

  // Determine if we should show camera icon or photo library icon
  const isCameraMode = mode === 'camera';

  return (
    <div className={className}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        capture={isCameraMode ? 'environment' : undefined}
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled}
      />
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || isCapturing}
        className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-primary-600 dark:bg-sky hover:bg-primary-700 dark:hover:bg-sky/90 text-white font-medium rounded-lg shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
      >
        {isCameraMode ? (
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        ) : (
          <svg
            className="w-5 h-5"
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
        )}
        {isCapturing ? 'Opening...' : buttonText}
      </button>
    </div>
  );
}

/**
 * CameraQuickCapture Component
 *
 * Floating action button style camera capture for quick access
 */

interface CameraQuickCaptureProps {
  onPhotosCapture: (files: File[]) => void;
  position?: 'bottom-right' | 'bottom-left' | 'bottom-center';
  offset?: string;
}

export function CameraQuickCapture({
  onPhotosCapture,
  position = 'bottom-right',
  offset = '6rem',
}: CameraQuickCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onPhotosCapture(files);
    }
    setIsCapturing(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClick = () => {
    setIsCapturing(true);
    fileInputRef.current?.click();
  };

  const positionClasses = {
    'bottom-right': 'bottom-0 right-0',
    'bottom-left': 'bottom-0 left-0',
    'bottom-center': 'bottom-0 left-1/2 -translate-x-1/2',
  };

  return (
    <div
      className={`md:hidden fixed ${positionClasses[position]} z-40`}
      style={{
        [position.startsWith('bottom') ? 'bottom' : 'top']: offset,
        [position.includes('right') ? 'right' : position.includes('left') ? 'left' : 'left']:
          position.includes('center') ? '50%' : '1rem',
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
      />
      <button
        type="button"
        onClick={handleClick}
        disabled={isCapturing}
        className="flex items-center justify-center w-14 h-14 bg-accent-500 dark:bg-accent-600 text-white rounded-full shadow-lg hover:shadow-xl hover:scale-110 active:scale-95 transition-all duration-200 disabled:opacity-50"
        aria-label="Quick camera capture"
      >
        {isCapturing ? (
          <svg
            className="w-6 h-6 animate-spin"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        ) : (
          <svg
            className="w-7 h-7"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        )}
      </button>
    </div>
  );
}

/**
 * PhotoSourcePicker Component
 *
 * Allows users to choose between camera, gallery, or drag & drop
 */

interface PhotoSourcePickerProps {
  onFilesSelected: (files: File[]) => void;
  multiple?: boolean;
  disabled?: boolean;
}

export function PhotoSourcePicker({
  onFilesSelected,
  multiple = true,
  disabled = false,
}: PhotoSourcePickerProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onFilesSelected(files);
    }

    // Reset input
    if (e.target) {
      e.target.value = '';
    }
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Camera Capture */}
      <div>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          multiple={multiple}
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled}
        />
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          disabled={disabled}
          className="w-full h-32 flex flex-col items-center justify-center gap-3 bg-white dark:bg-navy-800 border-2 border-dashed border-primary-300 dark:border-sky/30 rounded-xl hover:border-primary-500 dark:hover:border-sky hover:bg-primary-50 dark:hover:bg-navy-900/50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg
            className="w-10 h-10 text-primary-600 dark:text-sky"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <span className="text-sm font-medium text-gray-700 dark:text-dusk-300">
            Take Photo
          </span>
        </button>
      </div>

      {/* Gallery Selection */}
      <div>
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          multiple={multiple}
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled}
        />
        <button
          type="button"
          onClick={() => galleryInputRef.current?.click()}
          disabled={disabled}
          className="w-full h-32 flex flex-col items-center justify-center gap-3 bg-white dark:bg-navy-800 border-2 border-dashed border-primary-300 dark:border-sky/30 rounded-xl hover:border-primary-500 dark:hover:border-sky hover:bg-primary-50 dark:hover:bg-navy-900/50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg
            className="w-10 h-10 text-primary-600 dark:text-sky"
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
          <span className="text-sm font-medium text-gray-700 dark:text-dusk-300">
            Choose from Gallery
          </span>
        </button>
      </div>
    </div>
  );
}
