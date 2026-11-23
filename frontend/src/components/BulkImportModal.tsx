import { useCallback, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from './Modal';
import BulkImportPreviewTable from './BulkImportPreviewTable';
import bulkImportService from '../services/bulkImport.service';
import { useTimezoneResolver } from '../hooks/useTimezoneResolver';
import {
  IMPORT_FIELDS,
  IMPORT_MAX_FILE_BYTES,
  IMPORT_MAX_ROWS,
  autoMapColumns,
  buildErrorReportCsv,
  buildRowPayloads,
  buildTemplateCsv,
  downloadCsv,
  findOverlongCell,
  missingRequiredFields,
  parseCsv,
  type ColumnMapping,
  type ParsedCsv,
} from '../utils/csvImport';
import type { BulkImportResult, ImportEntity } from '../types/bulkImport';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tripId: number;
  /** Called after rows were created, so the page can refresh. */
  onComplete?: () => void;
}

type Step = 'choose' | 'map' | 'preview' | 'result';

const ENTITY_ORDER: ImportEntity[] = ['locations', 'activities', 'lodging', 'transportation'];

const ENTITY_LABEL: Record<ImportEntity, string> = {
  locations: 'Locations',
  activities: 'Activities',
  lodging: 'Stays',
  transportation: 'Transport',
};

/** [singular, plural] for the result sentence. */
const ENTITY_NOUN: Record<ImportEntity, [string, string]> = {
  locations: ['location', 'locations'],
  activities: ['activity', 'activities'],
  lodging: ['stay', 'stays'],
  transportation: ['leg', 'legs'],
};

const STEP_TITLE: Record<Step, string> = {
  choose: 'Import from CSV',
  map: 'Map columns',
  preview: 'Preview import',
  result: 'Import complete',
};

/** Rows the user should look at twice: leave them out unless they choose to keep them. */
const isDuplicateRow = (row: BulkImportResult['rows'][number]) =>
  row.warnings.some((w) => w.code === 'duplicate_existing' || w.code === 'duplicate_in_file');

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.readAsText(file, 'utf-8');
  });
}

function apiMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { message?: unknown } } }).response;
    if (typeof response?.data?.message === 'string') return response.data.message;
  }
  return fallback;
}

const secondaryButton =
  'px-4 py-2 min-h-[44px] text-sm font-medium text-stone-700 dark:text-dusk-300 border border-stone-300 dark:border-dusk-600 rounded-lg hover:bg-stone-50 dark:hover:bg-dusk-700 disabled:opacity-50';
const primaryButton = 'btn btn-primary min-h-[44px] disabled:opacity-50';

/**
 * Wizard for importing locations, activities, lodging or transportation from a CSV file.
 *
 * Choose type and file -> map columns -> preview (a server dry run, so it is exactly what the
 * real run will accept) -> result with a downloadable error report.
 *
 * Launch it from a component that stays mounted: a menu that unmounts when an item is chosen
 * would take this dialog down with it (see `TripHeaderActions`).
 */
export default function BulkImportModal({ isOpen, onClose, tripId, onComplete }: BulkImportModalProps) {
  const queryClient = useQueryClient();
  const resolveTz = useTimezoneResolver();

  const [step, setStep] = useState<Step>('choose');
  const [entity, setEntity] = useState<ImportEntity>('locations');
  const [fileName, setFileName] = useState('');
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [preview, setPreview] = useState<BulkImportResult | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  // A ref, not state: two clicks can land before React re-renders with `busy` set, and a second
  // real import would double every row.
  const inFlight = useRef(false);

  const fields = IMPORT_FIELDS[entity];

  const handleFile = useCallback(async (file: File) => {
    setFileError(null);
    setCsv(null);
    setFileName('');
    if (file.size > IMPORT_MAX_FILE_BYTES) {
      setFileError('This file is larger than 1 MB. Split it into smaller files.');
      return;
    }
    let outcome;
    try {
      outcome = parseCsv(await readFileText(file));
    } catch {
      setFileError('The file could not be read.');
      return;
    }
    if (!outcome.ok) {
      setFileError(outcome.error);
      return;
    }
    if (outcome.csv.rows.length > IMPORT_MAX_ROWS) {
      setFileError(`This file has ${outcome.csv.rows.length} rows; at most ${IMPORT_MAX_ROWS} can be imported at once. Split it into smaller files.`);
      return;
    }
    const overlong = findOverlongCell(outcome.csv.rows);
    if (overlong) {
      setFileError(`Row ${overlong.row} has a cell of ${overlong.length.toLocaleString()} characters, which is too long to import.`);
      return;
    }
    setFileName(file.name);
    setCsv(outcome.csv);
  }, []);

  const goToMapping = () => {
    if (!csv) return;
    setMapping(autoMapColumns(csv.headers, fields));
    setStep('map');
  };

  const missing = useMemo(() => missingRequiredFields(mapping, fields), [mapping, fields]);

  const runPreview = async () => {
    if (!csv || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const dryRun = await bulkImportService.importRows(tripId, entity, {
        rows: buildRowPayloads(csv.rows, mapping),
        dryRun: true,
        excludeRows: [],
      });
      setPreview(dryRun);
      setExcluded(new Set(dryRun.rows.filter((row) => row.status === 'valid' && isDuplicateRow(row)).map((row) => row.index)));
      setStep('preview');
    } catch (error) {
      toast.error(apiMessage(error, 'Could not validate the file. Please try again.'));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const toggleRow = (index: number) =>
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  const importableCount = preview
    ? preview.rows.filter((row) => row.status === 'valid' && !excluded.has(row.index)).length
    : 0;

  const runImport = async () => {
    if (!csv || inFlight.current || importableCount === 0) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const done = await bulkImportService.importRows(tripId, entity, {
        rows: buildRowPayloads(csv.rows, mapping),
        dryRun: false,
        excludeRows: [...excluded],
      });
      setResult(done);
      setStep('result');
      for (const key of ['trip', 'budget-summary', entity]) {
        void queryClient.invalidateQueries({ queryKey: [key, tripId] });
      }
      if (done.created > 0) onComplete?.();
    } catch (error) {
      // The transaction rolled back, so nothing was created and it is safe to try again.
      toast.error(apiMessage(error, 'The import failed and nothing was imported. Please try again.'));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const formatTime = (iso: string, timezone: string | null) => {
    const zone = resolveTz(timezone, preview?.defaultTimezone?.zone);
    try {
      return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: zone }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const downloadReport = (source: BulkImportResult) => {
    if (!csv) return;
    downloadCsv(`${entity}-import-errors.csv`, buildErrorReportCsv(csv.headers, csv.rows, source.rows));
  };

  const downloadTemplate = (which: ImportEntity) => downloadCsv(`${which}-template.csv`, buildTemplateCsv(which));

  const skipped = result ? result.rows.filter((row) => row.status === 'invalid' || row.status === 'excluded') : [];

  const footer = (() => {
    switch (step) {
      case 'choose':
        return (
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
            <button type="button" onClick={goToMapping} disabled={!csv} className={primaryButton}>Next: map columns</button>
          </div>
        );
      case 'map':
        return (
          <div className="flex justify-between gap-3">
            <button type="button" onClick={() => setStep('choose')} className={secondaryButton} disabled={busy}>Back</button>
            <button type="button" onClick={runPreview} disabled={busy || missing.length > 0} className={primaryButton}>
              {busy ? 'Checking...' : 'Next: preview'}
            </button>
          </div>
        );
      case 'preview':
        return (
          <div className="flex justify-between gap-3">
            <button type="button" onClick={() => setStep('map')} className={secondaryButton} disabled={busy}>Back</button>
            <button type="button" onClick={runImport} disabled={busy || importableCount === 0} className={primaryButton}>
              {busy ? 'Importing...' : `Import ${importableCount} ${importableCount === 1 ? 'row' : 'rows'}`}
            </button>
          </div>
        );
      case 'result':
        return (
          <div className="flex justify-end">
            <button type="button" onClick={onClose} className={primaryButton}>Done</button>
          </div>
        );
    }
  })();

  return (
    <Modal
      isOpen={isOpen}
      onClose={busy ? () => undefined : onClose}
      title={STEP_TITLE[step]}
      maxWidth={step === 'preview' || step === 'result' ? '6xl' : '2xl'}
      closeOnBackdropClick={false}
      footer={footer}
    >
      {step === 'choose' && (
        <div className="space-y-5">
          <fieldset>
            <legend className="label">What are you importing?</legend>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ENTITY_ORDER.map((option) => (
                <label
                  key={option}
                  className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border px-4 py-2 text-sm ${
                    entity === option
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-stone-300 dark:border-dusk-600'
                  }`}
                >
                  <input type="radio" name="import-entity" value={option} checked={entity === option} onChange={() => setEntity(option)} />
                  <span className="text-stone-800 dark:text-dusk-200">{ENTITY_LABEL[option]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="bulk-import-file" className="label">CSV file</label>
            <input
              id="bulk-import-file"
              type="file"
              accept=".csv,text/csv"
              className="input text-base sm:text-sm"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <p className="mt-1 text-xs text-stone-500 dark:text-dusk-400">
              UTF-8 CSV, up to {IMPORT_MAX_ROWS} rows and 1 MB. Commas, semicolons or tabs are detected automatically.
            </p>
            {fileError && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">{fileError}</p>}
            {csv && (
              <div className="mt-2 text-sm text-stone-700 dark:text-dusk-300">
                <p>
                  <span className="font-medium">{fileName}</span>: {csv.rows.length} {csv.rows.length === 1 ? 'row' : 'rows'}, {csv.headers.length} columns
                </p>
                {csv.notes.map((note) => (
                  <p key={note} className="text-amber-700 dark:text-amber-400">{note}</p>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg bg-stone-50 p-3 text-sm text-stone-700 dark:bg-dusk-800 dark:text-dusk-300">
            <p className="font-medium">Need a starting point?</p>
            <p className="mt-1">
              Download a template with a header row and two example rows:
            </p>
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {ENTITY_ORDER.map((which) => (
                <li key={which}>
                  <button type="button" className="font-medium text-primary-700 underline dark:text-primary-400" onClick={() => downloadTemplate(which)}>
                    Download {ENTITY_LABEL[which].toLowerCase()} template
                  </button>
                </li>
              ))}
            </ul>
            {entity !== 'locations' && (
              <p className="mt-2 text-xs">
                Times: <code>YYYY-MM-DD HH:mm</code> is read in the{' '}
                {entity === 'transportation' ? 'start or end timezone column (departure and arrival)' : 'timezone column'}, else the trip timezone, else your timezone.
                ISO 8601 with an offset (<code>2026-04-03T10:30:00+02:00</code>) is used as given. Day-first or month-first dates such as <code>03/04/2026</code> are rejected.
                {entity === 'lodging' && ' A date alone (2026-04-03) means midnight that day.'}
              </p>
            )}
          </div>
        </div>
      )}

      {step === 'map' && csv && (
        <div className="space-y-4">
          <p className="text-sm text-stone-600 dark:text-dusk-400">
            Choose which column of <span className="font-medium">{fileName}</span> fills each field. Columns were matched by name; correct any that are wrong.
          </p>
          <div className="divide-y divide-stone-100 rounded-lg border border-stone-200 dark:divide-dusk-700 dark:border-dusk-600">
            {fields.map((field) => {
              const selectId = `map-${field.key}`;
              const index = mapping[field.key];
              const sample = index != null ? csv.rows.slice(0, 2).map((r) => r[index]).filter((v) => v) : [];
              return (
                <div key={field.key} className="grid gap-2 px-3 py-3 sm:grid-cols-[12rem_1fr] sm:items-center">
                  <label htmlFor={selectId} className="text-sm font-medium text-stone-800 dark:text-dusk-200">
                    {field.label}
                    {field.required && <span className="ml-1 text-red-600" aria-label="required">*</span>}
                  </label>
                  <div>
                    <select
                      id={selectId}
                      className="input text-base sm:text-sm"
                      value={index ?? ''}
                      onChange={(e) =>
                        setMapping((current) => {
                          const value = e.target.value === '' ? null : Number(e.target.value);
                          // A column fills one field; picking it here frees it elsewhere.
                          const next: ColumnMapping = {};
                          for (const [key, col] of Object.entries(current)) next[key] = value !== null && col === value ? null : col;
                          next[field.key] = value;
                          return next;
                        })
                      }
                    >
                      <option value="">{field.required ? 'Choose a column' : 'Do not import'}</option>
                      {csv.headers.map((header, i) => (
                        <option key={i} value={i}>{header}</option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-stone-500 dark:text-dusk-400">
                      {sample.length > 0 ? `e.g. ${sample.join(' | ')}` : field.hint}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          {missing.length > 0 && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              Choose a column for: {missing.map((f) => f.label).join(', ')}.
            </p>
          )}
        </div>
      )}

      {step === 'preview' && preview && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm" role="status">
            <span className="text-green-700 dark:text-green-400">{preview.valid} valid</span>
            <span className={preview.invalid > 0 ? 'text-red-700 dark:text-red-400' : 'text-stone-500'}>{preview.invalid} with errors (will be skipped)</span>
            <span className="text-amber-700 dark:text-amber-400">{preview.rows.filter((r) => r.status === 'valid' && r.warnings.length > 0).length} with warnings</span>
            <span className="text-stone-700 dark:text-dusk-300">{importableCount} selected to import</span>
          </div>
          {preview.defaultTimezone && (
            <p className="text-xs text-stone-500 dark:text-dusk-400">
              Times without an offset or timezone column are read as {preview.defaultTimezone.zone}
              {preview.defaultTimezone.source === 'trip' ? ' (the trip timezone)' : preview.defaultTimezone.source === 'user' ? ' (your timezone setting)' : ' (no trip or user timezone is set)'}.
            </p>
          )}
          <p className="text-xs text-stone-500 dark:text-dusk-400">
            Rows that look like duplicates are unticked. Tick them to import anyway. Rows with errors cannot be imported.
          </p>
          <BulkImportPreviewTable
            entity={entity}
            rows={preview.rows}
            excluded={excluded}
            onToggle={toggleRow}
            formatTime={formatTime}
            disabled={busy}
          />
        </div>
      )}

      {step === 'result' && result && (
        <div className="space-y-4">
          <p className="text-base font-medium text-stone-900 dark:text-dusk-100" role="status">
            {result.created} {ENTITY_NOUN[entity][result.created === 1 ? 0 : 1]} {result.created === 1 ? 'was' : 'were'} imported.
            {skipped.length > 0 && ` ${skipped.length} ${skipped.length === 1 ? 'row was' : 'rows were'} skipped.`}
          </p>
          {result.tripTimezoneSet && (
            <p className="text-sm text-stone-600 dark:text-dusk-400">The trip timezone was set to {result.tripTimezoneSet} from the first located row.</p>
          )}
          {skipped.length > 0 && (
            <>
              <ul className="max-h-64 divide-y divide-stone-100 overflow-y-auto rounded-lg border border-stone-200 text-sm dark:divide-dusk-700 dark:border-dusk-600">
                {skipped.map((row) => (
                  <li key={row.index} className="px-3 py-2">
                    <span className="font-medium">Row {row.index + 1}</span>{' '}
                    <span className="text-stone-600 dark:text-dusk-400">
                      {row.status === 'invalid'
                        ? row.errors.map((e) => e.message).join('; ')
                        : 'Left out at your request'}
                    </span>
                  </li>
                ))}
              </ul>
              <button type="button" className={secondaryButton} onClick={() => downloadReport(result)}>
                Download error report (CSV)
              </button>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
