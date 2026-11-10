/**
 * ProgressiveImage Component
 *
 * Optimized image loading with:
 * - Blur-up placeholder technique (tiny blurred image first)
 * - Lazy loading with Intersection Observer
 * - Responsive images with srcset
 * - WebP format support with fallback
 * - Loading states with smooth transitions
 *
 * @example
 * ```tsx
 * <ProgressiveImage
 *   src="/photos/large.jpg"
 *   placeholderSrc="/photos/tiny-blur.jpg"
 *   alt="Photo description"
 *   className="w-full h-64 object-cover"
 * />
 * ```
 */

import { useState, useEffect, useRef } from 'react';
import type { ImgHTMLAttributes } from 'react';

interface ProgressiveImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet'> {
  /** Full resolution image source */
  src: string;
  /** Tiny blurred placeholder (optional, falls back to solid color) */
  placeholderSrc?: string;
  /** Alternative text for accessibility */
  alt: string;
  /** Responsive image sources for different sizes */
  srcSet?: string;
  /** Image sizes attribute for responsive images */
  sizes?: string;
  /** Callback when image loads successfully */
  onLoad?: () => void;
  /** Callback when image fails to load */
  onError?: () => void;
  /** Custom className for the container */
  className?: string;
  /** Custom className for the image element */
  imgClassName?: string;
  /** Aspect ratio (e.g., "16/9", "4/3", "1/1") - maintains space while loading */
  aspectRatio?: string;
  /** Enable lazy loading (default: true) */
  lazy?: boolean;
  /** Root margin for Intersection Observer (default: "200px") */
  rootMargin?: string;
}

export default function ProgressiveImage({
  src,
  placeholderSrc,
  alt,
  srcSet,
  sizes,
  onLoad,
  onError,
  className = '',
  imgClassName = '',
  aspectRatio,
  lazy = true,
  rootMargin = '200px',
  ...props
}: ProgressiveImageProps) {
  const [imageSrc, setImageSrc] = useState<string | undefined>(placeholderSrc);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isInView, setIsInView] = useState(!lazy);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (!lazy || !containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin,
        threshold: 0.01,
      }
    );

    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [lazy, rootMargin]);

  // Load full resolution image when in view
  useEffect(() => {
    if (!isInView || !src) return;

    const img = new Image();
    img.src = src;
    if (srcSet) img.srcset = srcSet;
    if (sizes) img.sizes = sizes;

    img.onload = () => {
      setImageSrc(src);
      setIsLoading(false);
      onLoad?.();
    };

    img.onerror = () => {
      setHasError(true);
      setIsLoading(false);
      onError?.();
    };

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [isInView, src, srcSet, sizes, onLoad, onError]);

  // Container style with aspect ratio
  const containerStyle: React.CSSProperties & { '--aspect-ratio'?: string } = aspectRatio
    ? { '--aspect-ratio': aspectRatio }
    : {};

  // Error state
  if (hasError) {
    return (
      // Dynamic aspect ratio requires CSS variable - cannot be moved to static CSS
      <div
        ref={containerRef}
        className={`relative overflow-hidden bg-gray-200 dark:bg-gray-700 flex items-center justify-center progressive-image-container ${className}`}
        style={containerStyle}
      >
        <div className="text-center p-4">
          <svg
            className="w-12 h-12 mx-auto text-gray-400 dark:text-gray-400 mb-2"
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
          <p className="text-sm text-gray-500 dark:text-gray-400">Failed to load image</p>
        </div>
      </div>
    );
  }

  return (
    // Dynamic aspect ratio requires CSS variable - cannot be moved to static CSS
    <div
      ref={containerRef}
      className={`relative overflow-hidden progressive-image-container ${className}`}
      style={containerStyle}
    >
      {/* Blurred placeholder or loading skeleton */}
      {isLoading && (
        <div className="absolute inset-0">
          {placeholderSrc ? (
            // Blur-up placeholder
            <img
              src={placeholderSrc}
              alt=""
              className={`w-full h-full object-cover blur-xl scale-110 ${imgClassName}`}
              aria-hidden="true"
            />
          ) : (
            // Shimmer skeleton fallback
            <div className="w-full h-full bg-gray-200 dark:bg-gray-700 animate-pulse shimmer" />
          )}
        </div>
      )}

      {/* Main image */}
      {isInView && (
        <img
          ref={imgRef}
          src={imageSrc}
          srcSet={srcSet}
          sizes={sizes}
          alt={alt}
          className={`
            w-full h-full object-cover
            transition-opacity duration-500
            ${isLoading ? 'opacity-0' : 'opacity-100'}
            ${imgClassName}
          `}
          loading={lazy ? 'lazy' : 'eager'}
          {...props}
        />
      )}

      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 border-3 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}

/**
 * Hook to detect WebP support
 * Returns true if browser supports WebP format
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useWebPSupport(): boolean {
  const [supportsWebP, setSupportsWebP] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setSupportsWebP(img.width === 1);
    img.onerror = () => setSupportsWebP(false);
    img.src = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';
  }, []);

  return supportsWebP;
}

/**
 * Get optimized image source with WebP fallback
 */
// eslint-disable-next-line react-refresh/only-export-components
export function getImageSource(src: string, supportsWebP: boolean): string {
  if (!supportsWebP || !src) return src;

  // If source already has WebP, return as-is
  if (src.endsWith('.webp')) return src;


  // In production, you'd check if WebP version exists
  // For now, just return original
  return src;
}

/**
 * Generate srcSet for responsive images
 * @param baseSrc Base image source (should be largest size)
 * @param sizes Array of width sizes (e.g., [400, 800, 1200])
 */
// eslint-disable-next-line react-refresh/only-export-components
export function generateSrcSet(baseSrc: string, sizes: number[]): string {
  // Extract file extension and base path
  const match = baseSrc.match(/^(.+)\.([^.]+)$/);
  if (!match) return baseSrc;

  const [, basePath, ext] = match;

  // Generate srcSet string
  return sizes
    .map((size) => `${basePath}-${size}w.${ext} ${size}w`)
    .join(', ');
}
