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
              writeMetaApiBackgroundImport(null);
              toast.success('Full history import complete.');
              return;
            }

            if (res.job.status === 'failed') {
              writeMetaApiBackgroundImport(null);
              toast.error('Full history import failed. Please try again.');
              return;
            }

            failures = 0;
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

