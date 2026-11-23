/**
 * CameraCapture Component
 *
 * Provides camera integration for mobile devices
 * Allows users to capture photos directly from their device camera
 */

import { useRef, useState } from 'react';
import Icon from './ui/Icon';

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
          <Icon name="camera" />
        ) : (
          <Icon name="photo" />
        )}
        {isCapturing ? 'Opening…' : buttonText}
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
          <Icon name="spinner" size={24} className="animate-spin" />
        ) : (
          <Icon name="camera" size={28} />
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
          <Icon name="camera" size={40} className="text-primary-600 dark:text-sky" />
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
          <Icon name="photo" size={40} className="text-primary-600 dark:text-sky" />
          <span className="text-sm font-medium text-gray-700 dark:text-dusk-300">
            Choose from Gallery
          </span>
        </button>
      </div>
    </div>
  );
}
