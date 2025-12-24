import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Check, Link2 } from 'lucide-react';

type Props = {
  onGetStarted: () => void;
  onLearnMore: () => void;
};

export function BrokersPage({ onGetStarted, onLearnMore }: Props) {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
          <div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-3">Supported Brokers</h1>
            <p className="text-muted-foreground max-w-2xl">
              TJ supports manual journaling for any market, plus import and broker-connect workflows for MT4/MT5.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={onGetStarted}>Get started</Button>
            <Button variant="outline" onClick={onLearnMore}>Learn more</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold">MetaTrader 4</div>
                <div className="text-sm text-muted-foreground mt-1">Import history + broker connect (plan-based).</div>
              </div>
              <Badge variant="outline">MT4</Badge>
            </div>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2"><Check className="mt-0.5" />File import (HTML/XML/TXT)</li>
              <li className="flex items-start gap-2"><Check className="mt-0.5" />Background imports via MetaApi</li>
            </ul>
          </Card>

          <Card className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold">MetaTrader 5</div>
                <div className="text-sm text-muted-foreground mt-1">Import history + broker connect (plan-based).</div>
              </div>
              <Badge variant="outline">MT5</Badge>
            </div>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2"><Check className="mt-0.5" />File import (HTML/XML/TXT)</li>
              <li className="flex items-start gap-2"><Check className="mt-0.5" />Background imports via MetaApi</li>
            </ul>
          </Card>

          <Card className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold">Any Broker / Market</div>
                <div className="text-sm text-muted-foreground mt-1">Manual entry works everywhere.</div>
              </div>
              <Link2 className="text-muted-foreground" />
            </div>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2"><Check className="mt-0.5" />Manual trades with notes and tags</li>
              <li className="flex items-start gap-2"><Check className="mt-0.5" />Analytics and calendar views</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
