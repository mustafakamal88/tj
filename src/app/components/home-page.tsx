import { Button } from './ui/button';
import { Card } from './ui/card';
import { TrendingUp, BookOpen, BarChart3, Calendar, Target, Shield } from 'lucide-react';

interface HomePageProps {
  onGetStarted: () => void;
  onLearnMore: () => void;
}

export function HomePage({ onGetStarted, onLearnMore }: HomePageProps) {
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

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-green-50 to-white dark:from-green-950/20 dark:to-background py-20 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 mb-6">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm">Professional Trading Journal</span>
          </div>
          
          <h1 className="text-4xl sm:text-5xl md:text-6xl mb-6 bg-gradient-to-r from-[#34a85a] to-[#2d9450] bg-clip-text text-transparent">
            Master Your Trading Journey with TJ
          </h1>
          
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Track, analyze, and improve your trading performance with our comprehensive journaling platform.
            Make data-driven decisions and become a better trader.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" onClick={onGetStarted} className="gap-2 bg-[#34a85a] hover:bg-[#2d9450]">
              <TrendingUp className="w-5 h-5" />
              Get Started Free
            </Button>
            <Button size="lg" variant="outline" onClick={onLearnMore}>
              Learn More
            </Button>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-4 bg-background">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl mb-4">
              Everything You Need to Succeed
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Our comprehensive suite of tools helps you track, analyze, and improve your trading performance.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <Card key={index} className="p-6 hover:shadow-lg transition-shadow">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#34a85a] to-[#2d9450] flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-br from-[#34a85a] to-[#2d9450]">
        <div className="max-w-4xl mx-auto text-center text-white">
          <h2 className="text-3xl sm:text-4xl mb-4">
            Ready to Transform Your Trading?
          </h2>
          <p className="text-lg mb-8 text-green-100">
            Join thousands of traders who are already tracking their progress and improving their results.
          </p>
          <Button size="lg" variant="secondary" onClick={onGetStarted} className="gap-2">
            <TrendingUp className="w-5 h-5" />
            Start Your Journey
          </Button>
        </div>
      </section>
    </div>
  );
}