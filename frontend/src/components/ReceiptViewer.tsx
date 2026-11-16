import { useEffect } from "react";
import { getFullAssetUrl } from "../lib/config";

interface ReceiptViewerProps {
  /** Stored receipt path from the expense. */
  path: string;
  title: string;
  onClose: () => void;
}

/**
 * Full-size view of an expense's receipt photo. The image is requested with the
 * user's session, so only people who can see the trip can load it. Render this
 * at the top level of a component, never inside a menu that unmounts on click.
 */
export default function ReceiptViewer({ path, title, onClose }: ReceiptViewerProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Receipt for ${title}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-lg bg-white/90 px-3 py-2 text-sm font-medium text-charcoal"
      >
        Close
      </button>
      <img
        src={getFullAssetUrl(path) ?? undefined}
        alt={`Receipt for ${title}`}
        className="max-h-full max-w-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
