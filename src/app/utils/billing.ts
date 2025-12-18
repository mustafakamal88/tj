import { getSupabaseClient } from './supabase';

export type BillingAction = 'create_checkout_session' | 'create_portal_session';

type BillingUrlResponse = { url: string };

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

  const { data, error } = await supabase.functions.invoke('billing', {
    body: { action, ...payload },
    headers: { Authorization: `Bearer ${token}` },
  });

  if (error) {
    console.log('[billing] invoke error', error);
    const anyErr = error as any;
    try {
      if (anyErr?.context && typeof anyErr.context.json === 'function') {
        const detail = await anyErr.context.json();
        if (detail?.error) throw new Error(String(detail.error));
        if (detail?.message) throw new Error(String(detail.message));
      }
    } catch (e) {
      if (e instanceof Error) throw e;
    }
    throw new Error(bestErrorMessage(error));
  }

  console.log('[billing] response', data);
  return data;
}

export async function invokeBilling(action: BillingAction, payload: Record<string, unknown> = {}): Promise<BillingUrlResponse> {
  const data = await invokeBillingRaw(action, payload);
  const url = (data as any)?.url;
  if (typeof url !== 'string' || !url.startsWith('http')) {
    throw new Error('Billing response missing checkout URL.');
  }
  return { url };
}

export async function invokeBillingUrl(action: string, payload: Record<string, unknown> = {}): Promise<BillingUrlResponse> {
  const data = await invokeBillingRaw(action, payload);
  const url = (data as any)?.url;
  if (typeof url !== 'string' || !url.startsWith('http')) {
    throw new Error('Billing response missing URL.');
  }
  return { url };
}
