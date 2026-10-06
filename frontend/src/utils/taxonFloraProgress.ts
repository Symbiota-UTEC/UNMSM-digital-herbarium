type EtaBaseline = {
  jobId: string;
  stage: string | null;
  seconds: number;
  progressPercent: number | null;
  startedAt: number;
};

type EtaSample = Omit<EtaBaseline, "startedAt">;

function isEtaBaseline(value: unknown): value is EtaBaseline {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.jobId === "string" &&
    (typeof candidate.stage === "string" || candidate.stage === null) &&
    typeof candidate.seconds === "number" &&
    (typeof candidate.progressPercent === "number" || candidate.progressPercent === null) &&
    typeof candidate.startedAt === "number" &&
    Number.isFinite(candidate.startedAt)
  );
}

export function restoreEtaBaseline(sample: EtaSample, storedValue: string | null, now: number): EtaBaseline {
  if (storedValue) {
    try {
      const stored: unknown = JSON.parse(storedValue);
      if (
        isEtaBaseline(stored) &&
        stored.jobId === sample.jobId &&
        stored.stage === sample.stage &&
        stored.seconds === sample.seconds &&
        stored.progressPercent === sample.progressPercent
      ) {
        return stored;
      }
    } catch {
      // Discard invalid or unavailable client-side state and anchor this sample now.
    }
  }

  return { ...sample, startedAt: now };
}

export function etaBaselineStorageKey(jobId: string): string {
  return `taxon-flora-eta:${jobId}`;
}

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

export function formatImportEta(
  status: string,
  seconds: number | null,
  now: number,
  jobId: string,
  stage: string | null,
  progressPercent: number | null,
  baseline: EtaBaseline | null,
): string {
  if (status === "queued") return "En cola";
  if (status === "failed") return "—";
  if (status === "completed") return "Completado";
  if (seconds == null || seconds < 0) return "Calculando…";

  if (
    baseline == null ||
    baseline.jobId !== jobId ||
    baseline.stage !== stage ||
    baseline.seconds !== seconds ||
    baseline.progressPercent !== progressPercent
  ) {
    return "Calculando…";
  }

  const elapsed = Math.max(0, Math.floor((now - baseline.startedAt) / 1000));
  const remainingSeconds = seconds - elapsed;
  return remainingSeconds > 0 ? `≈ ${formatSeconds(remainingSeconds)}` : "Calculando…";
}

export type { EtaBaseline };
