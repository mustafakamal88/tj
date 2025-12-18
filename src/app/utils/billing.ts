import { getSupabaseClient } from './supabase';

export type BillingAction = 'create_checkout_session' | 'create_portal_session';

type BillingUrlResponse = { url: string };
type BillingHealthResponse = { ok: true; ts: string };

function bestErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Request failed';
  }
}

async function invokeBillingRaw(action: string, payload: Record<string, unknown> = {}): Promise<unknown> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Please login to continue.');

  console.log('[billing] invoking', action, payload);

  try {
    const { data, error } = await supabase.functions.invoke('billing', {
      body: { action, ...payload },
      headers: { Authorization: `Bearer ${token}` },
    });

    if (error || data == null) {
      console.log('[billing] invoke result error?', { hasError: !!error, dataType: typeof data, data });
      if (error) {
        console.log('[billing] invoke error object', error);
        const anyErr = error as any;
        const ctx = anyErr?.context;
        if (ctx) {
          console.log('[billing] error.context', ctx);
          const resp: any = ctx?.response ?? ctx;
          if (resp) {
            console.log('[billing] error.context.response', {
              status: resp.status,
              statusText: resp.statusText,
              headers: typeof resp.headers?.forEach === 'function' ? Array.from(resp.headers.entries()) : resp.headers,
            });
            if (typeof resp.text === 'function') {
              try {
                const raw = await resp.text();
                console.log('[billing] error.context.response.text()', raw);
              } catch (readErr) {
                console.log('[billing] failed to read error response text', readErr);
              }
            }
          }
        }
      }

      throw new Error(bestErrorMessage(error ?? 'Billing returned no data.'));
    }

    console.log('[billing] response', data);
    return data;
  } catch (thrown) {
    console.log('[billing] invoke threw', thrown);
    throw thrown instanceof Error ? thrown : new Error(bestErrorMessage(thrown));
  }
}

export async function invokeBilling(action: BillingAction, payload: Record<string, unknown> = {}): Promise<BillingUrlResponse> {
  const data = await invokeBillingRaw(action, payload);
  const url = (data as any)?.url;
  if (typeof url !== 'string' || !url.startsWith('http')) {
    throw new Error('Billing response missing checkout URL.');
  }
  return { url };
}

export async function invokeBillingHealth(): Promise<BillingHealthResponse> {
  const data = await invokeBillingRaw('health');
  const ok = (data as any)?.ok;
  const ts = (data as any)?.ts;
  if (ok !== true || typeof ts !== 'string') throw new Error('Billing health check returned invalid response.');
  return { ok: true, ts };
}

export async function invokeBillingUrl(action: string, payload: Record<string, unknown> = {}): Promise<BillingUrlResponse> {
  const data = await invokeBillingRaw(action, payload);
  const url = (data as any)?.url;
  if (typeof url !== 'string' || !url.startsWith('http')) {
    throw new Error('Billing response missing URL.');
  }
  return { url };
}
