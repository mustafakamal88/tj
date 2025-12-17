import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';
import { createTrade } from '../utils/trades-api';
import { calculatePnL, determineOutcome } from '../utils/trade-calculations';
import type { TradeType, Trade } from '../types/trade';

interface AddTradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTradeAdded: () => void;
}

export function AddTradeDialog({ open, onOpenChange, onTradeAdded }: AddTradeDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    symbol: '',
    type: 'long' as TradeType,
    entry: '',
    exit: '',
    quantity: '',
    notes: '',
    emotions: '',
    setup: '',
    mistakes: '',
  });

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
    const quantity = parseFloat(formData.quantity);

    if (isNaN(entry) || isNaN(exit) || isNaN(quantity)) {
      toast.error('Please enter valid numbers');
      return;
    }

    if (quantity <= 0) {
      toast.error('Quantity must be greater than 0');
      return;
    }

    // Calculate P&L
    const { pnl, pnlPercentage } = calculatePnL(entry, exit, quantity, formData.type);
    const outcome = determineOutcome(pnl);

    const trade = {
      date: formData.date,
      symbol: formData.symbol.toUpperCase(),
      type: formData.type,
      entry,
      exit,
      quantity,
      outcome,
      pnl,
      pnlPercentage,
      notes: formData.notes || undefined,
      emotions: formData.emotions || undefined,
      setup: formData.setup || undefined,
      mistakes: formData.mistakes || undefined,
    };

    setIsSubmitting(true);
    try {
      const result = await createTrade(trade);
      if (!result.ok) {
        toast.error(result.message);
        if (result.reason === 'trade_limit' || result.reason === 'trial_expired') {
          window.dispatchEvent(new Event('open-subscription-dialog'));
        }
        return;
      }
      toast.success('Trade added successfully!');
    
      // Reset form
      setFormData({
        date: new Date().toISOString().split('T')[0],
        symbol: '',
        type: 'long',
        entry: '',
        exit: '',
        quantity: '',
        notes: '',
        emotions: '',
        setup: '',
        mistakes: '',
      });

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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <Label htmlFor="quantity">Quantity *</Label>
              <Input
                id="quantity"
                type="number"
                step="any"
                placeholder="100"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                required
              />
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
