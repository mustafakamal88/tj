import { useState, useCallback } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { ScrollArea } from './ui/scroll-area';
import {
  ArrowLeft,
  Save,
  TrendingUp,
  TrendingDown,
  Clock,
  DollarSign,
  Image as ImageIcon,
  Upload,
  X,
  Trash2,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { TradeWithDetails } from '../utils/day-journal-api';
import {
  TRADE_SCREENSHOTS_BUCKET,
  upsertTradeNotes,
  uploadTradeScreenshot,
  deleteTradeScreenshot,
} from '../utils/day-journal-api';
import { formatCurrency } from '../utils/trade-calculations';
import { toast } from 'sonner';
import { ScreenshotGallery } from './screenshot-gallery';
import { pnlTextClass, semanticColors } from '../utils/semantic-colors';

type TradeDetailPanelProps = {
  trade: TradeWithDetails;
  onClose: () => void;
  onTradeUpdated: () => void;
};

export function TradeDetailPanel({ trade, onClose, onTradeUpdated }: TradeDetailPanelProps) {
  const [notes, setNotes] = useState(trade.note?.notes || '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      const success = await upsertTradeNotes(trade.id, notes);
      if (success) {
        toast.success('Notes saved');
        onTradeUpdated();
      } else {
        toast.error('Failed to save notes');
      }
    } catch (error) {
      console.error('Failed to save notes', error);
      toast.error('Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingMedia(true);
    try {
      const uploadPromises = Array.from(files).map((file) => uploadTradeScreenshot(trade.id, file));
      const results = await Promise.all(uploadPromises);

      const successCount = results.filter((r) => r.ok).length;
      if (successCount > 0) {
        toast.success(`Uploaded ${successCount} screenshot(s)`);
        onTradeUpdated();
      } else {
        const firstFailure = results.find((r) => !r.ok);
        if (firstFailure && firstFailure.ok === false) {
          const failure = firstFailure;
          if (failure.userMessage) {
            toast.error(failure.userMessage);
          } else 
          if (failure.kind === 'bucket_missing') {
            toast.error(
              `Storage bucket missing (${TRADE_SCREENSHOTS_BUCKET}). See docs/day-journal-feature.md`,
            );
          } else if (failure.kind === 'storage_policy' || failure.kind === 'db_policy') {
            toast.error(
              `Permission denied uploading screenshots. Check Supabase policies (bucket: ${TRADE_SCREENSHOTS_BUCKET}).`,
            );
          } else {
            toast.error(
              `Screenshot upload failed (bucket: ${TRADE_SCREENSHOTS_BUCKET}). See console for details.`,
            );
          }
          console.error('[TradeDetailPanel] upload failed', failure);
        } else {
          toast.error(
            `Screenshot upload failed (bucket: ${TRADE_SCREENSHOTS_BUCKET}). See console for details.`,
          );
        }
      }
    } catch (error) {
      console.error('Failed to upload screenshots', error);
      toast.error(`Failed to upload screenshots (bucket: ${TRADE_SCREENSHOTS_BUCKET})`);
    } finally {
      setUploadingMedia(false);
      e.target.value = '';
    }
  };

  const handleDeleteMedia = async (mediaId: string) => {
    if (!confirm('Delete this screenshot?')) return;

    try {
      const success = await deleteTradeScreenshot(mediaId);
      if (success) {
        toast.success('Screenshot deleted');
        onTradeUpdated();
      } else {
        toast.error(`Failed to delete screenshot (bucket: ${TRADE_SCREENSHOTS_BUCKET})`);
      }
    } catch (error) {
      console.error('Failed to delete screenshot', error);
      toast.error('Failed to delete screenshot');
    }
  };

  const isProfitable = trade.pnl >= 0;
  const duration = trade.openTime && trade.closeTime
    ? (() => {
        const open = parseISO(trade.openTime);
        const close = parseISO(trade.closeTime);
        const diffMs = close.getTime() - open.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 60) return `${diffMins}m`;
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        return `${hours}h ${mins}m`;
      })()
    : '—';

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-muted/30">
        <div className="flex items-start justify-between">
          <Button variant="ghost" size="sm" onClick={onClose} className="gap-2 -ml-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Day
          </Button>
        </div>
        <div className="mt-3">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-2xl font-semibold">{trade.symbol}</h2>
            <Badge
              variant="outline"
              className={trade.type === 'long' ? semanticColors.longChipClasses : semanticColors.shortChipClasses}
            >
              {trade.type.toUpperCase()}
            </Badge>
            <Badge
              variant="outline"
              className={isProfitable ? semanticColors.winChipClasses : semanticColors.lossChipClasses}
            >
              {isProfitable ? 'WIN' : 'LOSS'}
            </Badge>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {trade.openTime ? format(parseISO(trade.openTime), 'MMM d, HH:mm') : trade.date}
            </span>
            <span>Duration: {duration}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* P&L Overview */}
          <Card className="p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-muted-foreground mb-1">P/L</div>
                <div
                  className={`text-2xl font-bold ${pnlTextClass(trade.pnl)}`}
                >
                  {formatCurrency(trade.pnl)}
                </div>
                <div className="text-sm text-muted-foreground">
                  {trade.pnlPercentage >= 0 ? '+' : ''}
                  {trade.pnlPercentage.toFixed(2)}%
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground mb-1">Quantity</div>
                <div className="text-2xl font-bold">{trade.quantity}</div>
                {trade.size && trade.sizeUnit && (
                  <div className="text-sm text-muted-foreground">
                    {trade.size} {trade.sizeUnit}
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Levels */}
          <div>
            <h3 className="font-semibold mb-3">Levels</h3>
            <Card className="p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Entry</span>
                <span className="font-mono font-semibold">{trade.entry}</span>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Exit</span>
                <span className="font-mono font-semibold">{trade.exit}</span>
              </div>
              {trade.stopLoss && (
                <>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Stop Loss</span>
                    <span className="font-mono text-red-600">{trade.stopLoss}</span>
                  </div>
                </>
              )}
              {trade.takeProfit && (
                <>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Take Profit</span>
                    <span className="font-mono text-green-600">{trade.takeProfit}</span>
                  </div>
                </>
              )}
            </Card>
          </div>

          {/* Trade Notes */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Trade Notes</h3>
              <Button size="sm" onClick={handleSaveNotes} disabled={savingNotes} className="gap-2">
                <Save className="w-3 h-3" />
                {savingNotes ? 'Saving...' : 'Save'}
              </Button>
            </div>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why did I take this trade?&#10;What was my thought process?&#10;What could I have done better?"
              className="min-h-[150px] resize-y font-mono text-sm"
            />
          </div>

          {/* Screenshots */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Screenshots</h3>
              <label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={uploadingMedia}
                />
                <Button size="sm" className="gap-2" disabled={uploadingMedia} asChild>
                  <span>
                    <Upload className="w-3 h-3" />
                    {uploadingMedia ? 'Uploading...' : 'Upload'}
                  </span>
                </Button>
              </label>
            </div>
            <ScreenshotGallery media={trade.screenshots} onDelete={handleDeleteMedia} />
          </div>

          {/* Original Trade Notes (from trades table) */}
          {trade.notes && (
            <div>
              <h3 className="font-semibold mb-3">Original Notes</h3>
              <Card className="p-4 bg-muted/30">
                <p className="text-sm whitespace-pre-wrap">{trade.notes}</p>
              </Card>
            </div>
          )}

          {/* Additional Info */}
          <div>
            <h3 className="font-semibold mb-3">Additional Info</h3>
            <Card className="p-4 space-y-2 text-sm">
              {trade.setup && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Setup:</span>
                  <Badge variant="outline">{trade.setup}</Badge>
                </div>
              )}
              {trade.emotions && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Emotions:</span>
                  <span>{trade.emotions}</span>
                </div>
              )}
              {trade.mistakes && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mistakes:</span>
                  <span className="text-red-600">{trade.mistakes}</span>
                </div>
              )}
              {trade.tags && trade.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-2">
                  {trade.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
