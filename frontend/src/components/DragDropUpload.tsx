/**
 * DragDropUpload Component
 *
 * Provides drag-and-drop file upload functionality with visual feedback.
 * Can be used as a dropzone or as a full-page overlay.
 *
 * Features:
 * - Drag and drop files to upload
 * - Visual feedback during drag operations
 * - File type validation
 * - Multiple file upload support
 * - Click to browse fallback
 * - Dark mode support
 *
 * @example
 * ```tsx
 * <DragDropUpload
 *   onFilesSelected={(files) => handleUpload(files)}
 *   accept="image/*"
 *   multiple
 * />
 * ```
 */

import { useRef, useState, type DragEvent } from "react";
import Icon from "./ui/Icon";

interface DragDropUploadProps {
  /** Callback when files are selected */
  onFilesSelected: (files: File[]) => void;
  /** Accepted file types (e.g., "image/*", ".jpg,.png") */
  accept?: string;
  /** Allow multiple files */
  multiple?: boolean;
  /** Maximum file size in bytes */
  maxSize?: number;
  /** Custom className for the dropzone */
  className?: string;
  /** Show as overlay (covers entire viewport) */
  overlay?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Custom text to display */
  text?: string;
  /** Custom subtext */
  subtext?: string;
}

export default function DragDropUpload({
  onFilesSelected,
  accept = "image/*",
  multiple = true,
  maxSize,
  className = "",
  overlay = false,
  disabled = false,
  text = "Drag and drop files here",
  subtext = "or click to browse",
}: DragDropUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const validateFiles = (files: FileList | File[]): File[] | null => {
    const fileArray = Array.from(files);

    // Check file size
    if (maxSize) {
      const oversizedFile = fileArray.find((file) => file.size > maxSize);
      if (oversizedFile) {
        setError(
          `File "${oversizedFile.name}" is too large. Max size: ${(
            maxSize /
            1024 /
            1024
          ).toFixed(1)}MB`
        );
        return null;
      }
    }

    // Check file type
    if (accept && accept !== "*") {
      const acceptTypes = accept.split(",").map((t) => t.trim().toLowerCase());
      const invalidFile = fileArray.find((file) => {
        const fileName = file.name.toLowerCase();
        const fileType = file.type.toLowerCase();

        return !acceptTypes.some((acceptType) => {
          if (acceptType.startsWith(".")) {
            // Extension check
            return fileName.endsWith(acceptType);
          } else if (acceptType.includes("*")) {
            // MIME type wildcard check (e.g., "image/*")
            const baseType = acceptType.split("/")[0];
            return fileType.startsWith(baseType);
          } else {
            // Exact MIME type check
            return fileType === acceptType;
          }
        });
      });

      if (invalidFile) {
        setError(
          `File "${invalidFile.name}" is not an accepted type. Accepted: ${accept}`
        );
        return null;
      }
    }

    setError(null);
    return fileArray;
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (disabled) return;

    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (disabled) return;

    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (disabled) return;

    setIsDragging(false);
    dragCounterRef.current = 0;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const validatedFiles = validateFiles(files);
      if (validatedFiles) {
        onFilesSelected(validatedFiles);
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const validatedFiles = validateFiles(files);
      if (validatedFiles) {
        onFilesSelected(validatedFiles);
      }
    }

    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClick = () => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  };

  if (overlay) {
    if (!isDragging) return null;

    return (
      <div
        className="fixed inset-0 z-[200] bg-primary-500/90 dark:bg-accent-500/90 backdrop-blur-sm flex items-center justify-center animate-fade-in"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="text-center text-white p-12 border-4 border-dashed border-white rounded-3xl max-w-2xl mx-4 bg-white/10">
          <div className="flex justify-center mb-6 animate-bounce-slow"><Icon name="cloudUpload" size={96} /></div>
          <h2 className="text-4xl font-display font-bold mb-2">
            Drop to Upload
          </h2>
          <p className="text-xl opacity-90">Release to upload your files</p>
        </div>
      </div>
    );
  }

  // Regular dropzone mode
  return (
    <div className={className}>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleFileInputChange}
        className="hidden"
        disabled={disabled}
        aria-label="Upload files"
      />

      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); } }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`
          relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer
          transition-colors duration-300
          ${
            isDragging
              ? "border-primary-500 dark:border-accent-400 bg-primary-50 dark:bg-accent-900/20 scale-105"
              : "border-gray-300 dark:border-dusk-600 hover:border-primary-400 dark:hover:border-accent-500 hover:bg-gray-50 dark:hover:bg-dusk-800/50"
          }
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}
        `}
      >
        {isDragging ? (
          <div className="animate-scale-in">
            <div className="flex justify-center mb-4 text-primary-500 dark:text-accent-400 animate-bounce-slow"><Icon name="cloudUpload" size={64} /></div>
            <p className="text-lg font-semibold text-primary-600 dark:text-accent-400">
              Drop files here
            </p>
          </div>
        ) : (
          <>
            <div className="flex justify-center mb-4 text-gray-400 dark:text-dusk-400"><Icon name="cloudUpload" size={64} /></div>
            <p className="text-lg font-medium text-gray-700 dark:text-dusk-300 mb-2">
              {text}
            </p>
            <p className="text-sm text-gray-500 dark:text-dusk-400">
              {subtext}
            </p>
            {maxSize && (
              <p className="text-xs text-gray-400 dark:text-dusk-400 mt-2">
                Max file size: {(maxSize / 1024 / 1024).toFixed(1)}MB
              </p>
            )}
          </>
        )}

        {error && (
          <div className="absolute bottom-4 left-4 right-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
