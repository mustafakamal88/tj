import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';
import { createTrade } from '../utils/trades-api';
import { getMyProfile } from '../utils/profile';
import { requireSupabaseClient } from '../utils/supabase';
import { calculatePnL, determineOutcome } from '../utils/trade-calculations';
import type { TradeMarket, TradeSizeUnit, TradeType } from '../types/trade';

interface AddTradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTradeAdded: () => void;
}

const SCREENSHOTS_BUCKET = 'trade-screenshots';
const MAX_SCREENSHOTS_PER_TRADE = 3;
const FREE_SCREENSHOT_STORAGE_BYTES = 2 * 1024 * 1024 * 1024; // 2GB
const PRO_SCREENSHOT_STORAGE_BYTES = 20 * 1024 * 1024 * 1024; // 20GB

function getStorageLimitLabel(plan: string): string {
  if (plan === 'pro') return '20GB';
  if (plan === 'premium') return 'Unlimited';
  return '2GB';
}

function getStorageLimitBytes(plan: string): number {
  if (plan === 'premium') return Number.POSITIVE_INFINITY;
  if (plan === 'pro') return PRO_SCREENSHOT_STORAGE_BYTES;
  return FREE_SCREENSHOT_STORAGE_BYTES;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function AddTradeDialog({ open, onOpenChange, onTradeAdded }: AddTradeDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    symbol: '',
    type: 'long' as TradeType,
    market: 'futures' as TradeMarket,
    entry: '',
    exit: '',
    quantity: '',
    notes: '',
    emotions: '',
    setup: '',
    mistakes: '',
  });

  const handleAddScreenshots = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const next = [...screenshots, ...Array.from(files)];
    if (next.length > MAX_SCREENSHOTS_PER_TRADE) {
      toast.error('Max 3 screenshots per trade.');
    }
    setScreenshots(next.slice(0, MAX_SCREENSHOTS_PER_TRADE));
  };

  const removeScreenshot = (index: number) => {
    setScreenshots((prev) => prev.filter((_, i) => i !== index));
  };

  const canUploadScreenshots = async (): Promise<{ ok: true; profilePlan: string; storageUsedBytes: number } | { ok: false }> => {
    if (screenshots.length === 0) return { ok: true, profilePlan: 'free', storageUsedBytes: 0 };

    const profile = await getMyProfile();
    if (!profile) {
      toast.error('Please login to upload screenshots.');
      return { ok: false };
    }

    const limitBytes = getStorageLimitBytes(profile.subscriptionPlan);
    if (!Number.isFinite(limitBytes)) {
      return { ok: true, profilePlan: profile.subscriptionPlan, storageUsedBytes: profile.storageUsedBytes };
    }

    const totalUploadBytes = screenshots.reduce((sum, file) => sum + file.size, 0);
    if (profile.storageUsedBytes + totalUploadBytes > limitBytes) {
      toast.error(`Storage limit reached (${getStorageLimitLabel(profile.subscriptionPlan)}). Upgrade to upload more screenshots.`);
      return { ok: false };
    }

    return { ok: true, profilePlan: profile.subscriptionPlan, storageUsedBytes: profile.storageUsedBytes };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFieldErrors({});

    // Validation
    if (!formData.symbol || !formData.entry || !formData.exit || !formData.quantity) {
      toast.error('Please fill in all required fields');
      setFieldErrors({
        symbol: !formData.symbol ? 'Required' : '',
        entry: !formData.entry ? 'Required' : '',
        exit: !formData.exit ? 'Required' : '',
        quantity: !formData.quantity ? 'Required' : '',
      });
      return;
    }

    const entry = parseFloat(formData.entry);
    const exit = parseFloat(formData.exit);
    const size = parseFloat(formData.quantity);

    if (isNaN(entry) || isNaN(exit) || isNaN(size)) {
      toast.error('Please enter valid numbers');
      return;
    }

    if (formData.market === 'forex_cfd') {
      if (size < 0.01) {
        toast.error('Lot size must be at least 0.01');
        setFieldErrors({ quantity: 'Min 0.01' });
        return;
      }
    } else {
      if (!Number.isInteger(size) || size < 1) {
        toast.error('Contracts must be a whole number (min 1)');
        setFieldErrors({ quantity: 'Whole number (min 1)' });
        return;
      }
    }

    if (size <= 0) {
      toast.error('Size must be greater than 0');
      return;
    }

    // Calculate P&L
    const { pnl, pnlPercentage } = calculatePnL(entry, exit, size, formData.type);
    const outcome = determineOutcome(pnl);
    const sizeUnit: TradeSizeUnit = formData.market === 'forex_cfd' ? 'lots' : 'contracts';

    if (screenshots.length > MAX_SCREENSHOTS_PER_TRADE) {
      toast.error('Max 3 screenshots per trade.');
      return;
    }

    const storageCheck = await canUploadScreenshots();
    if (!storageCheck.ok) return;

    const trade = {
      date: formData.date,
      symbol: formData.symbol.toUpperCase(),
      type: formData.type,
      entry,
      exit,
      quantity: size,
      market: formData.market,
      size,
      sizeUnit,
      outcome,
      pnl,
      pnlPercentage,
      notes: formData.notes || undefined,
      emotions: formData.emotions || undefined,
      setup: formData.setup || undefined,
      mistakes: formData.mistakes || undefined,
      screenshots: undefined as string[] | undefined,
    };

    setIsSubmitting(true);
    try {
      const result = await createTrade(trade);
      if (!result.ok) {
        toast.error(result.message);
        if (result.reason === 'upgrade_required') {
          window.dispatchEvent(new Event('open-billing'));
        } else if (result.reason === 'trade_limit' || result.reason === 'trial_expired') {
          window.dispatchEvent(new Event('open-subscription-dialog'));
        }
        return;
      }

      const tradeId = result.tradeId;
      if (screenshots.length > 0 && tradeId) {
        const supabase = requireSupabaseClient();
        const { data: authData } = await supabase.auth.getUser();
        const user = authData.user;
        if (!user) {
          toast.error('Please login to upload screenshots.');
          return;
        }

        const uploaded = [];
        for (const file of screenshots) {
          const safeName = sanitizeFileName(file.name || 'screenshot.png');
          const unique = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now());
          const path = `${user.id}/trades/${tradeId}/${unique}-${safeName}`;

          const { error: uploadError } = await supabase.storage.from(SCREENSHOTS_BUCKET).upload(path, file, {
            upsert: false,
            contentType: file.type,
          });
          if (uploadError) {
            toast.error(`Screenshot upload failed: ${uploadError.message}`);
            return;
          }

          uploaded.push({ path, sizeBytes: file.size });
        }

        if (uploaded.length > 0) {
          const { error: metaError } = await supabase.from('trade_screenshots').insert(
            uploaded.map((s) => ({
              trade_id: tradeId,
              path: s.path,
              size_bytes: s.sizeBytes,
            })),
          );
          if (metaError) {
            toast.error(`Screenshot tracking failed: ${metaError.message}`);
            return;
          }

          const { error: updateError } = await supabase
            .from('trades')
            .update({ screenshots: uploaded.map((s) => s.path) })
            .eq('id', tradeId);
          if (updateError) {
            toast.error(`Failed to attach screenshots: ${updateError.message}`);
            return;
          }
        }
      }

      toast.success('Trade added successfully!');
	    
      // Reset form
      setFormData({
        date: new Date().toISOString().split('T')[0],
        symbol: '',
        type: 'long',
        market: 'futures',
        entry: '',
        exit: '',
        quantity: '',
        notes: '',
        emotions: '',
        setup: '',
        mistakes: '',
      });
      setScreenshots([]);

      onTradeAdded();
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Trade</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Date *</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="symbol">Symbol *</Label>
              <Input
                id="symbol"
                placeholder="e.g., AAPL, TSLA"
                value={formData.symbol}
                onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                required
              />
              {fieldErrors.symbol ? <p className="text-xs text-destructive">{fieldErrors.symbol}</p> : null}
            </div>
          </div>

	          {/* Trade Details */}
	          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
	            <div className="space-y-2">
	              <Label htmlFor="type">Type *</Label>
	              <Select
	                value={formData.type}
	                onValueChange={(value: TradeType) => setFormData({ ...formData, type: value })}
	              >
	                <SelectTrigger id="type">
	                  <SelectValue />
	                </SelectTrigger>
	                <SelectContent>
	                  <SelectItem value="long">Long</SelectItem>
	                  <SelectItem value="short">Short</SelectItem>
	                </SelectContent>
	              </Select>
	            </div>

	            <div className="space-y-2">
	              <Label htmlFor="market">Market *</Label>
	              <Select
	                value={formData.market}
	                onValueChange={(value: TradeMarket) => setFormData({ ...formData, market: value })}
	              >
	                <SelectTrigger id="market">
	                  <SelectValue />
	                </SelectTrigger>
	                <SelectContent>
	                  <SelectItem value="forex_cfd">Forex/CFD</SelectItem>
	                  <SelectItem value="futures">Futures</SelectItem>
	                </SelectContent>
	              </Select>
	            </div>

	            <div className="space-y-2">
	              <Label htmlFor="quantity">{formData.market === 'forex_cfd' ? 'Lot Size' : 'Contracts'} *</Label>
	              <Input
	                id="quantity"
	                type="number"
	                step={formData.market === 'forex_cfd' ? '0.01' : '1'}
	                placeholder={formData.market === 'forex_cfd' ? '0.10' : '1'}
	                value={formData.quantity}
	                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
	                required
	              />
	              <p className="text-xs text-muted-foreground">
	                {formData.market === 'forex_cfd'
	                  ? 'P/L calculated in pips (if applicable).'
	                  : 'P/L calculated in ticks (if applicable).'}
	              </p>
	              {fieldErrors.quantity ? <p className="text-xs text-destructive">{fieldErrors.quantity}</p> : null}
	            </div>
	          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="entry">Entry Price *</Label>
              <Input
                id="entry"
                type="number"
                step="any"
                placeholder="150.00"
                value={formData.entry}
                onChange={(e) => setFormData({ ...formData, entry: e.target.value })}
                required
              />
              {fieldErrors.entry ? <p className="text-xs text-destructive">{fieldErrors.entry}</p> : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="exit">Exit Price *</Label>
              <Input
                id="exit"
                type="number"
                step="any"
                placeholder="155.00"
                value={formData.exit}
                onChange={(e) => setFormData({ ...formData, exit: e.target.value })}
                required
              />
              {fieldErrors.exit ? <p className="text-xs text-destructive">{fieldErrors.exit}</p> : null}
            </div>
          </div>

          {/* Journal Entries */}
          <div className="space-y-2">
            <Label htmlFor="setup">Trade Setup</Label>
            <Textarea
              id="setup"
              placeholder="Describe your trade setup and strategy..."
              value={formData.setup}
              onChange={(e) => setFormData({ ...formData, setup: e.target.value })}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Additional notes about this trade..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="emotions">Emotions & Psychology</Label>
            <Textarea
              id="emotions"
              placeholder="How did you feel during this trade?"
              value={formData.emotions}
              onChange={(e) => setFormData({ ...formData, emotions: e.target.value })}
              rows={2}
            />
          </div>

	          <div className="space-y-2">
	            <Label htmlFor="mistakes">Mistakes & Lessons</Label>
	            <Textarea
	              id="mistakes"
	              placeholder="What could you have done better?"
	              value={formData.mistakes}
	              onChange={(e) => setFormData({ ...formData, mistakes: e.target.value })}
	              rows={2}
	            />
	          </div>

	          {/* Screenshots */}
	          <div className="space-y-2">
	            <Label htmlFor="screenshots">Screenshots</Label>
	            <Input
	              id="screenshots"
	              type="file"
	              accept="image/*"
	              multiple
	              onChange={(e) => {
	                handleAddScreenshots(e.currentTarget.files);
	                e.currentTarget.value = '';
	              }}
	            />
	            <p className="text-xs text-muted-foreground">
	              Max {MAX_SCREENSHOTS_PER_TRADE} screenshots per trade. Storage limit applies by plan.
	            </p>
	            {screenshots.length > 0 ? (
	              <div className="space-y-2">
	                {screenshots.map((file, index) => (
	                  <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
	                    <div className="min-w-0">
	                      <p className="text-sm font-medium truncate">{file.name}</p>
	                      <p className="text-xs text-muted-foreground">
	                        {(file.size / (1024 * 1024)).toFixed(2)} MB
	                      </p>
	                    </div>
	                    <Button type="button" variant="outline" size="sm" onClick={() => removeScreenshot(index)}>
	                      Remove
	                    </Button>
	                  </div>
	                ))}
	              </div>
	            ) : null}
	          </div>

	          {/* Actions */}
	          <div className="flex justify-end gap-4">
	            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Adding…' : 'Add Trade'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
