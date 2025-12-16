import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Switch } from './ui/switch';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { toast } from 'sonner';
import { Activity, CheckCircle2, XCircle } from 'lucide-react';

interface MTConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MTConnectionDialog({ open, onOpenChange }: MTConnectionDialogProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [autoSync, setAutoSync] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // MT4 Connection
  const [mt4Server, setMt4Server] = useState('');
  const [mt4Account, setMt4Account] = useState('');
  const [mt4Password, setMt4Password] = useState('');

  // MT5 Connection
  const [mt5Server, setMt5Server] = useState('');
  const [mt5Account, setMt5Account] = useState('');
  const [mt5Password, setMt5Password] = useState('');

  const handleConnect = async (platform: 'MT4' | 'MT5') => {
    setIsConnecting(true);

    try {
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
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    localStorage.removeItem('mt-connection');
    localStorage.removeItem('mt-auto-sync');
    setIsConnected(false);
    toast.success('Disconnected from MetaTrader');
  };

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
                      Auto-sync: {autoSync ? 'Enabled' : 'Disabled'}
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
              <Button variant="outline" onClick={handleDisconnect}>
                Disconnect
              </Button>
            )}
          </div>
        </Card>

        {!isConnected && (
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
        )}
      </DialogContent>
    </Dialog>
  );
}
