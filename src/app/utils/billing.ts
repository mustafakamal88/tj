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

async function extractEdgeFunctionErrorDetail(error: unknown): Promise<string | null> {
  const anyErr = error as any;
  const ctx = anyErr?.context;
  if (!ctx) return null;

  const resp: any = ctx?.response ?? ctx;

  const status = resp?.status ?? ctx?.status;
  const statusText = resp?.statusText ?? ctx?.statusText;

  try {
    if (typeof resp?.json === 'function') {
      const detail = await resp.json();
      if (detail?.error) return String(detail.error);
      if (detail?.message) return String(detail.message);
      return `Edge Function error (HTTP ${status ?? 'unknown'}${statusText ? ` ${statusText}` : ''})`;
    }
  } catch {
    // ignore
  }

  try {
    if (typeof resp?.text === 'function') {
      const raw = await resp.text();
      if (typeof raw === 'string' && raw.trim().length) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.error) return String(parsed.error);
          if (parsed?.message) return String(parsed.message);
        } catch {
          // not JSON; return raw snippet
        }
        return raw.trim().slice(0, 400);
      }
    }
  } catch {
    // ignore
  }

  if (typeof ctx?.body === 'string' && ctx.body.trim().length) return ctx.body.trim().slice(0, 400);
  return status ? `Edge Function error (HTTP ${status})` : null;
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
        console.log('[billing] invoke error object', {
          name: (error as any)?.name,
          message: (error as any)?.message,
          error,
        });
        const anyErr = error as any;
        const ctx = anyErr?.context;
        if (ctx) {
          console.log('[billing] error.context', {
            status: ctx?.status,
            body: ctx?.body,
            hasResponse: !!ctx?.response,
          });
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

      const detail = await extractEdgeFunctionErrorDetail(error);
      throw new Error(detail ?? bestErrorMessage(error ?? 'Billing returned no data.'));
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
