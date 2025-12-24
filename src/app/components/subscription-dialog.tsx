import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { toast } from 'sonner';
import type { SubscriptionPlan } from '../utils/data-limit';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Separator } from './ui/separator';
import { useProfile } from '../utils/use-profile';

interface SubscriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SubscriptionDialog({ open, onOpenChange }: SubscriptionDialogProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const { plan: currentPlan, loading: profileLoading } = useProfile();

  const handleSubscribe = async (plan: SubscriptionPlan) => {
    if (profileLoading || isUpdating || plan === currentPlan) return;
    setIsUpdating(true);
    try {
      if (plan === 'free') {
        toast.info('Downgrades are not implemented in MVP.');
        return;
      }
      window.dispatchEvent(new Event('open-billing'));
      onOpenChange(false);
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
      description: 'Try the essentials and build the habit',
      features: [
        'Up to 15 trades total',
        'Last 2 weeks of data only',
        'Basic calendar dashboard',
        'Manual trade entry',
        'Basic analytics',
        'Trade notes & screenshots',
      ],
      notIncluded: [
        'No trades after 15 or 14 days',
        'No broker connect (MetaApi)',
        'No automated import',
        'No advanced analytics',
      ],
      highlighted: false,
      popular: false,
    },
    {
      key: 'pro',
      name: 'Pro',
      icon: '👑',
      price: '$15.34',
      period: '/month',
      description: 'Unlimited trades + imports + advanced analytics',
      features: [
        'Unlimited historical data',
        'Unlimited trades',
        'Import from MT4/MT5 reports and CSV',
        'Broker connect (MetaApi) + full history import',
        'Advanced analytics & charts',
        'Day journal + screenshots',
      ],
      notIncluded: [],
      highlighted: true,
      popular: true,
    },
    {
      key: 'premium',
      name: 'Premium',
      icon: '🚀',
      price: '$28.37',
      period: '/month',
      description: 'Pro + priority access',
      features: [
        'Everything in Pro',
        'Priority badge',
        'Early access to new integrations (coming soon)',
      ],
      notIncluded: [],
      highlighted: false,
      popular: false,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Mobile: reduce cramped padding and use max-height + inner scrolling for smoother UX. */}
      <DialogContent
        className="
          w-[95vw]
          max-w-none
          max-h-[90dvh]
          md:max-h-[90vh]
          overflow-hidden
          p-0
        "
      >
        {/* Scroll container (keeps the close button accessible). */}
        <div className="mx-auto w-full max-w-7xl max-h-[90dvh] md:max-h-[90vh] overflow-y-auto overscroll-contain px-4 sm:px-6 py-6 sm:py-8">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-3xl sm:text-4xl text-center font-bold">
              Choose Your Plan
            </DialogTitle>
            <DialogDescription className="text-center text-sm sm:text-base">
              Select the plan that best fits your trading needs. Cancel anytime.
            </DialogDescription>
          </DialogHeader>

          {/* Plans Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-8 mt-8 sm:mt-10 mb-5 sm:mb-6">
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
                    className={`p-6 sm:p-8 pb-4 sm:pb-6 text-center ${plan.popular ? 'pt-12 sm:pt-14' : ''} ${
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

                  {/* Icon */}
                  <div
                    className={`inline-flex items-center justify-center w-20 h-20 sm:w-24 sm:h-24 rounded-2xl mb-3 sm:mb-4 ${
                      plan.highlighted ? 'bg-[#34a85a]' : 'bg-muted'
                    }`}
                  >
                    <span className="text-4xl sm:text-5xl">{plan.icon}</span>
                  </div>

                  {/* Plan Name */}
                  <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground mb-5 sm:mb-6 sm:min-h-[40px]">
                    {plan.description}
                  </p>

                  {/* Price */}
                  <div className="mb-3">
                    <div className="flex items-baseline justify-center gap-2">
                      <span className="font-bold tracking-tight whitespace-nowrap tabular-nums text-4xl sm:text-5xl md:text-4xl lg:text-5xl">
                        {plan.price}
                      </span>
                    </div>
                    <div className="text-muted-foreground text-sm mt-1">
                      {plan.period}
                    </div>
                  </div>
                </div>

                {/* Features Section */}
                <div className="p-5 pt-4 sm:p-6 sm:pt-6 flex-1 flex flex-col">
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
                      plan.highlighted ? 'bg-[#34a85a] hover:bg-[#2d9450] text-white' : ''
                    }`}
                    variant={plan.highlighted ? 'default' : 'outline'}
                    onClick={() => handleSubscribe(plan.key)}
                    disabled={isCurrent || isUpdating}
                  >
                    {isCurrent ? 'Current Plan' : plan.name === 'Free' ? 'Free' : `Upgrade to ${plan.name}`}
                  </Button>
                </div>
              </Card>
              );
            })}
          </div>

          {/* Footer Info */}
          <div className="mt-6 pt-6 border-t">
            <div className="text-center space-y-3">
              <div className="flex flex-wrap justify-center gap-4 sm:gap-6 text-sm">
                <span className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#34a85a]" />
                  Cancel anytime
                </span>
                <span className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#34a85a]" />
                  Secure payment
                </span>
                <span className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#34a85a]" />
                  Plan upgrades apply immediately
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                You can change your plan at any time.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
