import { useEffect, useMemo, useState } from 'react';
import { History, Link2, Upload } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { pushPath } from '../utils/nav';
import { listImportRuns, type ImportRun } from '../utils/import-history-api';
import { semanticColors } from '../utils/semantic-colors';

export function ImportHistoryPage() {
  const [runs, setRuns] = useState<ImportRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedRun, setSelectedRun] = useState<ImportRun | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void (async () => {
      try {
        const data = await listImportRuns({ limit: 20 });
        if (cancelled) return;
        setRuns(data);
      } catch (e) {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : 'Failed to load import history.');
        setRuns([]);
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasImports = runs.length > 0;

  const rows = useMemo(() => runs, [runs]);

  const formatWhen = (iso: string) => {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return '—';
    return dt.toLocaleString();
  };

  const formatDuration = (startedAt: string, endedAt: string | null) => {
    if (!endedAt) return null;
    const start = new Date(startedAt).getTime();
    const end = new Date(endedAt).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
    const sec = Math.round((end - start) / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.round(sec / 60);
    return `${min}m`;
  };

  const statusChipClass = (status: ImportRun['status']) => {
    if (status === 'success') return semanticColors.winChipClasses;
    if (status === 'failed') return semanticColors.lossChipClasses;
    return 'border border-border bg-muted/30 text-muted-foreground';
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-3xl mb-2">Import History</h1>
      <p className="text-muted-foreground">Review your broker/CSV import runs and any errors.</p>

      {/* Empty State */}
      {!hasImports ? (
        <Card className="mt-8 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="shrink-0 rounded-full border border-border p-3 bg-muted/30">
              <History className="size-5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-semibold">No imports yet</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Your broker/CSV import runs will show here with status, time, and errors.
              </div>
              <div className="mt-5 flex flex-col sm:flex-row gap-2">
                <Button type="button" className="gap-2" onClick={() => pushPath('/brokers')}>
                  <Link2 className="size-4" />
                  Connect Broker
                </Button>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex" tabIndex={0}>
                      <Button type="button" variant="outline" className="gap-2" disabled>
                        <Upload className="size-4" />
                        Import CSV
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent sideOffset={6}>Coming soon</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Recent Imports */}
      <div className="mt-10">
        <h2 className="text-lg font-semibold">Recent Imports</h2>
        <p className="mt-1 text-sm text-muted-foreground">Latest broker and CSV import runs.</p>

        {loadError ? (
          <Card className="mt-4 p-5">
            <div className="text-sm text-muted-foreground">{loadError}</div>
          </Card>
        ) : null}

        {loading || !hasImports ? (
          <Card className="mt-4 p-5">
            <div className="space-y-3">
              <div className="divide-y divide-border">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center justify-between gap-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Skeleton className="h-5 w-20 rounded-full" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        ) : (
          <Card className="mt-4 p-5">
            <div className="divide-y divide-border">
              {rows.map((run) => {
                const duration = formatDuration(run.startedAt, run.endedAt);
                const leftLabel = `${run.provider} • ${run.source}`;
                const counts = `Imported ${run.importedCount} • Updated ${run.updatedCount} • Skipped ${run.skippedCount}`;

                return (
                  <div key={run.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-3 py-3">
                    <div className="min-w-0 flex items-center gap-3">
                      <Badge variant="outline" className={statusChipClass(run.status)}>
                        {run.status}
                      </Badge>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{leftLabel}</div>
                        <div className="text-xs text-muted-foreground truncate">{formatWhen(run.startedAt)}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3">
                      <div className="text-right">
                        <div className="text-sm">
                          {duration ? <span className="text-muted-foreground">Duration {duration}</span> : <span className="text-muted-foreground">In progress</span>}
                        </div>
                        <div className="text-xs text-muted-foreground">{counts}</div>
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedRun(run);
                          setDetailsOpen(true);
                        }}
                      >
                        Details
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      <Dialog
        open={detailsOpen}
        onOpenChange={(next) => {
          setDetailsOpen(next);
          if (!next) setSelectedRun(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Details</DialogTitle>
            <DialogDescription>
              {selectedRun ? `${selectedRun.provider} • ${selectedRun.source}` : ''}
            </DialogDescription>
          </DialogHeader>

          {selectedRun ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <Badge variant="outline" className={statusChipClass(selectedRun.status)}>
                  {selectedRun.status}
                </Badge>
                <div className="text-xs text-muted-foreground">Started {formatWhen(selectedRun.startedAt)}</div>
              </div>

              <div className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Imported</span>
                  <span className="font-medium">{selectedRun.importedCount}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-muted-foreground">Updated</span>
                  <span className="font-medium">{selectedRun.updatedCount}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-muted-foreground">Skipped</span>
                  <span className="font-medium">{selectedRun.skippedCount}</span>
                </div>
              </div>

              {selectedRun.errorMessage ? (
                <div className="rounded-md border p-3">
                  <div className="text-sm font-medium">Error</div>
                  <div className="mt-1 text-sm text-muted-foreground">{selectedRun.errorMessage}</div>
                </div>
              ) : null}

              {selectedRun.errorDetails ? (
                <div className="rounded-md border p-3">
                  <div className="text-sm font-medium">Details</div>
                  <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted/30 p-2 text-xs">
                    {JSON.stringify(selectedRun.errorDetails, null, 2)}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
