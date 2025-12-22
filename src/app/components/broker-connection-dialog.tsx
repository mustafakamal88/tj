import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import {
  connectMetaApi,
  getMetaApiStatus,
  type BrokerConnection,
  type BrokerEnvironment,
  type BrokerPlatform,
  type ImportJob,
  continueMetaApiImport,
  getMetaApiImportJob,
  startMetaApiImport,
} from '../utils/broker-import-api';
import {
  METAAPI_BACKGROUND_IMPORT_EVENT,
  METAAPI_IMPORT_JOB_UPDATED_EVENT,
  readMetaApiBackgroundImport,
  writeMetaApiBackgroundImport,
  type MetaApiBackgroundImport,
} from '../utils/broker-import-background';

const QUICK_IMPORT_DAYS = 60;

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
  const [job, setJob] = useState<ImportJob | null>(null);
  const [importMode, setImportMode] = useState<'quick' | 'full' | null>(null);
  const [lastQuickImport, setLastQuickImport] = useState<{ connectionId: string; from: string } | null>(null);
  const [backgroundImport, setBackgroundImport] = useState<MetaApiBackgroundImport | null>(() => {
    if (typeof window === 'undefined') return null;
    return readMetaApiBackgroundImport();
  });
  const continueTimerRef = useRef<number | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const backgroundJobIdRef = useRef<string | null>(null);

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

    const bg = readMetaApiBackgroundImport();
    setBackgroundImport(bg);
    if (!bg) return;

    setImportMode('full');
    void (async () => {
      try {
        const res = await getMetaApiImportJob({ jobId: bg.jobId });
        setJob(res.job);
      } catch (e) {
        console.error('[broker] load import job failed', e);
      }
    })();
  }, [open]);

  useEffect(() => {
    // Stop local polling when dialog closes.
    if (open) return;
    if (continueTimerRef.current) window.clearTimeout(continueTimerRef.current);
    continueTimerRef.current = null;
    setJob(null);
    setImporting(false);
    setImportMode(null);
  }, [open]);

  useEffect(() => {
    return () => {
      if (continueTimerRef.current) window.clearTimeout(continueTimerRef.current);
    };
  }, []);

  useEffect(() => {
    jobIdRef.current = job?.id ?? null;
  }, [job]);

  useEffect(() => {
    backgroundJobIdRef.current = backgroundImport?.jobId ?? null;
  }, [backgroundImport]);

  useEffect(() => {
    const sync = () => setBackgroundImport(readMetaApiBackgroundImport());
    sync();
    window.addEventListener(METAAPI_BACKGROUND_IMPORT_EVENT, sync);
    return () => window.removeEventListener(METAAPI_BACKGROUND_IMPORT_EVENT, sync);
  }, []);

  useEffect(() => {
    const handle = (event: Event) => {
      const detail = (event as CustomEvent).detail as { job?: ImportJob } | undefined;
      const nextJob = detail?.job;
      if (!nextJob) return;
      const active = jobIdRef.current ?? backgroundJobIdRef.current;
      if (!active || nextJob.id !== active) return;
      setJob(nextJob);
    };
    window.addEventListener(METAAPI_IMPORT_JOB_UPDATED_EVENT, handle as EventListener);
    return () => window.removeEventListener(METAAPI_IMPORT_JOB_UPDATED_EVENT, handle as EventListener);
  }, []);

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

    const connectionId = selectedId;
    setImporting(true);
    setImportMode('quick');
    try {
      const now = new Date();
      const from = new Date(now);
      from.setDate(from.getDate() - QUICK_IMPORT_DAYS);

      const fromIso = from.toISOString();
      const toIso = now.toISOString();

      const started = await startMetaApiImport({ connectionId, from: fromIso, to: toIso });
      setJob(started.job);
      toast.success('Quick import started.');

      const run = async (jobId: string) => {
        try {
          const res = await continueMetaApiImport({ jobId });
          setJob(res.job);

          if (res.job.status === 'succeeded') {
            toast.success('Import complete.');
            setLastQuickImport({ connectionId, from: fromIso });
            setImporting(false);
            await refresh();
            onImportComplete?.();
            return;
          }

          if (res.job.status === 'failed') {
            toast.error('Import failed. Please try again.');
            setImporting(false);
            await refresh();
            return;
          }

          continueTimerRef.current = window.setTimeout(() => void run(jobId), 250);
        } catch (e) {
          console.error('[broker] import continue failed', e);
          toast.error(e instanceof Error ? e.message : 'Import failed.');
          setImporting(false);
        }
      };

      void run(started.job.id);
    } catch (e) {
      console.error('[broker] import failed', e);
      toast.error(e instanceof Error ? e.message : 'Import failed.');
      setImporting(false);
    } finally {
      // importing flag is managed by the job loop
    }
  };

  const handleFullHistoryImport = async () => {
    if (!selectedId) {
      toast.error('Select a connection first.');
      return;
    }

    const connectionId = selectedId;
    setImporting(true);
    setImportMode('full');
    try {
      const to = lastQuickImport?.connectionId === connectionId ? lastQuickImport.from : undefined;
      const started = await startMetaApiImport({ connectionId, ...(to ? { to } : {}) });
      setJob(started.job);
      writeMetaApiBackgroundImport({
        jobId: started.job.id,
        connectionId,
        mode: 'full',
        startedAt: new Date().toISOString(),
        to,
      });
      toast.success('Full history import started in background.');
    } catch (e) {
      console.error('[broker] import failed', e);
      toast.error(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  const jobLabel = job
    ? importMode === 'quick'
      ? `Quick import (last ${QUICK_IMPORT_DAYS} days)`
      : 'Full history (running in background)'
    : null;

  const disableImports = importing || !selectedId || Boolean(backgroundImport) || job?.status === 'running' || job?.status === 'queued';
  const fullHistoryLabel =
    lastQuickImport?.connectionId === selectedId ? 'Continue full history in background' : 'Import Full History';

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
              Imports closed deals from MetaApi and upserts them into your TJ trades. The import runs in small chunks in
              the background to avoid timeouts. You can safely re-run imports — duplicates won&apos;t be created.
            </p>
            {job ? (
              <div className="rounded-md border p-3 text-sm space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{jobLabel ?? 'Importing trades'}</span>
                  <Badge variant={job.status === 'failed' ? 'destructive' : job.status === 'succeeded' ? 'default' : 'secondary'}>
                    {job.status}
                  </Badge>
                </div>
                <Progress
                  value={job.total ? Math.min(100, Math.round((job.progress / job.total) * 100)) : 0}
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {job.progress}/{job.total} chunks
                  </span>
                  <span>{job.total ? Math.min(100, Math.round((job.progress / job.total) * 100)) : 0}%</span>
                </div>
              </div>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={() => void handleFullHistoryImport()}
                disabled={disableImports}
                className="gap-2"
              >
                {importing && importMode === 'full' ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" />
                ) : null}
                {fullHistoryLabel}
              </Button>
              <Button
                onClick={() => void handleImport()}
                disabled={disableImports}
                className="gap-2"
              >
                {importing && importMode === 'quick' ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" />
                ) : null}
                Quick Import
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
