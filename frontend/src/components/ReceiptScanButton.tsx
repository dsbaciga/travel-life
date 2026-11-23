import { useRef, useState } from "react";
import toast from "react-hot-toast";
import receiptScanService, { type ReceiptScanResult } from "../services/receiptScan.service";

interface ReceiptScanButtonProps {
  tripId: number;
  disabled?: boolean;
  /** `file` is the scanned photo, for attaching to the expense once it is saved. */
  onScanned: (result: ReceiptScanResult, file: File) => void;
}

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const message = (error as { response?: { data?: { message?: unknown } } }).response?.data?.message;
    if (typeof message === "string" && message) return message;
  }
  return "Could not scan the receipt. You can enter the expense by hand.";
}

/** Small marker shown beside a form field whose value was read from a receipt. */
export function ScanBadge({ detail }: { detail?: string }) {
  return (
    <span
      className="ml-2 inline-block rounded-full bg-gold/20 px-2 py-0.5 text-xs font-medium text-charcoal dark:text-warm-gray"
      data-testid="scan-badge"
    >
      From receipt{detail ? `: ${detail}` : ""}
    </span>
  );
}

/**
 * "Scan receipt": opens the camera on a phone (capture="environment") and the
 * file picker on desktop, sends the photo for extraction, and hands the
 * result to `onScanned`. It never saves anything itself.
 */
export default function ReceiptScanButton({ tripId, disabled, onScanned }: ReceiptScanButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // A ref, not state: two quick selections must not both start a request.
  const inFlight = useRef(false);
  const [isScanning, setIsScanning] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so choosing the same photo again still fires onChange.
    e.target.value = "";
    if (!file || inFlight.current) return;

    inFlight.current = true;
    setIsScanning(true);
    try {
      const result = await receiptScanService.scanReceipt(tripId, file);
      onScanned(result, file);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      inFlight.current = false;
      setIsScanning(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid="receipt-scan-input"
        aria-label="Receipt photo"
        onChange={handleChange}
      />
      <button
        type="button"
        className="btn-secondary"
        disabled={disabled || isScanning}
        aria-busy={isScanning}
        onClick={() => inputRef.current?.click()}
      >
        {isScanning ? "Reading receipt…" : "Scan Receipt"}
      </button>
    </>
  );
}
