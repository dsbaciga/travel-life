import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from './Modal';
import pdfImportService from '../services/pdfImport.service';
import tripService from '../services/trip.service';
import PdfReviewModal from './PdfReviewModal';
import type { PdfImport } from '../types/pdfImport';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  tripId?: number;
}

export default function PdfUploadModal({ isOpen, onClose, onComplete, tripId: initialTripId }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<number | undefined>(initialTripId);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [createdImport, setCreatedImport] = useState<PdfImport | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: tripsData } = useQuery({
    queryKey: ['trips'],
    queryFn: () => tripService.getTrips(),
    enabled: !initialTripId,
  });

  const trips = tripsData?.trips ?? [];

  const handleFile = (f: File) => {
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Please select a PDF file');
      return;
    }
    if (f.size > 25 * 1024 * 1024) {
      toast.error('File must be smaller than 25MB');
      return;
    }
    setFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFile(dropped);
  };

  const handleSubmit = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const result = await pdfImportService.uploadPdf(file, selectedTripId);
      setCreatedImport(result);
    } catch {
      toast.error('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // Once we have a created import, show the review modal
  if (createdImport) {
    return (
      <PdfReviewModal
        isOpen={true}
        importId={createdImport.id}
        onClose={onClose}
        onComplete={onComplete}
      />
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Import from PDF" maxWidth="md">
      <div className="space-y-4">
        {/* Drop zone */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
              : 'border-stone-300 dark:border-dusk-600 hover:border-amber-400 dark:hover:border-amber-500'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <svg className="w-12 h-12 mx-auto mb-3 text-stone-400" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          {file ? (
            <p className="text-sm font-medium text-stone-700 dark:text-dusk-300">{file.name}</p>
          ) : (
            <>
              <p className="text-sm font-medium text-stone-700 dark:text-dusk-300">
                Drop a booking confirmation PDF here
              </p>
              <p className="text-xs text-stone-500 mt-1">or click to browse — max 25MB</p>
            </>
          )}
        </div>

        {/* Trip selector (only show if no tripId was passed) */}
        {!initialTripId && trips.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-dusk-300 mb-1">
              Assign to trip (optional)
            </label>
            <select
              value={selectedTripId ?? ''}
              onChange={(e) => setSelectedTripId(e.target.value ? parseInt(e.target.value) : undefined)}
              className="w-full rounded-lg border border-stone-300 dark:border-dusk-600 bg-white dark:bg-dusk-800 text-stone-700 dark:text-dusk-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">Auto-detect from dates</option>
              {trips.map((trip: { id: number; title: string }) => (
                <option key={trip.id} value={trip.id}>{trip.title}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-stone-700 dark:text-dusk-300 border border-stone-300 dark:border-dusk-600 rounded-lg hover:bg-stone-50 dark:hover:bg-dusk-700"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!file || uploading}
          className="px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? 'Uploading...' : 'Upload & Parse'}
        </button>
      </div>
    </Modal>
  );
}
