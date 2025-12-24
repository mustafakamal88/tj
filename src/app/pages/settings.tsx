import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';

type Props = {
  onConnectBroker: () => void;
  onImport: () => void;
};

export function SettingsPage({ onConnectBroker, onImport }: Props) {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-3xl mb-2">Settings</h1>
      <p className="text-muted-foreground">Manage your account and integrations.</p>

      <div className="mt-8 grid gap-4">
        <Card className="p-5">
          <div className="text-sm font-medium">Integrations</div>
          <div className="mt-1 text-sm text-muted-foreground">Connect a broker account or import trade history.</div>
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <Button type="button" variant="outline" onClick={onConnectBroker}>
              Connect Broker
            </Button>
            <Button type="button" variant="outline" onClick={onImport}>
              Import
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
