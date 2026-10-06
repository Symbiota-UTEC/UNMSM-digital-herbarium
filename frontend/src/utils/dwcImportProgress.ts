export interface DwcImportTiming {
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export function dwcImportElapsedSeconds(
  job: DwcImportTiming | null,
  clock: number,
  uploadStartedAt: number | null = null,
): number {
  const start = uploadStartedAt ?? (job ? Date.parse(job.startedAt ?? job.createdAt) : null);
  const end = uploadStartedAt !== null ? clock : job?.finishedAt ? Date.parse(job.finishedAt) : clock;
  if (start === null || !Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 1000));
}
