import { useId } from 'react';

interface BookingFieldsProps {
  bookingUrl: string;
  confirmationNumber: string;
  onBookingUrlChange: (value: string) => void;
  onConfirmationNumberChange: (value: string) => void;
  bookingUrlLabel?: string;
  confirmationLabel?: string;
  hideBookingUrl?: boolean;
}

/**
 * Reusable booking URL and confirmation number input field pair
 * Used in Activity, Lodging, Transportation managers
 */
export default function BookingFields({
  bookingUrl,
  confirmationNumber,
  onBookingUrlChange,
  onConfirmationNumberChange,
  bookingUrlLabel = 'Booking URL',
  confirmationLabel = 'Confirmation Number',
  hideBookingUrl = false,
}: BookingFieldsProps) {
  const urlFieldId = useId();
  const confirmationFieldId = useId();

  if (hideBookingUrl) {
    // Only show confirmation number field
    return (
      <div>
        <label
          htmlFor={confirmationFieldId}
          className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
        >
          {confirmationLabel}
        </label>
        <input
          type="text"
          id={confirmationFieldId}
          value={confirmationNumber}
          onChange={(e) => onConfirmationNumberChange(e.target.value)}
          className="input"
          placeholder="ABC123"
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label
          htmlFor={urlFieldId}
          className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
        >
          {bookingUrlLabel}
        </label>
        <input
          type="url"
          id={urlFieldId}
          value={bookingUrl}
          onChange={(e) => onBookingUrlChange(e.target.value)}
          className="input"
          placeholder="https://example.com/booking"
        />
      </div>

      <div>
        <label
          htmlFor={confirmationFieldId}
          className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
        >
          {confirmationLabel}
        </label>
        <input
          type="text"
          id={confirmationFieldId}
          value={confirmationNumber}
          onChange={(e) => onConfirmationNumberChange(e.target.value)}
          className="input"
          placeholder="ABC123"
        />
      </div>
    </div>
  );
}
