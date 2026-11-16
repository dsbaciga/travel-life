import axios from '../lib/axios';
import type { BulkImportResult, ImportEntity, ImportRequest } from '../types/bulkImport';

export const bulkImportService = {
  /**
   * Validates (`dryRun: true`) or creates the rows. The server is authoritative: a dry run
   * returns exactly what a real run would accept, per row.
   */
  async importRows(tripId: number, entity: ImportEntity, request: ImportRequest): Promise<BulkImportResult> {
    const response = await axios.post<BulkImportResult>(`/trips/${tripId}/import/${entity}`, request);
    return response.data;
  },
};

export default bulkImportService;
