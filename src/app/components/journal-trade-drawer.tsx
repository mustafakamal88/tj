import { useEffect, useRef, useState } from 'react';
import { X, Save, Upload } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { Skeleton } from './ui/skeleton';
import { ScreenshotGallery } from './screenshot-gallery';
import { TradingViewChart } from './trading-view-chart';
import {
  getTradeDetail,
  type TradeNoteMeta,
  type TradeWithDetails,
  deleteTradeScreenshot,
  uploadTradeScreenshot,
  upsertTradeNotes,
} from '../utils/day-journal-api';
import { buildTradeNoteExtras, parseTradeNoteExtras } from '../utils/trade-note-extras';
import { formatCurrency } from '../utils/trade-calculations';
import { toast } from 'sonner';

type JournalTradeDrawerProps = {
  open: boolean;
  tradeId: string | null;
  onOpenChange: (open: boolean) => void;
};

const TRADE_EMOTIONS = ['Calm', 'Fear', 'FOMO', 'Revenge', 'Overconfident', 'Hesitation'] as const;
const TRADE_MISTAKES = ['Entered early', 'No SL', 'Oversized', 'Moved SL', 'Overtraded', "Didn’t follow plan"] as const;

export function JournalTradeDrawer({ open, tradeId, onOpenChange }: JournalTradeDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [trade, setTrade] = useState<TradeWithDetails | null>(null);

  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState('');
  const [notesDirty, setNotesDirty] = useState(false);
  const [meta, setMeta] = useState<TradeNoteMeta>({});
  const [emotionsText, setEmotionsText] = useState('');
  const [mistakesText, setMistakesText] = useState('');

  const [uploadingShot, setUploadingShot] = useState(false);
  const [shotError, setShotError] = useState<string | null>(null);

  const autosaveRef = useRef<number | null>(null);

  const pnl = trade?.pnl ?? null;
  const symbol = trade?.symbol ?? '';

  const loadTrade = async (id: string) => {
    setLoading(true);
    setShotError(null);
    try {
      const detail = await getTradeDetail(id);
      setTrade(detail);
      setNotes(detail?.note?.notes || '');
      setNotesDirty(false);

      const nextMeta = ((detail?.note?.meta as TradeNoteMeta) || {}) as TradeNoteMeta;
      setMeta(nextMeta);
      const parsed = parseTradeNoteExtras(nextMeta.extraNotes);
      setEmotionsText(parsed.emotionsText);
      setMistakesText(parsed.mistakesText);
    } catch (error) {
      console.error('Failed to load trade detail', error);
      toast.error('Failed to load trade details');
      setTrade(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !tradeId) return;
    void loadTrade(tradeId);
  }, [open, tradeId]);

  useEffect(() => {
    if (!open) {
      setTrade(null);
      setNotes('');
      setNotesDirty(false);
      setMeta({});
      setEmotionsText('');
      setMistakesText('');
      setUploadingShot(false);
      setShotError(null);
      if (autosaveRef.current) {
        window.clearTimeout(autosaveRef.current);
        autosaveRef.current = null;
      }
    }
  }, [open]);

  const handleSave = async (opts?: { source?: 'manual' | 'autosave' }) => {
    if (!trade) return;
    setSaving(true);
    try {
      const nextMeta: TradeNoteMeta = {
        emotions: meta.emotions || [],
        mistakes: meta.mistakes || [],
        extraNotes: buildTradeNoteExtras({ emotionsText, mistakesText }),
      };

      const success = await upsertTradeNotes(trade.id, notes, nextMeta);
      if (success) {
        if (opts?.source !== 'autosave') toast.success('Trade notes saved');
        setNotesDirty(false);
        await loadTrade(trade.id);
      } else {
        if (opts?.source !== 'autosave') toast.error('Failed to save trade notes');
      }
    } catch (error) {
      console.error('Failed to save trade notes', error);
      if (opts?.source !== 'autosave') toast.error('Failed to save trade notes');
    } finally {
      setSaving(false);
    }
  };

  // Autosave only after user edits.
  useEffect(() => {
    if (!trade) return;
    if (!open) return;
    if (!notesDirty) return;

    if (autosaveRef.current) window.clearTimeout(autosaveRef.current);

    autosaveRef.current = window.setTimeout(() => {
      void handleSave({ source: 'autosave' });
    }, 800);

    return () => {
      if (autosaveRef.current) {
        window.clearTimeout(autosaveRef.current);
        autosaveRef.current = null;
      }
    };
  }, [trade, open, notesDirty, notes, meta, emotionsText, mistakesText]);

  const toggleEmotion = (value: (typeof TRADE_EMOTIONS)[number]) => {
    const current = meta.emotions || [];
    const next = current.includes(value) ? current.filter((e) => e !== value) : [...current, value];
    setMeta({ ...meta, emotions: next });
    setNotesDirty(true);
  };

  const toggleMistake = (value: (typeof TRADE_MISTAKES)[number]) => {
    const current = meta.mistakes || [];
    const next = current.includes(value) ? current.filter((m) => m !== value) : [...current, value];
    setMeta({ ...meta, mistakes: next });
    setNotesDirty(true);
  };

  const handleUploadScreenshot = async (file: File) => {
    if (!trade) return;
    setUploadingShot(true);
    setShotError(null);
    try {
      const result = await uploadTradeScreenshot(trade.id, file);
      if (!result.ok) {
        setShotError(result.userMessage || 'Failed to upload screenshot');
        toast.error('Failed to upload screenshot');
        return;
      }
      await loadTrade(trade.id);
    } catch (error) {
      console.error('Failed to upload screenshot', error);
      const msg = error instanceof Error ? error.message : 'Failed to upload screenshot';
      setShotError(msg);
      toast.error('Failed to upload screenshot');
    } finally {
      setUploadingShot(false);
    }
  };

  const handleDeleteScreenshot = async (screenshotId: string) => {
    if (!trade) return;
    setShotError(null);
    try {
      const ok = await deleteTradeScreenshot(screenshotId);
      if (!ok) {
        toast.error('Failed to delete screenshot');
        return;
      }
      await loadTrade(trade.id);
    } catch (error) {
      console.error('Failed to delete screenshot', error);
      toast.error('Failed to delete screenshot');
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    // Close is only allowed via our explicit close button.
    if (!nextOpen) return;
    onOpenChange(true);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[720px] p-0"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="flex h-full flex-col">
          <SheetHeader className="shrink-0 border-b p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <SheetTitle className="truncate">
                  {trade?.symbol ? `${trade.symbol} trade` : 'Trade'}
                </SheetTitle>
                {trade?.openTime ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {new Date(trade.openTime).toLocaleString()}
                  </div>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : !trade ? (
              <div className="text-sm text-muted-foreground">No trade selected.</div>
            ) : (
              <div className="space-y-4">
                <Card className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {trade.type ? <Badge variant="secondary">{trade.type.toUpperCase()}</Badge> : null}
                      {typeof pnl === 'number' ? (
                        <Badge variant={pnl >= 0 ? 'default' : 'destructive'}>{formatCurrency(pnl)}</Badge>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      onClick={() => void handleSave({ source: 'manual' })}
                      disabled={saving || !notesDirty}
                      size="sm"
                    >
                      <Save className="mr-2 h-4 w-4" />
                      Save
                    </Button>
                  </div>
                </Card>

                {symbol ? (
                  <Card className="p-4">
                    <TradingViewChart symbol={symbol} heightClassName="h-[280px] sm:h-[320px]" />
                  </Card>
                ) : null}

                <Card className="p-4 space-y-3">
                  <div className="text-sm font-medium">Notes</div>
                  <Textarea
                    value={notes}
                    onChange={(e) => {
                      setNotes(e.target.value);
                      setNotesDirty(true);
                    }}
                    placeholder="Trade notes…"
                    className="min-h-[140px]"
                  />
                </Card>

                <Card className="p-4 space-y-3">
                  <div className="text-sm font-medium">Emotions</div>
                  <div className="flex flex-wrap gap-2">
                    {TRADE_EMOTIONS.map((e) => (
                      <Button
                        key={e}
                        type="button"
                        variant={(meta.emotions || []).includes(e) ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => toggleEmotion(e)}
                      >
                        {e}
                      </Button>
                    ))}
                  </div>
                  <Textarea
                    value={emotionsText}
                    onChange={(e) => {
                      setEmotionsText(e.target.value);
                      setNotesDirty(true);
                    }}
                    placeholder="What were you feeling?"
                    className="min-h-[100px]"
                  />
                </Card>

                <Card className="p-4 space-y-3">
                  <div className="text-sm font-medium">Mistakes</div>
                  <div className="flex flex-wrap gap-2">
                    {TRADE_MISTAKES.map((m) => (
                      <Button
                        key={m}
                        type="button"
                        variant={(meta.mistakes || []).includes(m) ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => toggleMistake(m)}
                      >
                        {m}
                      </Button>
                    ))}
                  </div>
                  <Textarea
                    value={mistakesText}
                    onChange={(e) => {
                      setMistakesText(e.target.value);
                      setNotesDirty(true);
                    }}
                    placeholder="What went wrong / what to fix?"
                    className="min-h-[100px]"
                  />
                </Card>

                <Card className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">Screenshots</div>
                    <label className="inline-flex">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploadingShot}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void handleUploadScreenshot(file);
                          e.currentTarget.value = '';
                        }}
                      />
                      <Button type="button" variant="outline" size="sm" disabled={uploadingShot}>
                        <Upload className="mr-2 h-4 w-4" />
                        Upload
                      </Button>
                    </label>
                  </div>

                  {shotError ? <div className="text-sm text-destructive">{shotError}</div> : null}

                  <ScreenshotGallery
                    media={trade.screenshots || []}
                    onDelete={(mediaId) => void handleDeleteScreenshot(mediaId)}
                  />
                </Card>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
