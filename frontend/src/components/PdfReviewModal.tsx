import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import toast from 'react-hot-toast';
import Modal from './Modal';
import LoadingSpinner from './LoadingSpinner';
import { usePdfImportPolling } from '../hooks/usePdfImportPolling';
import pdfImportService from '../services/pdfImport.service';
import tripService from '../services/trip.service';
import type { PendingEntity } from '../types/pdfImport';

interface Props {
  isOpen: boolean;
  importId: number;
  onClose: () => void;
  onComplete: () => void;
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  TRANSPORTATION: 'Transportation',
  LODGING: 'Lodging',
  ACTIVITY: 'Activity',
  LOCATION: 'Location',
};

// Fields to show for each entity type (ordered display)
const ENTITY_FIELDS: Record<string, string[]> = {
  TRANSPORTATION: ['type', 'carrier', 'vehicleNumber', 'fromLocationName', 'toLocationName', 'departureTime', 'arrivalTime', 'confirmationNumber', 'notes'],
  LODGING: ['type', 'name', 'address', 'checkInDate', 'checkOutDate', 'confirmationNumber', 'notes'],
  ACTIVITY: ['name', 'description', 'startTime', 'endTime', 'bookingReference', 'notes'],
  LOCATION: ['name', 'address'],
};

export default function PdfReviewModal({ isOpen, importId, onClose, onComplete }: Props) {
  const queryClient = useQueryClient();
  const { data: importData, timedOut } = usePdfImportPolling(importId);
  const [entities, setEntities] = useState<PendingEntity[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editedData, setEditedData] = useState<Record<string, unknown>>({});
  const [selectedTripId, setSelectedTripId] = useState<number | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reparsing, setReparsing] = useState(false);
  // Guard: prevents reloading entity list mid-review (e.g. on window focus refetch)
  const entitiesLoadedRef = useRef(false);

  const { data: tripsData } = useQuery({
    queryKey: ['trips'],
    queryFn: () => tripService.getTrips(),
  });

  const trips = tripsData?.trips ?? [];

  // Load entities once parsed — guarded so mid-review refetches don't reset progress
  useEffect(() => {
    if (importData?.status === 'PARSED' && !entitiesLoadedRef.current) {
      entitiesLoadedRef.current = true;
      pdfImportService.getPendingEntities({ pdfImportId: importId, status: 'PENDING' }).then((data) => {
        setEntities(data);
        if (data[0]) {
          setEditedData(data[0].parsedData as Record<string, unknown>);
          setSelectedTripId(data[0].matchedTripId ?? undefined);
        }
      });
    }
  }, [importData?.status, importId]);

  const currentEntity = entities[currentIndex];

  const advance = (skipped = false) => {
    const next = currentIndex + 1;
    if (next >= entities.length) {
      if (skipped && next === entities.length) {
        toast('All entities reviewed', { icon: '✓' });
      }
      onComplete();
    } else {
      setCurrentIndex(next);
      setEditedData(entities[next].parsedData as Record<string, unknown>);
      setSelectedTripId(entities[next].matchedTripId ?? undefined);
    }
  };

  const handleAccept = async () => {
    if (!currentEntity || !selectedTripId) {
      toast.error('Please select a trip');
      return;
    }
    setIsSubmitting(true);
    try {
      await pdfImportService.acceptPendingEntity(currentEntity.id, selectedTripId, editedData);
      toast.success(`${ENTITY_TYPE_LABELS[currentEntity.entityType]} added to trip`);
      queryClient.invalidateQueries({ queryKey: ['pendingCount'] });
      advance();
    } catch {
      toast.error('Failed to add entity');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!currentEntity) return;
    setIsSubmitting(true);
    try {
      await pdfImportService.rejectPendingEntity(currentEntity.id);
      queryClient.invalidateQueries({ queryKey: ['pendingCount'] });
      advance();
    } catch {
      toast.error('Failed to reject entity');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReparse = async () => {
    setReparsing(true);
    try {
      await pdfImportService.reparseImport(importId);
      // Reset review state so entities reload after reparse
      entitiesLoadedRef.current = false;
      setEntities([]);
      setCurrentIndex(0);
      setEditedData({});
      setSelectedTripId(undefined);
      queryClient.invalidateQueries({ queryKey: ['pdfImport', importId] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to reparse';
      toast.error(message);
    } finally {
      setReparsing(false);
    }
  };

  // Polling timed out without reaching a terminal status — background job likely crashed
  if (timedOut && importData && (importData.status === 'UPLOADED' || importData.status === 'PARSING')) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Processing Timed Out" maxWidth="md">
        <div className="py-4 space-y-3">
          <p className="text-sm text-red-600 dark:text-red-400">
            PDF processing has taken longer than expected and may have stalled.
          </p>
          <p className="text-sm text-stone-600 dark:text-dusk-400">
            You can try parsing again or close this dialog.
          </p>
        </div>
        <div className="mt-4 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-stone-300 dark:border-dusk-600 rounded-lg text-stone-700 dark:text-dusk-300 hover:bg-stone-50 dark:hover:bg-dusk-700"
          >
            Close
          </button>
          <button
            onClick={handleReparse}
            disabled={reparsing}
            className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-50"
          >
            {reparsing ? 'Starting...' : 'Try Again'}
          </button>
        </div>
      </Modal>
    );
  }

  // Status: PARSING or UPLOADED
  if (!importData || importData.status === 'UPLOADED' || importData.status === 'PARSING') {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Processing PDF" maxWidth="md">
        <div className="flex flex-col items-center py-8 gap-4">
          <LoadingSpinner />
          <p className="text-sm text-stone-600 dark:text-dusk-400">
            Extracting travel details from your PDF...
          </p>
        </div>
      </Modal>
    );
  }

  // Status: PARSE_FAILED
  if (importData.status === 'PARSE_FAILED') {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Processing Failed" maxWidth="md">
        <div className="py-4 space-y-3">
          <p className="text-sm text-red-600 dark:text-red-400">
            {importData.errorMessage || 'Failed to extract entities from the PDF.'}
          </p>
          <p className="text-sm text-stone-600 dark:text-dusk-400">
            You can try parsing again or close this dialog.
          </p>
        </div>
        <div className="mt-4 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-stone-300 dark:border-dusk-600 rounded-lg text-stone-700 dark:text-dusk-300 hover:bg-stone-50 dark:hover:bg-dusk-700"
          >
            Close
          </button>
          <button
            onClick={handleReparse}
            disabled={reparsing}
            className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-50"
          >
            {reparsing ? 'Starting...' : 'Try Again'}
          </button>
        </div>
      </Modal>
    );
  }

  // Status: NO_ENTITIES
  if (importData.status === 'NO_ENTITIES') {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="No Entities Found" maxWidth="md">
        <div className="py-4">
          <p className="text-sm text-stone-600 dark:text-dusk-400">
            No travel entities were found in this PDF. The document may not contain recognizable booking information.
          </p>
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded-lg">
            Close
          </button>
        </div>
      </Modal>
    );
  }

  // Status: PARSED but no entities loaded yet
  if (entities.length === 0) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Review Extracted Entities" maxWidth="lg">
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      </Modal>
    );
  }

  // All entities done
  if (currentIndex >= entities.length) {
    return null;
  }

  const noTrips = trips.length === 0;
  const fields = ENTITY_FIELDS[currentEntity.entityType] ?? Object.keys(currentEntity.parsedData);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Review Extracted Entities" maxWidth="lg">
      {/* Progress */}
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs text-stone-500 dark:text-dusk-400 font-medium uppercase tracking-wide">
          {ENTITY_TYPE_LABELS[currentEntity.entityType]}
        </span>
        <span className="text-xs text-stone-500 dark:text-dusk-400">
          {currentIndex + 1} of {entities.length}
        </span>
      </div>

      {/* Confidence badge */}
      <div className="mb-4">
        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
          currentEntity.confidence >= 0.85
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : currentEntity.confidence >= 0.6
            ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
        }`}>
          {Math.round(currentEntity.confidence * 100)}% confidence
        </span>
      </div>

      {/* Editable fields */}
      <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
        {fields.map((field) => {
          const value = editedData[field];
          if (value === undefined || value === null) return null;
          return (
            <div key={field}>
              <label className="block text-xs font-medium text-stone-600 dark:text-dusk-400 mb-1 capitalize">
                {field.replace(/([A-Z])/g, ' $1').trim()}
              </label>
              <input
                type="text"
                value={String(value)}
                onChange={(e) => setEditedData({ ...editedData, [field]: e.target.value })}
                className="w-full rounded border border-stone-300 dark:border-dusk-600 bg-white dark:bg-dusk-800 text-stone-800 dark:text-dusk-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
          );
        })}
      </div>

      {/* Trip selector */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-stone-700 dark:text-dusk-300 mb-1">
          Add to trip
        </label>
        {noTrips ? (
          <p className="text-sm text-stone-500 dark:text-dusk-400">
            No trips yet.{' '}
            <Link to="/trips/new" className="text-amber-600 hover:underline" onClick={onClose}>
              Create a trip first
            </Link>
          </p>
        ) : (
          <select
            value={selectedTripId ?? ''}
            onChange={(e) => setSelectedTripId(e.target.value ? parseInt(e.target.value) : undefined)}
            className="w-full rounded-lg border border-stone-300 dark:border-dusk-600 bg-white dark:bg-dusk-800 text-stone-700 dark:text-dusk-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="">Select a trip</option>
            {trips.map((trip: { id: number; title: string }) => (
              <option key={trip.id} value={trip.id}>{trip.title}</option>
            ))}
          </select>
        )}
      </div>

      {/* Buttons */}
      <div className="flex gap-3 justify-between">
        <button
          onClick={() => advance(true)}
          className="px-3 py-2 text-sm text-stone-600 dark:text-dusk-400 hover:text-stone-800 dark:hover:text-dusk-200"
        >
          Skip
        </button>
        <div className="flex gap-2">
          <button
            onClick={handleReject}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
          >
            Reject
          </button>
          <button
            onClick={handleAccept}
            disabled={isSubmitting || !selectedTripId}
            className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Adding...' : 'Accept'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
