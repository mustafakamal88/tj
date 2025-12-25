import { Card } from './ui/card';

export function BrokerMetricsCard() {
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Broker Metrics</h2>
          <p className="text-xs text-muted-foreground">Coming soon</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Broker metrics integration will be added in a future update. Analytics above are based on the trades already stored in your journal.
      </p>
    </Card>
  );
}
