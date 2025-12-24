import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Separator } from './ui/separator';
import { toast } from 'sonner';
import type { SubscriptionPlan } from '../utils/data-limit';
import { useProfile } from '../utils/use-profile';
import { useAuth } from '../utils/auth';
import { invokeBilling, invokeBillingHealth, invokeBillingUrl } from '../utils/billing';
import { getSupabaseClient } from '../utils/supabase';
import { hasPaidEntitlement } from '../utils/entitlements';

type PaymentMethod = 'stripe' | 'paypal' | 'applepay' | 'googlepay' | 'crypto';

const isEnabled = (key: string) => (import.meta.env[key] as string | undefined) === 'true';

export function BillingPage() {
  const [isLoading, setIsLoading] = useState(false);
  const { profile, plan, isActive, loading: profileLoading, refresh } = useProfile();
  const { user, loading: authLoading } = useAuth();
  const paidActiveRef = useRef(false);
  const pollTimerRef = useRef<number | null>(null);
  const handledReturnRef = useRef(false);

  const enablePayPal = isEnabled('VITE_ENABLE_PAYPAL');
  const enableApplePay = isEnabled('VITE_ENABLE_APPLEPAY');
  const enableGooglePay = isEnabled('VITE_ENABLE_GOOGLEPAY');
  const enableCrypto = isEnabled('VITE_ENABLE_CRYPTO');
  const usdtAddress = (import.meta.env.VITE_USDT_ADDRESS as string | undefined) ?? '';
  const isPaidActive = !profileLoading && !!profile && hasPaidEntitlement(profile);
  const currentPlan: SubscriptionPlan | null = profileLoading ? null : isPaidActive ? plan : 'free';
  const isProActive = isPaidActive && plan === 'pro';
  const isPremiumActive = isPaidActive && plan === 'premium';

  const plans = useMemo(
    () =>
      [
        {
          key: 'free' as const,
          name: 'Free',
          price: '$0',
          period: '14-day trial',
          description: 'Try the essentials.',
          bullets: ['Manual entry only', 'No imports', 'No broker connect', 'Up to 15 trades during trial'],
          highlighted: false,
        },
        {
          key: 'pro' as const,
          name: 'Pro',
          price: '$15.34',
          period: '/month',
          description: 'Unlimited trades + imports.',
          bullets: ['Unlimited trades', 'CSV/XML/HTML imports', 'Broker connect (MetaApi)', 'Advanced analytics'],
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

  const startCheckout = async (plan: Exclude<SubscriptionPlan, 'free'>, method: PaymentMethod) => {
    if (isLoading) return;
    if (!user && !authLoading) {
      toast.error('Please login to subscribe.');
      return;
    }
    setIsLoading(true);
    try {
      if (method === 'stripe') {
        const { url } = await invokeBilling('create_checkout_session', { plan });
        window.location.assign(url);
        return;
      }
      if (method === 'paypal') {
        if (!enablePayPal) throw new Error('PayPal is disabled. Set VITE_ENABLE_PAYPAL=true.');
        const { url } = await invokeBillingUrl('paypal_create_subscription', { plan });
        window.location.assign(url);
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

  const openPortal = async () => {
    if (isLoading) return;
    if (!user && !authLoading) {
      toast.error('Please login to manage your subscription.');
      return;
    }
    setIsLoading(true);
    try {
      const { url } = await invokeBilling('create_portal_session');
      window.location.assign(url);
    } catch (error) {
      console.error('[billing] portal failed', error);
      toast.error(error instanceof Error ? error.message : 'Failed to open Stripe portal.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    paidActiveRef.current = isPaidActive;
  }, [isPaidActive]);

  useEffect(() => {
    // Always fetch the latest profile on Billing mount/login (local state can be stale after Stripe redirect).
    if (authLoading) return;
    if (!user) return;
    void refresh();
  }, [authLoading, user?.id, refresh]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (handledReturnRef.current) return;

    const params = new URLSearchParams(window.location.search);
    const canceled = params.get('checkout') === 'cancel';

    const clearQueryParams = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete('checkout');
      window.history.replaceState({}, '', url.toString());
    };

    if (canceled) {
      handledReturnRef.current = true;
      toast.info('Checkout canceled.');
      clearQueryParams();
    }
  }, [authLoading, user?.id, refresh]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    void (async () => {
      try {
        const res = await invokeBillingHealth();
        console.log('[billing] health ok', res);
      } catch (e) {
        console.log('[billing] health failed', e);
      }
    })();
  }, [authLoading, user?.id]);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-start justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl mb-2">Billing</h1>
            <p className="text-muted-foreground">Upgrade to unlock imports, broker connect, and advanced analytics.</p>
            </div>
          <div className="flex items-center gap-2">
            {profileLoading || !profile ? (
              <Badge variant="secondary">Loading…</Badge>
            ) : (
              <Badge
                variant="secondary"
                className={isPaidActive ? 'bg-[#34a85a] text-white border-transparent' : undefined}
              >
                {isPaidActive ? `Current: ${plan.toUpperCase()}` : 'Current: FREE'}
              </Badge>
            )}
            {!profileLoading && (isActive || !!profile?.stripeCustomerId) ? (
              <Button variant="outline" disabled={isLoading} onClick={() => void openPortal()}>
                Manage subscription
              </Button>
            ) : null}
          </div>
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
                    {plan.key === 'pro' && isPremiumActive ? (
                      <Button className="w-full" variant="outline" disabled>
                        Included with Premium
                      </Button>
                    ) : plan.key === 'pro' && isProActive ? (
                      <Button className="w-full" variant="outline" disabled>
                        Current plan
                      </Button>
                    ) : plan.key === 'premium' && isPremiumActive ? (
                      <Button className="w-full" variant="outline" disabled>
                        Current plan
                      </Button>
                    ) : plan.key === 'premium' && isProActive ? (
                      <Button
                        className="w-full bg-[#34a85a] hover:bg-[#2d9450]"
                        disabled={profileLoading || isLoading}
                        onClick={() => void startCheckout('premium', 'stripe')}
                      >
                        Upgrade to Premium
                      </Button>
                    ) : (
                      <>
                        <Button
                          className="w-full bg-[#34a85a] hover:bg-[#2d9450]"
                          disabled={profileLoading || isLoading || isCurrent}
                          onClick={() => void startCheckout(plan.key, 'stripe')}
                        >
                          Continue with Stripe
                        </Button>
                        <Button
                          className="w-full"
                          variant="outline"
                          disabled={profileLoading || isLoading || isCurrent || !enablePayPal || isPaidActive}
                          onClick={() => void startCheckout(plan.key, 'paypal')}
                        >
                          {enablePayPal ? 'Continue with PayPal' : 'PayPal (disabled)'}
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
                      </>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        <div className="mt-8 text-sm text-muted-foreground">
          <p>
            Payment methods may show as disabled depending on configuration.
          </p>
        </div>
      </div>
    </div>
  );
}
