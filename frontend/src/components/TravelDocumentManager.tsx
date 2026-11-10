import { useState, useEffect } from 'react';
import travelDocumentService from '../services/travelDocument.service';
import type {
  TravelDocument,
  DocumentType,
  CreateTravelDocumentInput,
} from '../types/travelDocument';
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  getExpirationStatusClasses,
  getExpirationStatusLabel,
  getDocumentTypeIcon,
} from '../types/travelDocument';
import toast from 'react-hot-toast';
import { useFormReset } from '../hooks/useFormReset';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import Modal from './Modal';
import EmptyState from './EmptyState';

interface DocumentFormData {
  type: DocumentType;
  issuingCountry: string;
  documentNumber: string;
  issueDate: string;
  expiryDate: string;
  name: string;
  notes: string;
  isPrimary: boolean;
  alertDaysBefore: number;
  /** Edit-only: explicitly erase the stored document number */
  clearDocumentNumber: boolean;
}

const initialFormState: DocumentFormData = {
  type: 'PASSPORT',
  issuingCountry: '',
  documentNumber: '',
  issueDate: '',
  expiryDate: '',
  name: '',
  notes: '',
  isPrimary: false,
  alertDaysBefore: 180,
  clearDocumentNumber: false,
};

// Common countries list for quick selection
const COMMON_COUNTRIES = [
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'Germany',
  'France',
  'Japan',
  'China',
  'India',
  'Brazil',
  'Mexico',
  'Spain',
  'Italy',
  'South Korea',
  'Netherlands',
];

export default function TravelDocumentManager() {
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const [documents, setDocuments] = useState<TravelDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<DocumentFormData>(initialFormState);
  const [editingDocumentId, setEditingDocumentId] = useState<number | null>(null);
  const [showDocumentForm, setShowDocumentForm] = useState(false);

  const { resetForm, openCreateForm, openEditForm } = useFormReset({
    initialState: initialFormState,
    setFormData,
    setEditingId: setEditingDocumentId,
    setShowForm: setShowDocumentForm,
  });

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      const docs = await travelDocumentService.getAll();
      setDocuments(docs);
    } catch {
      toast.error('Failed to load travel documents');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const input: CreateTravelDocumentInput = {
        type: formData.type,
        issuingCountry: formData.issuingCountry,
        name: formData.name,
        documentNumber: formData.documentNumber || undefined,
        issueDate: formData.issueDate || undefined,
        expiryDate: formData.expiryDate || undefined,
        notes: formData.notes || undefined,
        isPrimary: formData.isPrimary,
        alertDaysBefore: formData.alertDaysBefore,
      };

      await travelDocumentService.create(input);
      toast.success('Document added');
      resetForm();
      loadDocuments();
    } catch {
      toast.error('Failed to add document');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDocumentId) return;

    try {
      await travelDocumentService.update(editingDocumentId, {
        type: formData.type,
        issuingCountry: formData.issuingCountry,
        name: formData.name,
        // Responses mask the stored number, so the field starts empty on edit.
        // Only send it when the user typed a replacement, or explicitly asked to
        // clear it — otherwise omit so the backend leaves the column untouched.
        documentNumber: formData.clearDocumentNumber
          ? null
          : formData.documentNumber
            ? formData.documentNumber
            : undefined,
        issueDate: formData.issueDate || null,
        expiryDate: formData.expiryDate || null,
        notes: formData.notes || null,
        isPrimary: formData.isPrimary,
        alertDaysBefore: formData.alertDaysBefore,
      });
      toast.success('Document updated');
      resetForm();
      loadDocuments();
    } catch {
      toast.error('Failed to update document');
    }
  };

  const handleDelete = async (doc: TravelDocument) => {
    const confirmed = await confirm({
      title: 'Delete Document',
      message: `Delete "${doc.name}"? This action cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await travelDocumentService.delete(doc.id);
      toast.success('Document deleted');
      loadDocuments();
    } catch {
      toast.error('Failed to delete document');
    }
  };

  const startEdit = (doc: TravelDocument) => {
    openEditForm(doc.id, {
      type: doc.type,
      issuingCountry: doc.issuingCountry,
      documentNumber: '', // Don't populate masked value
      issueDate: doc.issueDate || '',
      expiryDate: doc.expiryDate || '',
      name: doc.name,
      notes: doc.notes || '',
      isPrimary: doc.isPrimary,
      alertDaysBefore: doc.alertDaysBefore,
      clearDocumentNumber: false,
    });
  };

  // Group documents by type
  const groupedDocuments = documents.reduce((acc, doc) => {
    if (!acc[doc.type]) {
      acc[doc.type] = [];
    }
    acc[doc.type].push(doc);
    return acc;
  }, {} as Record<DocumentType, TravelDocument[]>);

  if (loading) {
    return <div className="text-center py-4">Loading documents...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col-reverse items-start gap-3 sm:flex-row sm:justify-between sm:items-center">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
          Travel Documents
        </h2>
        <button onClick={openCreateForm} className="btn btn-primary text-sm sm:text-base whitespace-nowrap">
          <span className="sm:hidden">+ Add</span>
          <span className="hidden sm:inline">+ Add Document</span>
        </button>
      </div>

      {/* Privacy notice */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
          Privacy Note
        </h3>
        <p className="text-sm text-blue-800 dark:text-blue-200">
          Document numbers are optional and stored securely. Only the last 4 characters are ever
          displayed in the interface.
        </p>
      </div>

      {/* Document Form Modal */}
      <Modal
        isOpen={showDocumentForm}
        onClose={resetForm}
        title={editingDocumentId ? 'Edit Document' : 'Add Travel Document'}
        icon={getDocumentTypeIcon(formData.type)}
        maxWidth="lg"
        formId="document-form"
        focusFirstInput
        animate
        footer={
          <>
            <button type="button" onClick={resetForm} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" form="document-form" className="btn btn-primary">
              {editingDocumentId ? 'Update' : 'Add'} Document
            </button>
          </>
        }
      >
        <form
          id="document-form"
          onSubmit={editingDocumentId ? handleUpdate : handleCreate}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="doc-type" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Document Type *
              </label>
              <select
                id="doc-type"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as DocumentType })}
                className="input"
                required
              >
                {DOCUMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {getDocumentTypeIcon(type)} {DOCUMENT_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="doc-country" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Issuing Country *
              </label>
              <input
                type="text"
                id="doc-country"
                list="countries-list"
                value={formData.issuingCountry}
                onChange={(e) => setFormData({ ...formData, issuingCountry: e.target.value })}
                className="input"
                placeholder="e.g., United States"
                maxLength={100}
                required
              />
              <datalist id="countries-list">
                {COMMON_COUNTRIES.map((country) => (
                  <option key={country} value={country} />
                ))}
              </datalist>
            </div>
          </div>

          <div>
            <label htmlFor="doc-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Name / Description *
            </label>
            <input
              type="text"
              id="doc-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input"
              placeholder="e.g., Main Passport, Schengen Visa"
              maxLength={500}
              required
            />
          </div>

          <div>
            <label htmlFor="doc-number" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Document Number (optional)
            </label>
            <input
              type="text"
              id="doc-number"
              value={formData.documentNumber}
              onChange={(e) => setFormData({ ...formData, documentNumber: e.target.value })}
              className="input"
              placeholder={editingDocumentId ? 'Leave empty to keep existing' : 'e.g., AB1234567'}
              maxLength={255}
              disabled={formData.clearDocumentNumber}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Only the last 4 characters will be displayed for privacy.
            </p>
            {editingDocumentId && (
              <label className="flex items-center mt-2">
                <input
                  type="checkbox"
                  checked={formData.clearDocumentNumber}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      clearDocumentNumber: e.target.checked,
                      documentNumber: e.target.checked ? '' : formData.documentNumber,
                    })
                  }
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:focus:ring-blue-400"
                />
                <span className="ml-2 text-xs text-gray-700 dark:text-gray-300">
                  Remove the saved document number
                </span>
              </label>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="doc-issue-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Issue Date
              </label>
              <input
                type="date"
                id="doc-issue-date"
                value={formData.issueDate}
                onChange={(e) => setFormData({ ...formData, issueDate: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label htmlFor="doc-expiry-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Expiry Date
              </label>
              <input
                type="date"
                id="doc-expiry-date"
                value={formData.expiryDate}
                onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                className="input"
              />
            </div>
          </div>

          <div>
            <label htmlFor="doc-alert-days" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Alert Days Before Expiry
            </label>
            <select
              id="doc-alert-days"
              value={formData.alertDaysBefore}
              onChange={(e) => setFormData({ ...formData, alertDaysBefore: parseInt(e.target.value) })}
              className="input"
            >
              <option value={30}>30 days (1 month)</option>
              <option value={60}>60 days (2 months)</option>
              <option value={90}>90 days (3 months)</option>
              <option value={180}>180 days (6 months)</option>
              <option value={270}>270 days (9 months)</option>
              <option value={365}>365 days (1 year)</option>
            </select>
          </div>

          <div>
            <label htmlFor="doc-notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notes
            </label>
            <textarea
              id="doc-notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="input"
              rows={3}
              placeholder="Additional notes..."
              maxLength={1000}
            />
          </div>

          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.isPrimary}
                onChange={(e) => setFormData({ ...formData, isPrimary: e.target.checked })}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:focus:ring-blue-400"
              />
              <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                Primary document of this type
              </span>
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
              Primary documents are used for trip validation checks.
            </p>
          </div>
        </form>
      </Modal>

      {/* Document List */}
      {documents.length === 0 ? (
        <EmptyState
          icon="📄"
          message="No travel documents yet"
          subMessage="Add your passports, visas, and other travel documents to track expiration dates and receive alerts."
          actionLabel="Add Document"
          onAction={openCreateForm}
        />
      ) : (
        <div className="space-y-6">
          {(Object.entries(groupedDocuments) as [DocumentType, TravelDocument[]][]).map(([type, docs]) => (
            <div key={type} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <span>{getDocumentTypeIcon(type)}</span>
                {DOCUMENT_TYPE_LABELS[type]}s
                <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                  ({docs.length})
                </span>
              </h3>
              <div className="space-y-3">
                {docs.map((doc) => (
                  <div
                    key={doc.id}
                    className={`border rounded-lg p-4 ${
                      doc.isPrimary
                        ? 'border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/10'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <h4 className="font-semibold text-gray-900 dark:text-white break-words min-w-0">{doc.name}</h4>
                          {doc.isPrimary && (
                            <span className="text-xs bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                              Primary
                            </span>
                          )}
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${getExpirationStatusClasses(doc.expirationStatus)}`}
                          >
                            {getExpirationStatusLabel(doc.expirationStatus, doc.daysUntilExpiry)}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                          <p>
                            <span className="font-medium">Country:</span> {doc.issuingCountry}
                          </p>
                          {doc.documentNumber && (
                            <p>
                              <span className="font-medium">Number:</span> {doc.documentNumber}
                            </p>
                          )}
                          {doc.expiryDate && (
                            <p>
                              <span className="font-medium">Expires:</span>{' '}
                              {new Date(doc.expiryDate + 'T00:00:00').toLocaleDateString()}
                            </p>
                          )}
                          {doc.notes && (
                            <p className="text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                              {doc.notes}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => startEdit(doc)}
                          className="px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800"
                          aria-label={`Edit ${doc.name}`}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(doc)}
                          className="px-3 py-1 text-sm bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-800"
                          aria-label={`Delete ${doc.name}`}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialogComponent />
    </div>
  );
}
