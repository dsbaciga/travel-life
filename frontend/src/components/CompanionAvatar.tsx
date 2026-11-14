import { useState, useRef, useEffect } from "react";
import companionService from "../services/companion.service";
import { getAccessToken } from "../lib/axios";
import toast from "react-hot-toast";
import type { Companion } from "../types/companion";
import { getFullAssetUrl } from "../lib/config";
import { useDropdownPosition } from "../hooks/useDropdownPosition";

interface CompanionAvatarProps {
  companion: Companion;
  size?: "sm" | "md" | "lg";
  editable?: boolean;
  onUpdate?: (companion: Companion) => void;
  showImmichOption?: boolean;
  onOpenImmichBrowser?: () => void;
}

const sizeClasses = {
  sm: "w-8 h-8 text-sm",
  md: "w-12 h-12 text-lg",
  lg: "w-20 h-20 text-2xl",
};

export default function CompanionAvatar({
  companion,
  size = "md",
  editable = false,
  onUpdate,
  showImmichOption = false,
  onOpenImmichBrowser,
}: CompanionAvatarProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarBlobUrl, setAvatarBlobUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Use dropdown position hook for optimal menu placement
  const { triggerRef, position } = useDropdownPosition<HTMLButtonElement>({
    isOpen: showMenu,
    dropdownHeight: 150, // Approximate height of menu
    dropdownWidth: 160,
    viewportPadding: 16,
  });

  // Load avatar with auth token if it's an Immich URL
  useEffect(() => {
    const loadAvatar = async () => {
      if (!companion.avatarUrl) {
        setAvatarBlobUrl(null);
        return;
      }

      // If it's an Immich URL, fetch with auth
      if (companion.avatarUrl.includes("/api/immich/")) {
        try {
          const fullUrl = getFullAssetUrl(companion.avatarUrl);
          if (!fullUrl) return;

          const accessToken = getAccessToken();
          const response = await fetch(fullUrl, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });
          if (response.ok) {
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            setAvatarBlobUrl(blobUrl);
          }
        } catch {
          setAvatarBlobUrl(null);
        }
      } else {
        // Local upload - use direct URL
        setAvatarBlobUrl(getFullAssetUrl(companion.avatarUrl));
      }
    };

    loadAvatar();
    // Cleanup is handled in a separate effect to avoid stale closure
  }, [companion.avatarUrl]);

  // Cleanup blob URL when component unmounts or avatar changes
  useEffect(() => {
    const currentBlobUrl = avatarBlobUrl;
    return () => {
      if (currentBlobUrl && currentBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(currentBlobUrl);
      }
    };
  }, [avatarBlobUrl]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target;
      const clickedInside =
        target instanceof Node && menuRef.current?.contains(target);
      if (menuRef.current && !clickedInside) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showMenu]);

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be less than 5MB");
      return;
    }

    setUploading(true);
    try {
      const updated = await companionService.uploadAvatar(companion.id, file);
      toast.success("Avatar updated");
      onUpdate?.(updated);
    } catch {
      toast.error("Failed to upload avatar");
    } finally {
      setUploading(false);
      setShowMenu(false);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDeleteAvatar = async () => {
    try {
      const updated = await companionService.deleteAvatar(companion.id);
      toast.success("Avatar removed");
      onUpdate?.(updated);
    } catch {
      toast.error("Failed to remove avatar");
    }
    setShowMenu(false);
  };

  const handleImmichSelect = () => {
    setShowMenu(false);
    onOpenImmichBrowser?.();
  };

  const getInitials = () => {
    // The "Myself" companion is stored as `Myself (username)`, which would
    // otherwise initialise to "M(".
    if (companion.isMyself) {
      return "Me";
    }
    const parts = companion.name.split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return companion.name.slice(0, 2).toUpperCase();
  };

  const avatarContent = avatarBlobUrl ? (
    <img
      src={avatarBlobUrl}
      alt={companion.name}
      className="w-full h-full object-cover"
    />
  ) : (
    <span
      className={
        companion.isMyself
          ? "text-blue-600 dark:text-blue-400"
          : "text-gray-600 dark:text-dusk-400"
      }
    >
      {getInitials()}
    </span>
  );

  // Build position classes based on calculated position
  const verticalClass = position.openUpward ? "bottom-full mb-1" : "top-full mt-1";
  const horizontalClass = position.alignRight ? "right-0" : "left-0";

  return (
    <div className="relative" ref={menuRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => editable && setShowMenu(!showMenu)}
        disabled={!editable || uploading}
        className={`
          ${sizeClasses[size]}
          rounded-full overflow-hidden flex items-center justify-center
          ${
            companion.isMyself && !avatarBlobUrl
              ? "bg-blue-100 dark:bg-blue-900"
              : "bg-gray-200 dark:bg-dusk-700"
          }
          ${
            editable
              ? "cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
              : "cursor-default"
          }
          ${uploading ? "opacity-50" : ""}
        `}
      >
        {uploading ? (
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-500 border-t-transparent" />
        ) : (
          avatarContent
        )}
      </button>

      {editable && showMenu && (
        <div className={`absolute ${verticalClass} ${horizontalClass} bg-white dark:bg-dusk-800 rounded-lg shadow-lg border border-gray-200 dark:border-dusk-700 py-1 z-20 min-w-[160px]`}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-dusk-300 hover:bg-gray-100 dark:hover:bg-dusk-700 flex items-center gap-2"
          >
            <svg
              className="w-4 h-4"
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
            Upload Photo
          </button>

          {showImmichOption && (
            <button
              type="button"
              onClick={handleImmichSelect}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-dusk-300 hover:bg-gray-100 dark:hover:bg-dusk-700 flex items-center gap-2"
            >
              <svg
                className="w-4 h-4"
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
              Choose from Immich
            </button>
          )}

          {companion.avatarUrl && (
            <button
              type="button"
              onClick={handleDeleteAvatar}
              className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Remove Avatar
            </button>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        aria-label="Upload avatar image"
      />
    </div>
  );
}
