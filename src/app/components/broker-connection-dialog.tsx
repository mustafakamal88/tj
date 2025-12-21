import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import {
  connectMetaApi,
  getMetaApiStatus,
  importMetaApi,
  type BrokerConnection,
  type BrokerEnvironment,
  type BrokerPlatform,
} from '../utils/broker-import-api';

interface BrokerConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
}

function formatWhen(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function statusBadgeVariant(status: BrokerConnection['status']): 'secondary' | 'default' | 'destructive' {
  if (status === 'connected' || status === 'imported') return 'default';
  if (status === 'error') return 'destructive';
  return 'secondary';
}

export function BrokerConnectionDialog({ open, onOpenChange, onImportComplete }: BrokerConnectionDialogProps) {
  const [connections, setConnections] = useState<BrokerConnection[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [importing, setImporting] = useState(false);

  const [platform, setPlatform] = useState<BrokerPlatform>('mt5');
  const [environment, setEnvironment] = useState<BrokerEnvironment>('demo');
  const [server, setServer] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');

  const selected = useMemo(
    () => connections.find((c) => c.id === selectedId) ?? null,
    [connections, selectedId],
  );

  const refresh = async () => {
    setLoadingStatus(true);
    try {
      const data = await getMetaApiStatus();
      setConnections(data.connections);
      if (!selectedId && data.connections.length) setSelectedId(data.connections[0].id);
    } catch (e) {
      console.error('[broker] status failed', e);
      toast.error(e instanceof Error ? e.message : 'Failed to load broker connections.');
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open]);

  const handleConnect = async () => {
    if (!server.trim() || !login.trim() || !password) {
      toast.error('Server, login, and password are required.');
      return;
    }

    setConnecting(true);
    try {
      const { connection } = await connectMetaApi({
        platform,
        environment,
        server: server.trim(),
        login: login.trim(),
        password,
      });

      toast.success('Broker connected');
      setPassword('');
      await refresh();
      setSelectedId(connection.id);
    } catch (e) {
      console.error('[broker] connect failed', e);
      toast.error(e instanceof Error ? e.message : 'Connect failed.');
    } finally {
      setConnecting(false);
    }
  };

  const handleImport = async () => {
    if (!selectedId) {
      toast.error('Select a connection first.');
      return;
    }

    setImporting(true);
    try {
      const result = await importMetaApi({ connectionId: selectedId });
      toast.success(`Imported ${result.upserted} trades`);
      await refresh();
      onImportComplete?.();
    } catch (e) {
      console.error('[broker] import failed', e);
      toast.error(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Connect Broker (MetaApi)</DialogTitle>
          <DialogDescription>
            Connect using your broker server + login + password, then import closed trade history. TJ never stores your
            password.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Connections</h3>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => void refresh()} disabled={loadingStatus}>
                <RefreshCw className={loadingStatus ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                Refresh
              </Button>
            </div>

            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger>
                <SelectValue placeholder={connections.length ? 'Select connection' : 'No connections yet'} />
              </SelectTrigger>
              <SelectContent>
                {connections.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.platform.toUpperCase()} {c.environment.toUpperCase()} — {c.server ?? '—'} — {c.login ?? '—'} ({c.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selected && (
              <div className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-muted-foreground">
                    <span className="font-medium text-foreground">{selected.login ?? '—'}</span>
                    <span className="ml-2">@ {selected.server ?? '—'}</span>
                    <span className="ml-2">
                      ({selected.platform.toUpperCase()} {selected.environment.toUpperCase()})
                    </span>
                  </div>
                  <Badge variant={statusBadgeVariant(selected.status)}>{selected.status}</Badge>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-1 text-muted-foreground sm:grid-cols-2">
                  <div>Created: {formatWhen(selected.createdAt)}</div>
                  <div>Last import: {formatWhen(selected.lastImportAt)}</div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg border p-4 space-y-4">
            <h3 className="text-sm font-medium">Connect a new account</h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Platform</Label>
                <Select value={platform} onValueChange={(v) => setPlatform(v as BrokerPlatform)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mt5">MetaTrader 5</SelectItem>
                    <SelectItem value="mt4">MetaTrader 4</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Account Type</Label>
                <Select value={environment} onValueChange={(v) => setEnvironment(v as BrokerEnvironment)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="demo">Demo</SelectItem>
                    <SelectItem value="live">Live</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Server</Label>
                <Input value={server} onChange={(e) => setServer(e.target.value)} placeholder="Exness-MT5Trial" />
              </div>

              <div className="space-y-2">
                <Label>Login</Label>
                <Input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="Account login" />
              </div>

              <div className="space-y-2">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Investor/Read-only password preferred"
                />
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button
                onClick={() => void handleConnect()}
                disabled={connecting || !server.trim() || !login.trim() || !password}
                className="gap-2"
              >
                {connecting ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" /> : null}
                Connect
              </Button>
            </div>
          </div>

          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="text-sm font-medium">Import</h3>
            <p className="text-sm text-muted-foreground">
              Imports closed deals from MetaApi and upserts them into your TJ trades. You can safely re-run imports —
              duplicates won&apos;t be created.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                onClick={() => void handleImport()}
                disabled={importing || !selectedId}
                className="gap-2"
              >
                {importing ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" /> : null}
                Import Full History
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
