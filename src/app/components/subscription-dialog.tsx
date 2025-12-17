<<<<<<< HEAD
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
=======
import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { getUserSubscription, USER_SUBSCRIPTION_KEY, type SubscriptionPlan } from '../utils/data-limit';
import { updateMySubscriptionPlan } from '../utils/profile';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Separator } from './ui/separator';
>>>>>>> f8d36ea (Initial commit)

interface SubscriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SubscriptionDialog({ open, onOpenChange }: SubscriptionDialogProps) {
<<<<<<< HEAD
  const handleSubscribe = (plan: string, price: string) => {
    toast.info(`Redirecting to payment for ${plan} plan...`);
    console.log("Payment integration placeholder for:", plan, price);
  };

  const plans = [
    {
      name: "Free",
      icon: "⚡",
      price: "$0",
      period: "forever",
      description: "Perfect for getting started",
      features: [
        "Last 2 weeks of data only",
        "Up to 50 trades per month",
        "Basic calendar dashboard",
        "Manual trade entry",
        "Basic analytics",
        "Trade notes & tags",
      ],
      notIncluded: [
        "No historical data beyond 2 weeks",
        "No MT4/MT5 auto-sync",
        "No CSV/Excel export",
        "No advanced analytics",
=======
  const [currentPlan, setCurrentPlan] = useState<SubscriptionPlan>('free');
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (!open) return;

    const update = () => setCurrentPlan(getUserSubscription());
    update();

    window.addEventListener('subscription-changed', update);
    return () => window.removeEventListener('subscription-changed', update);
  }, [open]);

  const handleSubscribe = async (plan: SubscriptionPlan) => {
    if (isUpdating || plan === currentPlan) return;

    setIsUpdating(true);
    try {
      const ok = await updateMySubscriptionPlan(plan);
      if (!ok) {
        toast.error('Please sign in to change your subscription plan.');
        return;
      }

      localStorage.setItem(USER_SUBSCRIPTION_KEY, plan);
      window.dispatchEvent(new CustomEvent('subscription-changed', { detail: { plan } }));
      setCurrentPlan(plan);

      toast.success(`Plan updated: ${plan.toUpperCase()}`);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to update subscription plan', error);
      toast.error('Failed to update plan. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  const plans: Array<{
    key: SubscriptionPlan;
    name: string;
    icon: string;
    price: string;
    period: string;
    description: string;
    features: string[];
    notIncluded: string[];
    highlighted: boolean;
    popular: boolean;
  }> = [
    {
      key: 'free',
      name: 'Free',
      icon: '⚡',
      price: '$0',
      period: '14-day trial',
      description: 'Perfect for getting started',
      features: [
        'Up to 15 trades total',
        'Last 2 weeks of data only',
        'Basic calendar dashboard',
        'Manual trade entry',
        'Basic analytics',
        'Trade notes & tags',
      ],
      notIncluded: [
        'No trades after 15 or 14 days',
        'No MT4/MT5 auto-sync',
        'No CSV/Excel export',
        'No advanced analytics',
>>>>>>> f8d36ea (Initial commit)
      ],
      highlighted: false,
      popular: false,
    },
    {
<<<<<<< HEAD
      name: "Pro",
      icon: "👑",
      price: "$15.34",
      period: "/month",
      description: "For serious traders",
      features: [
        "Unlimited historical data",
        "Unlimited trades",
        "MT4/MT5 auto-sync (every 5 min)",
        "Advanced analytics & charts",
        "CSV/Excel export",
        "Performance insights",
        "Custom reports",
        "Priority email support",
        "Risk management tools",
=======
      key: 'pro',
      name: 'Pro',
      icon: '👑',
      price: '$15.34',
      period: '/month',
      description: 'For serious traders',
      features: [
        'Unlimited historical data',
        'Unlimited trades',
        'MT4/MT5 auto-sync (every 5 min)',
        'Advanced analytics & charts',
        'CSV/Excel export',
        'Performance insights',
        'Custom reports',
        'Priority email support',
        'Risk management tools',
>>>>>>> f8d36ea (Initial commit)
      ],
      notIncluded: [],
      highlighted: true,
      popular: true,
    },
    {
<<<<<<< HEAD
      name: "Premium",
      icon: "🚀",
      price: "$28.37",
      period: "/month",
      description: "For professional traders",
      features: [
        "Everything in Pro, plus:",
        "Real-time MT4/MT5 sync",
        "AI-powered trade insights",
        "Performance coaching tips",
        "Advanced risk analysis",
        "Multiple account management",
        "API access for integrations",
        "White-label reports",
        "Priority phone support",
=======
      key: 'premium',
      name: 'Premium',
      icon: '🚀',
      price: '$28.37',
      period: '/month',
      description: 'For professional traders',
      features: [
        'Everything in Pro, plus:',
        'Real-time MT4/MT5 sync',
        'AI-powered trade insights',
        'Performance coaching tips',
        'Advanced risk analysis',
        'Multiple account management',
        'API access for integrations',
        'White-label reports',
        'Priority phone support',
>>>>>>> f8d36ea (Initial commit)
      ],
      notIncluded: [],
      highlighted: false,
      popular: false,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* IMPORTANT: stretch dialog on desktop, keep mobile clean */}
      <DialogContent
        className="
          w-[95vw]
          max-w-none
          h-[90vh]
          overflow-y-auto
          p-0
        "
      >
        {/* Real container inside dialog */}
        <div className="mx-auto w-full max-w-7xl px-6 py-8">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-4xl text-center font-bold">
              Choose Your Plan
            </DialogTitle>
            <DialogDescription className="text-center text-base">
              Select the plan that best fits your trading needs. Cancel anytime.
            </DialogDescription>
          </DialogHeader>

          {/* Plans Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 mt-10 mb-6">
<<<<<<< HEAD
            {plans.map((plan) => (
              <Card
                key={plan.name}
                className={`flex flex-col relative overflow-hidden h-full transition-all ${
                  plan.highlighted
                    ? "border-[#34a85a] dark:border-[#34a85a] border-2 shadow-2xl shadow-green-200 dark:shadow-green-900/20 scale-[1.02] z-10"
                    : "border-border"
                }`}
              >
                {/* Header Section */}
                <div
                  className={`p-8 pb-6 text-center ${
                    plan.highlighted
                      ? "bg-gradient-to-br from-[#34a85a]/10 to-[#34a85a]/5"
                      : "bg-muted/30"
                  }`}
                >
                  {plan.popular && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#34a85a] hover:bg-[#2d9450] text-white border-0 px-4 py-1">
                      Most Popular
                    </Badge>
                  )}
=======
            {plans.map((plan) => {
              const isCurrent = currentPlan === plan.key;

              return (
                <Card
                  key={plan.key}
                  className={`flex flex-col relative overflow-hidden h-full transition-all ${
                    plan.highlighted
                      ? 'border-[#34a85a] dark:border-[#34a85a] border-2 shadow-2xl shadow-green-200 dark:shadow-green-900/20 scale-[1.02] z-10'
                      : 'border-border'
                  }`}
                >
                  {/* Header Section */}
                  <div
                    className={`p-8 pb-6 text-center ${plan.popular ? 'pt-14' : ''} ${
                      plan.highlighted
                        ? 'bg-gradient-to-br from-[#34a85a]/10 to-[#34a85a]/5'
                        : 'bg-muted/30'
                    }`}
                  >
                    {plan.popular && (
                      <Badge className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#34a85a] hover:bg-[#2d9450] text-white border-0 px-4 py-1 z-20">
                        Most Popular
                      </Badge>
                    )}
>>>>>>> f8d36ea (Initial commit)

                  {/* Icon */}
                  <div
                    className={`inline-flex items-center justify-center w-24 h-24 rounded-2xl mb-4 ${
<<<<<<< HEAD
                      plan.highlighted ? "bg-[#34a85a]" : "bg-muted"
=======
                      plan.highlighted ? 'bg-[#34a85a]' : 'bg-muted'
>>>>>>> f8d36ea (Initial commit)
                    }`}
                  >
                    <span className="text-5xl">{plan.icon}</span>
                  </div>

                  {/* Plan Name */}
                  <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground mb-6 min-h-[40px]">
                    {plan.description}
                  </p>

                  {/* Price */}
                  <div className="mb-3">
                    <div className="flex items-baseline justify-center gap-2">
                      <span className="font-bold tracking-tight whitespace-nowrap tabular-nums text-5xl md:text-4xl lg:text-5xl">
                        {plan.price}
                      </span>
                    </div>
                    <div className="text-muted-foreground text-sm mt-1">
                      {plan.period}
                    </div>
                  </div>
                </div>

                {/* Features Section */}
                <div className="p-6 flex-1 flex flex-col">
                  <ul className="space-y-3 mb-6 flex-1">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-[#34a85a] flex-shrink-0 mt-0.5" />
                        <span className="text-sm leading-relaxed">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Not Included */}
                  {plan.notIncluded.length > 0 && (
                    <>
                      <Separator className="mb-4" />
                      <div className="mb-6">
                        <p className="text-xs font-semibold text-muted-foreground mb-3">
                          Not included:
                        </p>
                        <ul className="space-y-2">
                          {plan.notIncluded.map((item, index) => (
                            <li
                              key={index}
                              className="flex items-start gap-2 text-xs text-muted-foreground"
                            >
                              <X className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-500" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </>
                  )}

                  {/* Button */}
                  <Button
                    size="lg"
                    className={`w-full mt-auto ${
<<<<<<< HEAD
                      plan.highlighted ? "bg-[#34a85a] hover:bg-[#2d9450] text-white" : ""
                    }`}
                    variant={plan.highlighted ? "default" : "outline"}
                    onClick={() => handleSubscribe(plan.name, plan.price)}
                    disabled={plan.name === "Free"}
                  >
                    {plan.name === "Free" ? "Current Plan" : `Get ${plan.name}`}
                  </Button>
                </div>
              </Card>
            ))}
=======
                      plan.highlighted ? 'bg-[#34a85a] hover:bg-[#2d9450] text-white' : ''
                    }`}
                    variant={plan.highlighted ? 'default' : 'outline'}
                    onClick={() => handleSubscribe(plan.key)}
                    disabled={isCurrent || isUpdating}
                  >
                    {isCurrent ? 'Current Plan' : plan.name === 'Free' ? 'Switch to Free' : `Get ${plan.name}`}
                  </Button>
                </div>
              </Card>
              );
            })}
>>>>>>> f8d36ea (Initial commit)
          </div>

          {/* Footer Info */}
          <div className="mt-6 pt-6 border-t">
            <div className="text-center space-y-3">
              <div className="flex flex-wrap justify-center gap-6 text-sm">
                <span className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#34a85a]" />
                  30-day money-back guarantee
                </span>
                <span className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#34a85a]" />
                  Cancel anytime
                </span>
                <span className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#34a85a]" />
                  Secure payment
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                All major payment methods accepted. Instant activation upon payment.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
