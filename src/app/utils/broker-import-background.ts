export type MetaApiBackgroundImport = {
  jobId: string;
  connectionId: string;
  mode: 'full';
  startedAt: string;
  to?: string;
};

const STORAGE_KEY = 'tj-metaapi-import';
export const METAAPI_BACKGROUND_IMPORT_EVENT = 'metaapi-import-background-changed';
export const METAAPI_IMPORT_JOB_UPDATED_EVENT = 'metaapi-import-job-updated';

export function readMetaApiBackgroundImport(): MetaApiBackgroundImport | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MetaApiBackgroundImport>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.jobId !== 'string' || !parsed.jobId.trim()) return null;
    if (typeof parsed.connectionId !== 'string' || !parsed.connectionId.trim()) return null;
    if (parsed.mode !== 'full') return null;
    if (typeof parsed.startedAt !== 'string' || !parsed.startedAt.trim()) return null;
    return {
      jobId: parsed.jobId,
      connectionId: parsed.connectionId,
      mode: 'full',
      startedAt: parsed.startedAt,
      to: typeof parsed.to === 'string' && parsed.to.trim() ? parsed.to : undefined,
    };
  } catch {
    return null;
  }
}

export function writeMetaApiBackgroundImport(value: MetaApiBackgroundImport | null): void {
  try {
    if (!value) {
      localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new Event(METAAPI_BACKGROUND_IMPORT_EVENT));
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    window.dispatchEvent(new Event(METAAPI_BACKGROUND_IMPORT_EVENT));
  } catch {
    // ignore storage failures (private mode, quota, etc.)
  }
}
