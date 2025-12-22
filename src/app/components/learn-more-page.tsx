import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { BookOpen, TrendingUp, Calendar, BarChart3, Target, Lightbulb } from 'lucide-react';

export function LearnMorePage() {
  const articles = [
    {
      icon: BookOpen,
      title: 'Getting Started with TJ',
      category: 'Basics',
      description: 'Learn the fundamentals of trade journaling and how TJ can help you become a better trader.',
      content: [
        'Trade journaling is the practice of recording every trade you make, including entry and exit points, position size, and the reasoning behind each decision.',
        'TJ makes this process seamless by providing an intuitive interface to log all your trading activities.',
        'By maintaining a detailed journal, you can identify patterns in your trading behavior, understand what works and what doesn\'t, and make data-driven improvements.',
      ],
    },
    {
      icon: Calendar,
      title: 'Using the Calendar Dashboard',
      category: 'Features',
      description: 'Master the calendar view to track your daily, weekly, and monthly trading performance.',
      content: [
        'The calendar dashboard provides a bird\'s-eye view of your trading activity. Each day shows your P&L and number of trades.',
        'Green indicates profitable days, red shows losses, and gray marks days when markets were closed.',
        'Weekly summaries on the right help you identify which weeks were most successful.',
        'Click on any date to see detailed trades for that day.',
        'Use the month navigation arrows to review historical performance.',
      ],
    },
    {
      icon: TrendingUp,
      title: 'Recording Your Trades',
      category: 'How-To',
      description: 'Step-by-step guide to logging trades manually or importing from your broker.',
      content: [
        '**Manual Entry:** Click "Add Trade" button, fill in symbol, entry/exit prices, quantity, and trade type (long/short).',
        '**File Import:** Click "Import" button, upload a CSV or MT report file (HTML/XML) to bring in your history.',
        '**Broker Import (MetaApi):** Use "Connect Broker" to securely connect your account and import full trade history (Pro/Premium plans).',
        'Always add notes about your trade setup, emotions, and lessons learned - this is where the real learning happens.',
        'Use tags to categorize trades by strategy, market condition, or setup type.',
      ],
    },
    {
      icon: BarChart3,
      title: 'Understanding Analytics',
      category: 'Analytics',
      description: 'Dive deep into your performance metrics and use data to improve your trading.',
      content: [
        '**Win Rate:** The percentage of winning trades. A high win rate doesn\'t always mean profitability if your losses are larger than wins.',
        '**Profit Factor:** Total profit divided by total loss. A profit factor above 1.5 is considered good.',
        '**Average Win/Loss:** Compare these to ensure your winners are larger than your losers.',
        '**Equity Curve:** Visual representation of your account growth over time. A smooth upward curve indicates consistent performance.',
        '**Best Performing Symbols:** Identify which instruments you trade best and focus on your strengths.',
      ],
    },
    {
      icon: Target,
      title: 'Setting Trading Goals',
      category: 'Strategy',
      description: 'Use TJ to set realistic goals and track your progress toward becoming a consistent trader.',
      content: [
        'Set monthly profit targets based on your account size and risk tolerance.',
        'Track your win rate goal - aim for gradual improvement rather than perfection.',
        'Monitor your risk-reward ratio - successful traders typically aim for 1:2 or better.',
        'Review your journal weekly to identify what\'s working and what needs adjustment.',
        'Focus on process goals (following your plan) rather than outcome goals (making money).',
      ],
    },
    {
      icon: Lightbulb,
      title: 'Pro Tips for Better Journaling',
      category: 'Tips',
      description: 'Advanced techniques to get the most value from your trading journal.',
      content: [
        '**Be Honest:** Record your emotions and mistakes. The journal is for you, not to impress anyone.',
        '**Review Regularly:** Set aside time each week to review your trades and look for patterns.',
        '**Add Screenshots:** Capture your chart setups to visualize what you saw at the time of entry.',
        '**Note Market Conditions:** Record whether markets were trending, ranging, volatile, or quiet.',
        '**Track Evolution:** Look back at trades from months ago to see how much you\'ve improved.',
        '**Focus on Quality:** It\'s better to trade less and journal thoroughly than to rush through entries.',
      ],
    },
  ];

  const faqs = [
    {
      question: 'Why should I keep a trading journal?',
      answer: 'A trading journal helps you learn from both wins and losses, identify patterns in your behavior, and make data-driven improvements to your strategy.',
    },
    {
      question: 'How often should I update my journal?',
      answer: 'Update your journal immediately after each trade while the details are fresh. Review your journal weekly to spot patterns and monthly for performance assessment.',
    },
    {
      question: 'What should I write in my trade notes?',
      answer: 'Record your trade setup, entry reasoning, emotions during the trade, mistakes made, and lessons learned. Be detailed and honest.',
    },
    {
      question: 'Can I import historical trades?',
      answer: 'Yes! TJ supports importing trades from MT4/MT5 history files and CSV formats. You can also manually enter historical trades.',
    },
    {
      question: 'How do I connect my MT4/MT5 broker account?',
      answer: 'TJ no longer requires an EA/connector. Use "Connect Broker" on the dashboard to connect via MetaApi and import your full account history (requires Pro or Premium plan).',
    },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl mb-4">Learn More About TJ</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Everything you need to know about trade journaling and how to use TJ to improve your trading performance
          </p>
        </div>

        {/* Articles Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {articles.map((article, index) => {
            const Icon = article.icon;
            return (
              <Card key={index} className="p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-start gap-4 mb-4">
                  <div className="p-3 rounded-lg bg-green-100 dark:bg-green-950">
                    <Icon className="w-6 h-6 text-[#34a85a] dark:text-green-400" />
                  </div>
                  <div className="flex-1">
                    <Badge variant="secondary" className="mb-2">
                      {article.category}
                    </Badge>
                    <h2 className="text-xl font-semibold mb-2">{article.title}</h2>
                    <p className="text-muted-foreground text-sm">{article.description}</p>
                  </div>
                </div>
                <div className="space-y-3 text-sm">
                  {article.content.map((paragraph, pIndex) => (
                    <p key={pIndex} className="leading-relaxed">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>

        {/* FAQ Section */}
        <div className="mb-12">
          <h2 className="text-3xl text-center mb-8">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <Card key={index} className="p-6">
                <h3 className="font-semibold mb-2">{faq.question}</h3>
                <p className="text-muted-foreground">{faq.answer}</p>
              </Card>
            ))}
          </div>
        </div>

        {/* CTA Section */}
        {/* Mobile: add breathing room and prevent badge overflow without changing desktop layout. */}
        <Card className="p-6 sm:p-8 text-center bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20">
          <h2 className="text-2xl mb-4">Ready to Improve Your Trading?</h2>
          <p className="text-muted-foreground mb-6">
            Start journaling your trades today and see the difference it makes in your performance
          </p>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-3 sm:gap-4">
            <Badge variant="secondary" className="px-4 py-2">
              ✓ Free to start
            </Badge>
            <Badge variant="secondary" className="px-4 py-2">
              ✓ No credit card required
            </Badge>
            <Badge variant="secondary" className="px-4 py-2">
              ✓ Upgrade anytime
            </Badge>
          </div>
        </Card>
      </div>
    </div>
  );
}
