import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { continueMetaApiImport } from '../utils/broker-import-api';
import {
  METAAPI_BACKGROUND_IMPORT_EVENT,
  METAAPI_IMPORT_JOB_UPDATED_EVENT,
  readMetaApiBackgroundImport,
  writeMetaApiBackgroundImport,
  type MetaApiBackgroundImport,
} from '../utils/broker-import-background';
import { useAuth } from '../utils/auth';
import { updateImportRun } from '../utils/import-history-api';

function parseImportTotals(message: string | null | undefined): { fetchedTotal?: number; upsertedTotal?: number } {
  if (!message) return {};
  try {
    const parsed = JSON.parse(message) as any;
    const fetchedTotal = typeof parsed?.fetchedTotal === 'number' ? parsed.fetchedTotal : Number(parsed?.fetchedTotal);
    const upsertedTotal = typeof parsed?.upsertedTotal === 'number' ? parsed.upsertedTotal : Number(parsed?.upsertedTotal);
    return {
      fetchedTotal: Number.isFinite(fetchedTotal) ? fetchedTotal : undefined,
      upsertedTotal: Number.isFinite(upsertedTotal) ? upsertedTotal : undefined,
    };
  } catch {
    return {};
  }
}

function endNowIso(): string {
  return new Date().toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function MetaApiImportRunner() {
  const { user, loading: authLoading } = useAuth();
  const [active, setActive] = useState<MetaApiBackgroundImport | null>(() => {
    if (typeof window === 'undefined') return null;
    return readMetaApiBackgroundImport();
  });

  const runningRef = useRef(false);
  const cancelledRef = useRef(false);
  const finalizedRunIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => setActive(readMetaApiBackgroundImport());
    window.addEventListener(METAAPI_BACKGROUND_IMPORT_EVENT, sync);
    return () => window.removeEventListener(METAAPI_BACKGROUND_IMPORT_EVENT, sync);
  }, []);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      if (active) writeMetaApiBackgroundImport(null);
      return;
    }

    if (!active) return;
    if (runningRef.current) return;

    cancelledRef.current = false;
    runningRef.current = true;

    let failures = 0;

    void (async () => {
      try {
        while (!cancelledRef.current) {
	          try {
	            const res = await continueMetaApiImport({ jobId: active.jobId });
	            window.dispatchEvent(new CustomEvent(METAAPI_IMPORT_JOB_UPDATED_EVENT, { detail: res }));

	            if (res.job.status === 'succeeded') {
                const runId = active.importRunId;
                if (runId && !finalizedRunIdsRef.current.has(runId)) {
                  finalizedRunIdsRef.current.add(runId);
                  const totals = parseImportTotals(res.job.message);
                  const imported = typeof totals.upsertedTotal === 'number' ? totals.upsertedTotal : 0;
                  const fetched = typeof totals.fetchedTotal === 'number' ? totals.fetchedTotal : undefined;
                  const skipped =
                    typeof fetched === 'number' && fetched >= imported ? fetched - imported : 0;
                  try {
                    await updateImportRun(runId, {
                      status: 'success',
                      endedAt: endNowIso(),
                      importedCount: imported,
                      updatedCount: 0,
                      skippedCount: skipped,
                      errorMessage: null,
                      errorDetails: {
                        provider: 'metaapi',
                        mode: 'full',
                        connectionId: active.connectionId,
                        job: res.job,
                      },
                    });
                  } catch (e) {
                    console.warn('[broker] update import run failed', e);
                  }
                }

	              writeMetaApiBackgroundImport(null);
	              toast.success('Full history import complete.');
	              return;
	            }

	            if (res.job.status === 'failed') {
                const runId = active.importRunId;
                if (runId && !finalizedRunIdsRef.current.has(runId)) {
                  finalizedRunIdsRef.current.add(runId);
                  try {
                    await updateImportRun(runId, {
                      status: 'failed',
                      endedAt: endNowIso(),
                      errorMessage: res.job.message || 'Full history import failed.',
                      errorDetails: {
                        provider: 'metaapi',
                        mode: 'full',
                        connectionId: active.connectionId,
                        job: res.job,
                      },
                    });
                  } catch (e) {
                    console.warn('[broker] update import run failed', e);
                  }
                }

	              writeMetaApiBackgroundImport(null);
	              toast.error('Full history import failed. Please try again.');
	              return;
	            }

	            failures = 0;
	            if (res.status === 'rate_limited') {
	              const retryAtMs = Date.parse(res.retryAt);
	              const delay = Number.isFinite(retryAtMs)
	                ? Math.min(15000, Math.max(250, retryAtMs - Date.now() + 250))
	                : 1000;
	              await sleep(delay);
	              continue;
	            }

	            await sleep(350);
	          } catch (e) {
	            failures += 1;
	            console.error('[broker] background import continue failed', e);

            if (e instanceof Error && e.message === 'You must be logged in.') {
              writeMetaApiBackgroundImport(null);
              return;
            }

            if (failures >= 6) {
              writeMetaApiBackgroundImport(null);
              toast.error('Full history import stopped due to repeated errors. Please try again.');
              return;
            }

            const delay = Math.min(15_000, 500 * Math.pow(2, failures));
            await sleep(delay);
          }
        }
      } finally {
        runningRef.current = false;
      }
    })();

    return () => {
      cancelledRef.current = true;
    };
  }, [active, authLoading, user]);

  return null;
}
