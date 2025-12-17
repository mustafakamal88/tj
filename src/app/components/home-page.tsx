import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { Separator } from './ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { SiteFooter } from './site-footer';
import { BarChart3, BookOpen, Calendar, Check, Shield, Target, TrendingUp } from 'lucide-react';

interface HomePageProps {
  onGetStarted: () => void;
  onLearnMore: () => void;
}

export function HomePage({ onGetStarted, onLearnMore }: HomePageProps) {
  const openPlans = () => window.dispatchEvent(new Event('open-subscription-dialog'));

  const features = [
    {
      icon: Calendar,
      title: 'Calendar Dashboard',
      description: 'Track your trades with an intuitive calendar view that shows your trading activity at a glance.',
    },
    {
      icon: BookOpen,
      title: 'Detailed Journaling',
      description: 'Record every detail of your trades including entry, exit, notes, and emotional states.',
    },
    {
      icon: BarChart3,
      title: 'Advanced Analytics',
      description: 'Gain insights with comprehensive statistics, charts, and performance metrics.',
    },
    {
      icon: Target,
      title: 'Track Performance',
      description: 'Monitor your win rate, profit/loss, and identify patterns in your trading behavior.',
    },
    {
      icon: TrendingUp,
      title: 'Growth Tracking',
      description: 'Visualize your progress over time with detailed equity curves and growth charts.',
    },
    {
      icon: Shield,
      title: 'Secure & Private',
      description: 'Your trading data is stored securely and remains completely private.',
    },
  ];

  const steps = [
    {
      title: 'Capture every trade',
      description: 'Log entries, exits, and notes in seconds—manual entry, imports, or MT4/MT5 sync (plan-based).',
    },
    {
      title: 'Review with clarity',
      description: 'See performance on a calendar, filter by strategy, and spot mistakes before they repeat.',
    },
    {
      title: 'Improve systematically',
      description: 'Use analytics to validate what works, refine risk, and build consistent habits over time.',
    },
  ];

  const faqs = [
    {
      question: 'Is TJ free to try?',
      answer: 'Yes. Start with the free plan to explore core features. Upgrade anytime when you need more data and automation.',
    },
    {
      question: 'Can I import trades or sync MT4/MT5?',
      answer: 'You can import trades, and paid plans add MT4/MT5 synchronization options for faster logging.',
    },
    {
      question: 'Is my data private?',
      answer: 'Your journal is designed for personal analysis. Keep detailed notes and review safely whenever you need.',
    },
  ];

  const plans = [
    {
      name: 'Free',
      price: '$0',
      period: '14-day trial',
      description: 'Try the essentials and build the habit.',
      bullets: ['Up to 15 trades total', 'Basic calendar dashboard', 'Manual trade entry'],
      highlighted: false,
    },
    {
      name: 'Pro',
      price: '$15.34',
      period: '/month',
      description: 'For consistent traders who want more automation.',
      bullets: ['Unlimited trades & history', 'MT4/MT5 auto-sync', 'Advanced analytics & export'],
      highlighted: true,
    },
    {
      name: 'Premium',
      price: '$28.37',
      period: '/month',
      description: 'For advanced workflows and deeper insights.',
      bullets: ['Real-time sync', 'AI-powered insights', 'Multiple accounts & API access'],
      highlighted: false,
    },
  ];

  const sampleBars = [22, 28, 18, 34, 30, 44, 38, 52, 46, 60];

  return (
    <div id="top" className="min-h-[calc(100vh-4rem)] bg-background">
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-green-50/80 via-background to-background dark:from-green-950/25" />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-sm">Professional Trading Journal</span>
                </div>

                <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-balance">
                  Turn trades into{' '}
                  <span className="bg-gradient-to-r from-[#34a85a] to-[#2d9450] bg-clip-text text-transparent">
                    actionable insights
                  </span>
                  .
                </h1>

                <p className="mt-6 text-lg text-muted-foreground max-w-xl">
                  Capture context, analyze results, and identify patterns across your strategies—without spreadsheets.
                </p>

                <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#34a85a] mt-0.5" />
                    Calendar dashboard with daily performance snapshots
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#34a85a] mt-0.5" />
                    Clean journaling with tags, notes, and trade context
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#34a85a] mt-0.5" />
                    Analytics that help you improve risk and consistency
                  </li>
                </ul>

                <div className="mt-8 flex flex-col sm:flex-row gap-3">
                  <Button size="lg" onClick={onGetStarted} className="gap-2 bg-[#34a85a] hover:bg-[#2d9450]">
                    <TrendingUp className="w-5 h-5" />
                    Get started free
                  </Button>
                  <Button size="lg" variant="outline" onClick={onLearnMore}>
                    Learn more
                  </Button>
                  <Button size="lg" variant="ghost" onClick={openPlans}>
                    View pricing
                  </Button>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Private by design
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    14-day trial
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Upgrade anytime
                  </span>
                </div>
              </div>

              {/* Preview */}
              <div className="relative">
                <div className="absolute -inset-6 -z-10 rounded-3xl bg-gradient-to-tr from-[#34a85a]/20 via-transparent to-sky-500/20 blur-2xl" />
                <Card className="p-6 border-[#34a85a]/15 bg-background/70 backdrop-blur-sm shadow-xl">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">Dashboard preview</p>
                      <p className="text-xs text-muted-foreground">Sample data</p>
                    </div>
                    <Badge variant="secondary" className="whitespace-nowrap">
                      This month
                    </Badge>
                  </div>

                  <Separator className="my-5" />

                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border bg-card p-3">
                      <p className="text-[11px] text-muted-foreground">Win rate</p>
                      <p className="mt-1 text-lg font-semibold">58%</p>
                    </div>
                    <div className="rounded-lg border bg-card p-3">
                      <p className="text-[11px] text-muted-foreground">Net P&L</p>
                      <p className="mt-1 text-lg font-semibold text-green-600">+$1,240</p>
                    </div>
                    <div className="rounded-lg border bg-card p-3">
                      <p className="text-[11px] text-muted-foreground">Trades</p>
                      <p className="mt-1 text-lg font-semibold">32</p>
                    </div>
                  </div>

                  <div className="mt-5 rounded-lg border bg-card p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-medium">Equity curve</p>
                      <BarChart3 className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex items-end gap-1 h-16" aria-hidden="true">
                      {sampleBars.map((h, i) => (
                        <div
                          key={i}
                          className="w-full rounded-sm bg-gradient-to-t from-[#34a85a]/80 to-[#34a85a]/30"
                          style={{ height: `${h}%` }}
                        />
                      ))}
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="py-20 scroll-mt-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-4">
                Everything you need to trade with discipline
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Build a repeatable process: capture details, review outcomes, and tighten execution over time.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <Card
                    key={index}
                    className="group p-6 transition-all hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#34a85a] to-[#2d9450] flex items-center justify-center mb-4 shadow-sm">
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="mb-2 font-semibold">{feature.title}</h3>
                    <p className="text-muted-foreground">{feature.description}</p>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Workflow */}
        <section id="workflow" className="py-20 bg-muted/20 scroll-mt-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-10 items-start">
              <div>
                <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-4">
                  A simple workflow that compounds
                </h2>
                <p className="text-muted-foreground max-w-xl">
                  Journaling only works if it’s easy. TJ keeps the loop tight so you can focus on execution.
                </p>
              </div>

              <div className="space-y-4">
                {steps.map((step, index) => (
                  <Card key={step.title} className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex items-center justify-center size-9 rounded-lg bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 font-semibold">
                        {index + 1}
                      </div>
                      <div>
                        <h3 className="font-semibold mb-1">{step.title}</h3>
                        <p className="text-muted-foreground text-sm">{step.description}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="py-20 scroll-mt-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-6 mb-10">
              <div>
                <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-3">
                  Pricing that fits your stage
                </h2>
                <p className="text-muted-foreground max-w-2xl">
                  Start free, then upgrade when you need more history, automation, and deeper analytics.
                </p>
              </div>
              <Button variant="outline" onClick={openPlans}>
                Compare full plans
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {plans.map((plan) => (
                <Card
                  key={plan.name}
                  className={`p-6 h-full ${
                    plan.highlighted ? 'border-[#34a85a]/60 shadow-lg' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-semibold">{plan.name}</h3>
                      <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
                    </div>
                    {plan.highlighted ? (
                      <Badge className="bg-[#34a85a] hover:bg-[#2d9450] text-white border-0">
                        Popular
                      </Badge>
                    ) : null}
                  </div>

                  <div className="mt-6 flex items-baseline gap-2">
                    <span className="text-4xl font-semibold tracking-tight tabular-nums">
                      {plan.price}
                    </span>
                    <span className="text-sm text-muted-foreground">{plan.period}</span>
                  </div>

                  <ul className="mt-6 space-y-3">
                    {plan.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-2 text-sm">
                        <Check className="w-4 h-4 text-[#34a85a] mt-0.5" />
                        <span className="text-muted-foreground">{bullet}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    className={`mt-8 w-full ${
                      plan.highlighted ? 'bg-[#34a85a] hover:bg-[#2d9450]' : ''
                    }`}
                    variant={plan.highlighted ? 'default' : 'outline'}
                    onClick={openPlans}
                  >
                    {plan.name === 'Free' ? 'Start free' : `Choose ${plan.name}`}
                  </Button>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-16 bg-muted/20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-semibold tracking-tight mb-3">Frequently asked questions</h2>
              <p className="text-muted-foreground">
                Quick answers to common questions. For deeper guides, open Learn More.
              </p>
            </div>

            <Card className="p-6">
              <Accordion type="single" collapsible>
                {faqs.map((faq) => (
                  <AccordionItem key={faq.question} value={faq.question}>
                    <AccordionTrigger>{faq.question}</AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">{faq.answer}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </Card>

            <div className="flex justify-center mt-8">
              <Button variant="outline" onClick={onLearnMore} className="gap-2">
                <BookOpen className="w-4 h-4" />
                Browse guides
              </Button>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 bg-gradient-to-br from-[#34a85a] to-[#2d9450]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-white">
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-4">
              Ready to trade with more consistency?
            </h2>
            <p className="text-lg mb-8 text-green-100">
              Start journaling today and build a review process that actually improves results.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3">
              <Button size="lg" variant="secondary" onClick={onGetStarted} className="gap-2">
                <TrendingUp className="w-5 h-5" />
                Start free
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={openPlans}
                className="bg-white/0 border-white/30 text-white hover:bg-white/10 hover:text-white"
              >
                View plans
              </Button>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter onGetStarted={onGetStarted} onLearnMore={onLearnMore} />
    </div>
  );
}
