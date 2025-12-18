import { useEffect, useMemo, useState } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Separator } from './ui/separator';
import { toast } from 'sonner';
import type { SubscriptionPlan } from '../utils/data-limit';
import { getSupabaseClient } from '../utils/supabase';
import { useProfile } from '../utils/use-profile';

type PaymentMethod = 'stripe' | 'paypal' | 'applepay' | 'googlepay' | 'crypto';

const isEnabled = (key: string) => (import.meta.env[key] as string | undefined) === 'true';

export function BillingPage() {
  const [isLoading, setIsLoading] = useState(false);
  const { plan, isActive, loading: profileLoading, refresh } = useProfile();

  const enablePayPal = isEnabled('VITE_ENABLE_PAYPAL');
  const enableApplePay = isEnabled('VITE_ENABLE_APPLEPAY');
  const enableGooglePay = isEnabled('VITE_ENABLE_GOOGLEPAY');
  const enableCrypto = isEnabled('VITE_ENABLE_CRYPTO');
  const usdtAddress = (import.meta.env.VITE_USDT_ADDRESS as string | undefined) ?? '';
  const isPaidActive = !profileLoading && isActive && (plan === 'pro' || plan === 'premium');
  const currentPlan: SubscriptionPlan | null = profileLoading ? null : isPaidActive ? plan : 'free';
  const disableAllPaid = isPaidActive && plan === 'premium';

  const plans = useMemo(
    () =>
      [
        {
          key: 'free' as const,
          name: 'Free',
          price: '$0',
          period: '14-day trial',
          description: 'Try the essentials.',
          bullets: ['Manual entry only', 'No imports', 'No MT sync', 'Up to 15 trades during trial'],
          highlighted: false,
        },
        {
          key: 'pro' as const,
          name: 'Pro',
          price: '$15.34',
          period: '/month',
          description: 'Unlimited trades + imports.',
          bullets: ['Unlimited trades', 'CSV/XML/HTML imports', 'MT4/MT5 sync', 'Advanced analytics'],
          highlighted: true,
        },
        {
          key: 'premium' as const,
          name: 'Premium',
          price: '$28.37',
          period: '/month',
          description: 'Pro + priority access.',
          bullets: ['Everything in Pro', 'Priority badge', 'Tradovate/Ninja (coming soon) unlocked'],
          highlighted: false,
        },
      ] as const,
    [],
  );

  const invokeBilling = async <T,>(action: string, body: Record<string, unknown>): Promise<T> => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
    const { data, error } = await supabase.functions.invoke('billing', { body: { action, ...body } });
    if (error) throw new Error(error.message);
    if (!data?.ok) throw new Error(data?.error ?? 'Billing request failed.');
    return data.data as T;
  };

  const createStripeCheckoutSession = async (selectedPlan: Exclude<SubscriptionPlan, 'free'>): Promise<string> => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw new Error(sessionError.message);
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error('Please login to continue.');

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    if (!supabaseUrl) throw new Error('Missing VITE_SUPABASE_URL.');

    const res = await fetch(`${supabaseUrl}/functions/v1/billing/create-checkout-session`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ plan: selectedPlan }),
    });
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      throw new Error(json?.error ?? `Stripe checkout failed (HTTP ${res.status})`);
    }
    if (!json?.url) throw new Error('Stripe checkout URL missing.');
    return String(json.url);
  };

  const startCheckout = async (plan: Exclude<SubscriptionPlan, 'free'>, method: PaymentMethod) => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      if (method === 'stripe') {
        const url = await createStripeCheckoutSession(plan);
        window.location.href = url;
        return;
      }
      if (method === 'paypal') {
        if (!enablePayPal) throw new Error('PayPal is disabled. Set VITE_ENABLE_PAYPAL=true.');
        const res = await invokeBilling<{ url: string }>('paypal_create_subscription', { plan });
        window.location.href = res.url;
        return;
      }
      toast.info('Coming soon.');
    } catch (error) {
      console.error('[billing] startCheckout failed', error);
      toast.error(error instanceof Error ? error.message : 'Billing failed.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const canceled = params.get('canceled');
    if (success === '1') {
      toast.success('Payment successful. Activating your plan…');
      void (async () => {
        await refresh();
        // Webhook may take a moment — retry once.
        window.setTimeout(() => void refresh(), 1500);
      })();
    } else if (canceled === '1') {
      toast.info('Checkout canceled.');
    }
  }, []);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl mb-2">Billing</h1>
            <p className="text-muted-foreground">Upgrade to Pro/Premium to unlock imports, MT sync, and advanced analytics.</p>
          </div>
          {profileLoading ? (
            <Badge variant="secondary">Loading…</Badge>
          ) : (
            <Badge
              variant="secondary"
              className={isPaidActive ? 'bg-[#34a85a] text-white border-transparent' : undefined}
            >
              {isPaidActive ? `Current: ${plan.toUpperCase()}` : 'Current: FREE'}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isCurrent = currentPlan ? plan.key === currentPlan : false;
            return (
              <Card key={plan.key} className={`p-6 ${plan.highlighted ? 'border-[#34a85a]/60 shadow-lg' : ''}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">{plan.name}</h2>
                    <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
                  </div>
                  {plan.key === 'premium' ? <Badge>Priority</Badge> : plan.key === 'pro' ? <Badge className="bg-[#34a85a] text-white">Popular</Badge> : null}
                </div>

                <div className="mt-6 flex items-baseline gap-2">
                  <span className="text-4xl font-semibold tracking-tight tabular-nums">{plan.price}</span>
                  <span className="text-sm text-muted-foreground">{plan.period}</span>
                </div>

                <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
                  {plan.bullets.map((b) => (
                    <li key={b}>• {b}</li>
                  ))}
                </ul>

                <Separator className="my-6" />

                {plan.key === 'free' ? (
                  <Button className="w-full" variant="outline" disabled>
                    {profileLoading ? 'Loading…' : isCurrent ? 'Current plan' : 'Free'}
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <Button
                      className="w-full bg-[#34a85a] hover:bg-[#2d9450]"
                      disabled={profileLoading || isLoading || isCurrent || disableAllPaid}
                      onClick={() => void startCheckout(plan.key, 'stripe')}
                    >
                      Pay with Stripe (test)
                    </Button>
                    <Button
                      className="w-full"
                      variant="outline"
                      disabled={profileLoading || isLoading || isCurrent || disableAllPaid || !enablePayPal}
                      onClick={() => void startCheckout(plan.key, 'paypal')}
                    >
                      {enablePayPal ? 'Pay with PayPal (test)' : 'PayPal (disabled)'}
                    </Button>
                    <div className="grid grid-cols-2 gap-2">
                      <Button className="w-full" variant="outline" disabled={!enableApplePay}>
                        Apple Pay {enableApplePay ? '' : '(soon)'}
                      </Button>
                      <Button className="w-full" variant="outline" disabled={!enableGooglePay}>
                        Google Pay {enableGooglePay ? '' : '(soon)'}
                      </Button>
                    </div>
                    <Button className="w-full" variant="outline" disabled={!enableCrypto || !usdtAddress}>
                      Crypto (USDT) {enableCrypto && usdtAddress ? '' : '(soon)'}
                    </Button>
                    {enableCrypto && usdtAddress ? (
                      <p className="text-xs text-muted-foreground break-all">USDT address: {usdtAddress}</p>
                    ) : null}
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        <div className="mt-8 text-sm text-muted-foreground">
          <p>
            Dev note: Stripe/PayPal require server-side keys configured in the Supabase Edge Function environment. The UI
            won’t crash if keys are missing; buttons are disabled via `VITE_ENABLE_*` flags.
          </p>
        </div>
      </div>
    </div>
  );
}
