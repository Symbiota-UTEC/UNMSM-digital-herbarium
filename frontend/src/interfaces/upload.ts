import type { ImportJobStatus } from "@constants/enums";

export interface TaxonFloraImportJob {
  jobId: string;
  filename: string;
  status: ImportJobStatus;
  stage: string | null;
  detail: string | null;
  errorMessage: string | null;
  fileSizeBytes: number | null;
  bytesProcessed: number | null;
  progressPercent: number | null;
  estimatedSecondsRemaining: number | null;
  rowsProcessed: number;
  rowsFilteredOut: number;
  taxaMarkedNotCurrent: number;
  taxaInserted: number;
  taxaUpdated: number;
  taxaSetCurrent: number;
  lastProcessedRow: number | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  uploadedByUserId: string | null;
}

export interface TaxonFloraUploadAcceptedResponse {
  status: string;
  backbone: string;
  filename: string;
  detail: string;
  jobId: string;
}

/** Resultado de POST /upload/dwc-csv. */
export interface DwcImportResult {
  status: string;
  collectionId: string;
  rows: number;
  occurrencesInserted: number;
  taxaMatched: number;
  identificationsInserted: number;
  identifiersInserted: number;
}
