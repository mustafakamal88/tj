import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Switch } from './ui/switch';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';
import { Activity, CheckCircle2, Copy, XCircle } from 'lucide-react';
import { useProfile } from '../utils/use-profile';
import { mtConnect, mtDisconnect, mtStatus, type MtAccountType, type MtPlatform } from '../../lib/mtBridge';

interface MTConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SavedMtConnection = {
  method: 'connector';
  platform: MtPlatform;
  server: string;
  account: string;
  accountType?: MtAccountType;
  autoSync: boolean;
  connectedAt: string;
  lastSyncAt?: string;
};

const MT_CONNECTION_STORAGE_KEY = 'mt-connection';

function parseSavedConnection(raw: string | null): Partial<SavedMtConnection> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Partial<SavedMtConnection>;
  } catch {
    return null;
  }
}

export function MTConnectionDialog({ open, onOpenChange }: MTConnectionDialogProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [autoSync, setAutoSync] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [syncKey, setSyncKey] = useState<string | null>(null);
  const [syncUrl, setSyncUrl] = useState<string | null>(null);
  const [connectedPlatform, setConnectedPlatform] = useState<MtPlatform | null>(null);
  const [connectedAt, setConnectedAt] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  // MT4
  const [mt4Server, setMt4Server] = useState('');
  const [mt4Account, setMt4Account] = useState('');
  const [mt4AccountType, setMt4AccountType] = useState<MtAccountType>('live');

  // MT5
  const [mt5Server, setMt5Server] = useState('');
  const [mt5Account, setMt5Account] = useState('');
  const [mt5AccountType, setMt5AccountType] = useState<MtAccountType>('live');

  const { plan, isActive } = useProfile();
  const effectivePlan = isActive ? plan : 'free';
  const isAutoSyncLocked = effectivePlan === 'free';

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const status = await mtStatus();

        if (!status.connected || !status.connection) {
          setIsConnected(false);
          setSyncKey(null);
          setSyncUrl(null);
          setConnectedPlatform(null);
          setConnectedAt(null);
          setLastSyncAt(null);
          return;
        }

        const conn = status.connection;
        setIsConnected(true);
        setAutoSync(Boolean(conn.autoSync));
        setConnectedPlatform(conn.platform);
        setConnectedAt(conn.connectedAt ?? null);
        setLastSyncAt(conn.lastSyncAt ?? null);

        setSyncKey(status.syncKey ?? null);
        setSyncUrl(status.syncUrl ?? null);

        const parsed = parseSavedConnection(localStorage.getItem(MT_CONNECTION_STORAGE_KEY));

        if (conn.platform === 'MT4') {
          setMt4Server(conn.server ?? '');
          if (parsed?.platform === 'MT4' && typeof parsed.account === 'string') setMt4Account(parsed.account);
          if (conn.accountType === 'live' || conn.accountType === 'demo') setMt4AccountType(conn.accountType);
        } else if (conn.platform === 'MT5') {
          setMt5Server(conn.server ?? '');
          if (parsed?.platform === 'MT5' && typeof parsed.account === 'string') setMt5Account(parsed.account);
          if (conn.accountType === 'live' || conn.accountType === 'demo') setMt5AccountType(conn.accountType);
        }
      } catch (e) {
        console.error('MT status error', e);
        const parsed = parseSavedConnection(localStorage.getItem(MT_CONNECTION_STORAGE_KEY));
        if (!parsed?.platform || !parsed.server || !parsed.account) return;

        setIsConnected(true);
        setAutoSync(Boolean(parsed.autoSync));
        setConnectedPlatform(parsed.platform);
        setConnectedAt(parsed.connectedAt ?? null);
        setLastSyncAt(parsed.lastSyncAt ?? null);
      }
    })();
  }, [open]);

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleConnect = async (platform: MtPlatform) => {
    setIsConnecting(true);

    try {
      const server = platform === 'MT4' ? mt4Server : mt5Server;
      const accountNumber = platform === 'MT4' ? mt4Account : mt5Account;
      const accountType = platform === 'MT4' ? mt4AccountType : mt5AccountType;
      const desiredAutoSync = isAutoSyncLocked ? false : autoSync;

      if (!server || !accountNumber) {
        toast.error('Server and account number are required.');
        return;
      }

      const result = await mtConnect({
        platform,
        server,
        accountNumber,
        accountType,
        autoSync: desiredAutoSync,
      });

      const connectionData: SavedMtConnection = {
        method: 'connector',
        platform,
        server,
        account: accountNumber,
        accountType,
        autoSync: desiredAutoSync,
        connectedAt: result.connectedAt,
        lastSyncAt: result.connection.lastSyncAt,
      };

      localStorage.setItem(MT_CONNECTION_STORAGE_KEY, JSON.stringify(connectionData));
      localStorage.setItem('mt-auto-sync', String(connectionData.autoSync));

      setIsConnected(true);
      setSyncKey(result.syncKey);
      setSyncUrl(result.syncUrl);
      setConnectedPlatform(platform);
      setConnectedAt(result.connectedAt);
      setLastSyncAt(result.connection.lastSyncAt ?? null);

      window.dispatchEvent(new Event('mt-connection-changed'));
      toast.success(`Connected to ${platform}`);

      if (isAutoSyncLocked) {
        toast.info('Auto-refresh is available on Pro/Premium. You can still refresh manually.');
      } else if (desiredAutoSync) {
        toast.info('Auto-refresh enabled (while the app is open).');
      }

      if (result.warning) {
        toast.info(result.warning);
      }
    } catch (error) {
      console.error('MT connect error', error);
      toast.error(error instanceof Error ? error.message : 'Connection failed. Please try again.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await mtDisconnect();
    } catch {
      // ignore — we still clear local state
    }

    localStorage.removeItem(MT_CONNECTION_STORAGE_KEY);
    localStorage.removeItem('mt-auto-sync');
    setIsConnected(false);
    setSyncKey(null);
    setSyncUrl(null);
    setConnectedPlatform(null);
    setConnectedAt(null);
    setLastSyncAt(null);
    window.dispatchEvent(new Event('mt-connection-changed'));
    toast.success('Disconnected from MetaTrader');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Connect MT4/MT5 Account</DialogTitle>
          <DialogDescription>Connect your MetaTrader account for automatic trade synchronization</DialogDescription>
        </DialogHeader>

        <Card className="p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isConnected ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <div>
                    <p className="font-medium">Connected</p>
                    <p className="text-sm text-muted-foreground">
                      {connectedPlatform ? `${connectedPlatform} · ` : ''}
                      Connector (EA) · Auto-refresh: {autoSync ? 'Enabled' : 'Disabled'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {lastSyncAt ? `Last sync: ${new Date(lastSyncAt).toLocaleString()}` : 'Last sync: —'}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Not Connected</p>
                    <p className="text-sm text-muted-foreground">Connect to start syncing trades</p>
                  </div>
                </>
              )}
            </div>

            {isConnected && (
              <Button variant="outline" onClick={() => void handleDisconnect()}>
                Disconnect
              </Button>
            )}
          </div>
        </Card>

        {!isConnected && (
          <Tabs defaultValue="mt4" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="mt4">MetaTrader 4</TabsTrigger>
              <TabsTrigger value="mt5">MetaTrader 5</TabsTrigger>
            </TabsList>

            <TabsContent value="mt4" className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="mt4-server">Server</Label>
                  <Input
                    id="mt4-server"
                    placeholder="e.g., BrokerName-Live"
                    value={mt4Server}
                    onChange={(e) => setMt4Server(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mt4-account">Account Number</Label>
                  <Input
                    id="mt4-account"
                    placeholder="Your MT4 account number"
                    value={mt4Account}
                    onChange={(e) => setMt4Account(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Account Type</Label>
                  <Select value={mt4AccountType} onValueChange={(v) => setMt4AccountType(v as MtAccountType)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select account type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="live">Live</SelectItem>
                      <SelectItem value="demo">Demo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-0.5">
                    <Label htmlFor="auto-sync-mt4">Auto-Refresh</Label>
                    <p className="text-sm text-muted-foreground">Automatically refresh trades every 5 minutes</p>
                  </div>
                  <Switch
                    id="auto-sync-mt4"
                    checked={autoSync}
                    onCheckedChange={(value) => {
                      if (isAutoSyncLocked && value) {
                        toast.error('Auto-refresh requires Pro or Premium.');
                        window.dispatchEvent(new Event('open-subscription-dialog'));
                        return;
                      }
                      setAutoSync(value);
                    }}
                    disabled={isAutoSyncLocked}
                  />
                </div>

                <Button
                  onClick={() => void handleConnect('MT4')}
                  disabled={!mt4Server || !mt4Account || isConnecting}
                  className="w-full"
                >
                  {isConnecting ? (
                    <>
                      <Activity className="w-4 h-4 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    'Connect MT4'
                  )}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="mt5" className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="mt5-server">Server</Label>
                  <Input
                    id="mt5-server"
                    placeholder="e.g., BrokerName-Live"
                    value={mt5Server}
                    onChange={(e) => setMt5Server(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mt5-account">Account Number</Label>
                  <Input
                    id="mt5-account"
                    placeholder="Your MT5 account number"
                    value={mt5Account}
                    onChange={(e) => setMt5Account(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Account Type</Label>
                  <Select value={mt5AccountType} onValueChange={(v) => setMt5AccountType(v as MtAccountType)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select account type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="live">Live</SelectItem>
                      <SelectItem value="demo">Demo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-0.5">
                    <Label htmlFor="auto-sync-mt5">Auto-Refresh</Label>
                    <p className="text-sm text-muted-foreground">Automatically refresh trades every 5 minutes</p>
                  </div>
                  <Switch
                    id="auto-sync-mt5"
                    checked={autoSync}
                    onCheckedChange={(value) => {
                      if (isAutoSyncLocked && value) {
                        toast.error('Auto-refresh requires Pro or Premium.');
                        window.dispatchEvent(new Event('open-subscription-dialog'));
                        return;
                      }
                      setAutoSync(value);
                    }}
                    disabled={isAutoSyncLocked}
                  />
                </div>

                <Button
                  onClick={() => void handleConnect('MT5')}
                  disabled={!mt5Server || !mt5Account || isConnecting}
                  className="w-full"
                >
                  {isConnecting ? (
                    <>
                      <Activity className="w-4 h-4 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    'Connect MT5'
                  )}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        )}

        {isConnected && syncKey && syncUrl && (
          <div className="space-y-4">
            <Card className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium">Sync configuration</p>
                  <p className="text-sm text-muted-foreground">Use these values inside your TJ MT connector (EA).</p>
                </div>
                {connectedAt ? (
                  <Badge variant="secondary" className="whitespace-nowrap">
                    Connected {new Date(connectedAt).toLocaleDateString()}
                  </Badge>
                ) : null}
              </div>

              <div className="mt-4 space-y-3">
                <div className="space-y-1">
                  <Label>Sync URL</Label>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={syncUrl} />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => void copyToClipboard(syncUrl)}
                      aria-label="Copy sync URL"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>Sync Key</Label>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={syncKey} />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => void copyToClipboard(syncKey)}
                      aria-label="Copy sync key"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Keep this key private. Anyone with it can send trades to your journal.
                  </p>
                </div>
              </div>
            </Card>

            <div className="bg-muted/30 border rounded-lg p-4 text-sm">
              <p className="font-medium mb-2">How it works</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Install the TJ MT connector (EA) in MetaTrader.</li>
                <li>Paste the Sync URL and Sync Key above.</li>
                <li>Keep MetaTrader running to push closed trades automatically.</li>
              </ol>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
