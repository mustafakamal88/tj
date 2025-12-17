<<<<<<< HEAD
import { useState } from 'react';
=======
import { useEffect, useMemo, useState } from 'react';
>>>>>>> f8d36ea (Initial commit)
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Switch } from './ui/switch';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
<<<<<<< HEAD
import { toast } from 'sonner';
import { Activity, CheckCircle2, XCircle } from 'lucide-react';
=======
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';
import { Activity, CheckCircle2, Copy, XCircle } from 'lucide-react';
import { getUserSubscription } from '../utils/data-limit';
import { getSupabaseClient } from '../utils/supabase';
import { isMtBridgeConfigured, mtBridgeConnect, mtBridgeDisconnect, mtBridgeSync } from '../utils/mt-bridge';
>>>>>>> f8d36ea (Initial commit)

interface MTConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

<<<<<<< HEAD
export function MTConnectionDialog({ open, onOpenChange }: MTConnectionDialogProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [autoSync, setAutoSync] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
=======
type SavedMtConnection = {
  method?: 'connector' | 'metaapi';
  platform: 'MT4' | 'MT5';
  server: string;
  account: string;
  accountType?: 'live' | 'demo';
  autoSync: boolean;
  connectedAt: string;
  syncKey?: string;
  syncUrl?: string;
  lastSyncAt?: string;
};

const MT_CONNECTION_STORAGE_KEY = 'mt-connection';

export function MTConnectionDialog({ open, onOpenChange }: MTConnectionDialogProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionMethod, setConnectionMethod] = useState<'metaapi' | 'connector'>(() =>
    isMtBridgeConfigured() ? 'metaapi' : 'connector',
  );
  const [autoSync, setAutoSync] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncingNow, setIsSyncingNow] = useState(false);
  const [syncKey, setSyncKey] = useState<string | null>(null);
  const [syncUrl, setSyncUrl] = useState<string | null>(null);
  const [connectedPlatform, setConnectedPlatform] = useState<'MT4' | 'MT5' | null>(null);
  const [connectedAt, setConnectedAt] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
>>>>>>> f8d36ea (Initial commit)

  // MT4 Connection
  const [mt4Server, setMt4Server] = useState('');
  const [mt4Account, setMt4Account] = useState('');
<<<<<<< HEAD
  const [mt4Password, setMt4Password] = useState('');
=======
  const [mt4InvestorPassword, setMt4InvestorPassword] = useState('');
  const [mt4AccountType, setMt4AccountType] = useState<'live' | 'demo'>('live');
>>>>>>> f8d36ea (Initial commit)

  // MT5 Connection
  const [mt5Server, setMt5Server] = useState('');
  const [mt5Account, setMt5Account] = useState('');
<<<<<<< HEAD
  const [mt5Password, setMt5Password] = useState('');
=======
  const [mt5InvestorPassword, setMt5InvestorPassword] = useState('');
  const [mt5AccountType, setMt5AccountType] = useState<'live' | 'demo'>('live');
  
  const subscription = useMemo(() => getUserSubscription(), []);
  const isAutoSyncLocked = subscription === 'free';

  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem(MT_CONNECTION_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<SavedMtConnection>;
      if (!parsed.platform || !parsed.server || !parsed.account) return;

      let method: 'metaapi' | 'connector' | null = null;
      if (parsed.method === 'metaapi') method = 'metaapi';
      if (!method && parsed.syncKey && parsed.syncUrl) method = 'connector';
      if (!method && parsed.method === 'connector') method = 'connector';
      if (!method) return;
      if (method === 'connector' && (!parsed.syncKey || !parsed.syncUrl)) return;

      setIsConnected(true);
      setConnectionMethod(method);
      setAutoSync(Boolean(parsed.autoSync));
      setConnectedPlatform(parsed.platform);
      setConnectedAt(parsed.connectedAt ?? null);
      setLastSyncAt(parsed.lastSyncAt ?? null);

      if (parsed.platform === 'MT4') {
        setMt4Server(parsed.server);
        setMt4Account(parsed.account);
        if (parsed.accountType === 'demo' || parsed.accountType === 'live') setMt4AccountType(parsed.accountType);
      } else if (parsed.platform === 'MT5') {
        setMt5Server(parsed.server);
        setMt5Account(parsed.account);
        if (parsed.accountType === 'demo' || parsed.accountType === 'live') setMt5AccountType(parsed.accountType);
      }

      setSyncKey(parsed.syncKey ?? null);
      setSyncUrl(parsed.syncUrl ?? null);
    } catch {
      // ignore
    }
  }, [open]);

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  };
>>>>>>> f8d36ea (Initial commit)

  const handleConnect = async (platform: 'MT4' | 'MT5') => {
    setIsConnecting(true);

    try {
<<<<<<< HEAD
      // Simulate API connection
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Save connection details to localStorage
      const connectionData = {
        platform,
        server: platform === 'MT4' ? mt4Server : mt5Server,
        account: platform === 'MT4' ? mt4Account : mt5Account,
        connectedAt: new Date().toISOString(),
      };
      
      localStorage.setItem('mt-connection', JSON.stringify(connectionData));
      localStorage.setItem('mt-auto-sync', autoSync.toString());
      
      setIsConnected(true);
      toast.success(`Connected to ${platform} successfully!`);
      
      if (autoSync) {
        toast.info('Auto-sync enabled. Trades will sync every 5 minutes.');
      }
    } catch (error) {
      toast.error('Connection failed. Please check your credentials.');
=======
      const server = platform === 'MT4' ? mt4Server : mt5Server;
      const account = platform === 'MT4' ? mt4Account : mt5Account;
      const desiredAutoSync = isAutoSyncLocked ? false : autoSync;

      const supabase = getSupabaseClient();
      if (!supabase) {
        toast.error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
        return;
      }

      if (connectionMethod === 'metaapi') {
        if (!isMtBridgeConfigured()) {
          toast.error('MT bridge is not configured. Set VITE_MT_BRIDGE_URL.');
          return;
        }

        const investorPassword = platform === 'MT4' ? mt4InvestorPassword : mt5InvestorPassword;
        if (!investorPassword) {
          toast.error('Investor password is required.');
          return;
        }

        const accountType = platform === 'MT4' ? mt4AccountType : mt5AccountType;
        const result = await mtBridgeConnect({
          platform,
          server,
          account,
          investorPassword,
          accountType,
          autoSync: desiredAutoSync,
        });

        const connectionData: SavedMtConnection = {
          method: 'metaapi',
          platform,
          server,
          account,
          accountType,
          autoSync: desiredAutoSync,
          connectedAt: result.connectedAt,
          lastSyncAt: result.lastSyncAt,
        };

        localStorage.setItem(MT_CONNECTION_STORAGE_KEY, JSON.stringify(connectionData));
        localStorage.setItem('mt-auto-sync', String(connectionData.autoSync));

        setIsConnected(true);
        setSyncKey(null);
        setSyncUrl(null);
        setConnectedPlatform(platform);
        setConnectedAt(result.connectedAt);
        setLastSyncAt(result.lastSyncAt ?? null);

        if (platform === 'MT4') setMt4InvestorPassword('');
        if (platform === 'MT5') setMt5InvestorPassword('');

        window.dispatchEvent(new Event('mt-connection-changed'));
        toast.success(`Connected to ${platform}`);

        toast.info(
          result.upserted > 0 ? `Imported ${result.upserted} trades.` : 'No new closed trades found yet.',
        );

        if (isAutoSyncLocked) {
          toast.info('Auto-sync is available on Pro/Premium. You can still sync manually.');
        } else if (desiredAutoSync) {
          toast.info('Auto-sync enabled (while the app is open).');
        }

        return;
      }

      const { data, error } = await supabase.functions.invoke('server', {
        body: { action: 'mt_connect', platform, server, account, autoSync: desiredAutoSync },
      });

      if (error || !data?.ok) {
        toast.error(data?.error ?? error?.message ?? 'Failed to connect. Please try again.');
        return;
      }

      const payload = data.data as { syncKey: string; syncUrl: string; connectedAt: string };
      if (!payload?.syncKey || !payload?.syncUrl) {
        toast.error('Failed to connect. Missing sync configuration.');
        return;
      }

      const connectionData: SavedMtConnection = {
        method: 'connector',
        platform,
        server,
        account,
        autoSync: desiredAutoSync,
        syncKey: payload.syncKey,
        syncUrl: payload.syncUrl,
        connectedAt: payload.connectedAt,
      };

      localStorage.setItem(MT_CONNECTION_STORAGE_KEY, JSON.stringify(connectionData));
      localStorage.setItem('mt-auto-sync', String(connectionData.autoSync));

      setIsConnected(true);
      setSyncKey(payload.syncKey);
      setSyncUrl(payload.syncUrl);
      setConnectedPlatform(platform);
      setConnectedAt(payload.connectedAt);

      window.dispatchEvent(new Event('mt-connection-changed'));
      toast.success(`Connected to ${platform}`);

      if (isAutoSyncLocked) {
        toast.info('Auto-sync is available on Pro/Premium. You can still import reports manually.');
      } else if (desiredAutoSync) {
        toast.info('Auto-sync enabled. Keep MetaTrader running to push trades.');
      }
    } catch (error) {
      console.error('MT connect error', error);
      toast.error(error instanceof Error ? error.message : 'Connection failed. Please try again.');
>>>>>>> f8d36ea (Initial commit)
    } finally {
      setIsConnecting(false);
    }
  };

<<<<<<< HEAD
  const handleDisconnect = () => {
    localStorage.removeItem('mt-connection');
    localStorage.removeItem('mt-auto-sync');
    setIsConnected(false);
    toast.success('Disconnected from MetaTrader');
  };

=======
  const handleDisconnect = async () => {
    try {
      if (connectionMethod === 'bridge') {
        if (isMtBridgeConfigured()) {
          await mtBridgeDisconnect();
        }
      } else {
        const supabase = getSupabaseClient();
        if (supabase) {
          await supabase.functions.invoke('server', { body: { action: 'mt_disconnect' } });
        }
      }
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
    setConnectionMethod(isMtBridgeConfigured() ? 'metaapi' : 'connector');
    window.dispatchEvent(new Event('mt-connection-changed'));
    toast.success('Disconnected from MetaTrader');
  };

  const handleSyncNow = async () => {
    if (connectionMethod !== 'metaapi') return;
    setIsSyncingNow(true);

    try {
      const result = await mtBridgeSync();
      setLastSyncAt(result.lastSyncAt ?? new Date().toISOString());
      try {
        const raw = localStorage.getItem(MT_CONNECTION_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as SavedMtConnection;
          localStorage.setItem(
            MT_CONNECTION_STORAGE_KEY,
            JSON.stringify({ ...parsed, method: 'metaapi', lastSyncAt: result.lastSyncAt }),
          );
        }
      } catch {
        // ignore
      }

      window.dispatchEvent(new Event('mt-connection-changed'));
      toast.success(result.upserted > 0 ? `Synced ${result.upserted} trades.` : 'No new closed trades found.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Sync failed. Please try again.');
    } finally {
      setIsSyncingNow(false);
    }
  };

>>>>>>> f8d36ea (Initial commit)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Connect MT4/MT5 Account</DialogTitle>
          <DialogDescription>
            Connect your MetaTrader account for automatic trade synchronization
          </DialogDescription>
        </DialogHeader>

        {/* Connection Status */}
        <Card className="p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isConnected ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <div>
                    <p className="font-medium">Connected</p>
                    <p className="text-sm text-muted-foreground">
<<<<<<< HEAD
                      Auto-sync: {autoSync ? 'Enabled' : 'Disabled'}
=======
                      {connectedPlatform ? `${connectedPlatform} · ` : ''}
                      {connectionMethod === 'metaapi' ? 'Direct (MetaApi)' : 'Connector (EA)'} · Auto-sync:{' '}
                      {autoSync ? 'Enabled' : 'Disabled'}
>>>>>>> f8d36ea (Initial commit)
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
<<<<<<< HEAD
              <Button variant="outline" onClick={handleDisconnect}>
=======
              <Button variant="outline" onClick={() => void handleDisconnect()}>
>>>>>>> f8d36ea (Initial commit)
                Disconnect
              </Button>
            )}
          </div>
        </Card>

        {!isConnected && (
<<<<<<< HEAD
          <>
            <Tabs defaultValue="mt4" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="mt4">MetaTrader 4</TabsTrigger>
                <TabsTrigger value="mt5">MetaTrader 5</TabsTrigger>
              </TabsList>

              {/* MT4 Tab */}
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
                    <Label htmlFor="mt4-password">Password</Label>
                    <Input
                      id="mt4-password"
                      type="password"
                      placeholder="Your MT4 password"
                      value={mt4Password}
                      onChange={(e) => setMt4Password(e.target.value)}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-0.5">
                      <Label htmlFor="auto-sync-mt4">Auto-Sync</Label>
                      <p className="text-sm text-muted-foreground">
                        Automatically sync trades every 5 minutes
                      </p>
                    </div>
                    <Switch
                      id="auto-sync-mt4"
                      checked={autoSync}
                      onCheckedChange={setAutoSync}
                    />
                  </div>

                  <Button
                    onClick={() => handleConnect('MT4')}
                    disabled={!mt4Server || !mt4Account || !mt4Password || isConnecting}
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

              {/* MT5 Tab */}
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
                    <Label htmlFor="mt5-password">Password</Label>
                    <Input
                      id="mt5-password"
                      type="password"
                      placeholder="Your MT5 password"
                      value={mt5Password}
                      onChange={(e) => setMt5Password(e.target.value)}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-0.5">
                      <Label htmlFor="auto-sync-mt5">Auto-Sync</Label>
                      <p className="text-sm text-muted-foreground">
                        Automatically sync trades every 5 minutes
                      </p>
                    </div>
                    <Switch
                      id="auto-sync-mt5"
                      checked={autoSync}
                      onCheckedChange={setAutoSync}
                    />
                  </div>

                  <Button
                    onClick={() => handleConnect('MT5')}
                    disabled={!mt5Server || !mt5Account || !mt5Password || isConnecting}
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

            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-4 text-sm">
              <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                Note: For live syncing to work
              </p>
              <ul className="list-disc list-inside space-y-1 text-blue-800 dark:text-blue-200">
                <li>Your MetaTrader terminal must be running</li>
                <li>You need an active internet connection</li>
                <li>Make sure your broker supports API access</li>
                <li>Requires Pro or Premium subscription</li>
              </ul>
            </div>
          </>
=======
          <Tabs
            value={connectionMethod}
            onValueChange={(value) => setConnectionMethod(value as 'metaapi' | 'connector')}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="metaapi">Direct (MetaApi)</TabsTrigger>
              <TabsTrigger value="connector">Connector (EA)</TabsTrigger>
            </TabsList>

            <TabsContent value="metaapi" className="space-y-4">
              {!isMtBridgeConfigured() && (
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg p-4 text-sm">
                  <p className="font-medium text-amber-900 dark:text-amber-100 mb-1">
                    MetaApi bridge is not configured
                  </p>
                  <p className="text-amber-800 dark:text-amber-200">
                    Set <code className="font-mono">VITE_MT_BRIDGE_URL</code> to your hosted VPS bridge URL, then reload
                    the app.
                  </p>
                </div>
              )}

              <Tabs defaultValue="mt4" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="mt4">MetaTrader 4</TabsTrigger>
                  <TabsTrigger value="mt5">MetaTrader 5</TabsTrigger>
                </TabsList>

                <TabsContent value="mt4" className="space-y-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="mt4-server-bridge">Server</Label>
                      <Input
                        id="mt4-server-bridge"
                        placeholder="e.g., BrokerName-Live"
                        value={mt4Server}
                        onChange={(e) => setMt4Server(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="mt4-account-bridge">Account Number</Label>
                      <Input
                        id="mt4-account-bridge"
                        placeholder="Your MT4 account number"
                        value={mt4Account}
                        onChange={(e) => setMt4Account(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Account Type</Label>
                      <Select value={mt4AccountType} onValueChange={(v) => setMt4AccountType(v as 'live' | 'demo')}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select account type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="live">Live</SelectItem>
                          <SelectItem value="demo">Demo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="mt4-investor-password">Investor Password (read-only)</Label>
                      <Input
                        id="mt4-investor-password"
                        type="password"
                        placeholder="Investor password"
                        value={mt4InvestorPassword}
                        onChange={(e) => setMt4InvestorPassword(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Used only to connect to your broker via the MetaApi bridge and not stored in the browser.
                      </p>
                    </div>

                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-0.5">
                        <Label htmlFor="auto-sync-direct-mt4">Auto-Sync</Label>
                        <p className="text-sm text-muted-foreground">
                          Automatically sync trades every 5 minutes (while the app is open)
                        </p>
                      </div>
                      <Switch
                        id="auto-sync-direct-mt4"
                        checked={autoSync}
                        onCheckedChange={(value) => {
                          if (isAutoSyncLocked && value) {
                            toast.error('Auto-sync requires Pro or Premium.');
                            window.dispatchEvent(new Event('open-subscription-dialog'));
                            return;
                          }
                          setAutoSync(value);
                        }}
                        disabled={isAutoSyncLocked}
                      />
                    </div>

                    <Button
                      onClick={() => handleConnect('MT4')}
                      disabled={
                        !isMtBridgeConfigured() || !mt4Server || !mt4Account || !mt4InvestorPassword || isConnecting
                      }
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
                      <Label htmlFor="mt5-server-bridge">Server</Label>
                      <Input
                        id="mt5-server-bridge"
                        placeholder="e.g., BrokerName-Live"
                        value={mt5Server}
                        onChange={(e) => setMt5Server(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="mt5-account-bridge">Account Number</Label>
                      <Input
                        id="mt5-account-bridge"
                        placeholder="Your MT5 account number"
                        value={mt5Account}
                        onChange={(e) => setMt5Account(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Account Type</Label>
                      <Select value={mt5AccountType} onValueChange={(v) => setMt5AccountType(v as 'live' | 'demo')}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select account type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="live">Live</SelectItem>
                          <SelectItem value="demo">Demo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="mt5-investor-password">Investor Password (read-only)</Label>
                      <Input
                        id="mt5-investor-password"
                        type="password"
                        placeholder="Investor password"
                        value={mt5InvestorPassword}
                        onChange={(e) => setMt5InvestorPassword(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Used only to connect to your broker via the MetaApi bridge and not stored in the browser.
                      </p>
                    </div>

                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-0.5">
                        <Label htmlFor="auto-sync-direct-mt5">Auto-Sync</Label>
                        <p className="text-sm text-muted-foreground">
                          Automatically sync trades every 5 minutes (while the app is open)
                        </p>
                      </div>
                      <Switch
                        id="auto-sync-direct-mt5"
                        checked={autoSync}
                        onCheckedChange={(value) => {
                          if (isAutoSyncLocked && value) {
                            toast.error('Auto-sync requires Pro or Premium.');
                            window.dispatchEvent(new Event('open-subscription-dialog'));
                            return;
                          }
                          setAutoSync(value);
                        }}
                        disabled={isAutoSyncLocked}
                      />
                    </div>

                    <Button
                      onClick={() => handleConnect('MT5')}
                      disabled={
                        !isMtBridgeConfigured() || !mt5Server || !mt5Account || !mt5InvestorPassword || isConnecting
                      }
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

              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-4 text-sm">
                <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">Note: Direct broker sync</p>
                <ul className="list-disc list-inside space-y-1 text-blue-800 dark:text-blue-200">
                  <li>No EA installation required (uses MetaApi cloud)</li>
                  <li>First sync can take 1–2 minutes depending on history</li>
                  <li>Only closed trades are imported</li>
                  <li>Auto-sync requires Pro or Premium subscription</li>
                </ul>
              </div>
            </TabsContent>

            <TabsContent value="connector" className="space-y-4">
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

                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-0.5">
                        <Label htmlFor="auto-sync-mt4">Auto-Sync</Label>
                        <p className="text-sm text-muted-foreground">Automatically sync trades every 5 minutes</p>
                      </div>
                      <Switch
                        id="auto-sync-mt4"
                        checked={autoSync}
                        onCheckedChange={(value) => {
                          if (isAutoSyncLocked && value) {
                            toast.error('Auto-sync requires Pro or Premium.');
                            window.dispatchEvent(new Event('open-subscription-dialog'));
                            return;
                          }
                          setAutoSync(value);
                        }}
                        disabled={isAutoSyncLocked}
                      />
                    </div>

                    <Button
                      onClick={() => handleConnect('MT4')}
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

                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-0.5">
                        <Label htmlFor="auto-sync-mt5">Auto-Sync</Label>
                        <p className="text-sm text-muted-foreground">Automatically sync trades every 5 minutes</p>
                      </div>
                      <Switch
                        id="auto-sync-mt5"
                        checked={autoSync}
                        onCheckedChange={(value) => {
                          if (isAutoSyncLocked && value) {
                            toast.error('Auto-sync requires Pro or Premium.');
                            window.dispatchEvent(new Event('open-subscription-dialog'));
                            return;
                          }
                          setAutoSync(value);
                        }}
                        disabled={isAutoSyncLocked}
                      />
                    </div>

                    <Button
                      onClick={() => handleConnect('MT5')}
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

              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-4 text-sm">
                <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">Note: For live syncing to work</p>
                <ul className="list-disc list-inside space-y-1 text-blue-800 dark:text-blue-200">
                  <li>Your MetaTrader terminal must be running</li>
                  <li>You need an active internet connection</li>
                  <li>Install the TJ MT connector (EA) and set the Sync URL + Key</li>
                  <li>Auto-sync requires Pro or Premium subscription</li>
                </ul>
              </div>
            </TabsContent>
          </Tabs>
        )}

        {isConnected && connectionMethod === 'metaapi' && (
          <div className="space-y-4">
            <Card className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium">Direct broker sync (MetaApi)</p>
                  <p className="text-sm text-muted-foreground">
                    {connectedPlatform ? `${connectedPlatform} · ` : ''}{' '}
                    {connectedPlatform === 'MT4' ? mt4Server : mt5Server} ·{' '}
                    {connectedPlatform === 'MT4' ? mt4Account : mt5Account}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {lastSyncAt ? `Last sync: ${new Date(lastSyncAt).toLocaleString()}` : 'Last sync: —'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {connectedAt ? (
                    <Badge variant="secondary" className="whitespace-nowrap">
                      Connected {new Date(connectedAt).toLocaleDateString()}
                    </Badge>
                  ) : null}

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleSyncNow()}
                    disabled={!isMtBridgeConfigured() || isSyncingNow}
                  >
                    {isSyncingNow ? (
                      <>
                        <Activity className="w-4 h-4 mr-2 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      'Sync now'
                    )}
                  </Button>
                </div>
              </div>
            </Card>

            <div className="bg-muted/30 border rounded-lg p-4 text-sm">
              <p className="font-medium mb-2">How it works</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Connect using broker server + account + investor password.</li>
                <li>Closed trades are imported into your journal.</li>
                <li>Use “Sync now” anytime to pull the latest history.</li>
              </ol>
            </div>
          </div>
        )}

        {isConnected && connectionMethod === 'connector' && syncKey && syncUrl && (
          <div className="space-y-4">
            <Card className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium">Sync configuration</p>
                  <p className="text-sm text-muted-foreground">
                    Use these values inside the TJ MT connector in MT4/MT5.
                  </p>
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
                      onClick={() => copyToClipboard(syncUrl)}
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
                      onClick={() => copyToClipboard(syncKey)}
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
>>>>>>> f8d36ea (Initial commit)
        )}
      </DialogContent>
    </Dialog>
  );
}
