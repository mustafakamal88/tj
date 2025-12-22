import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';
import { createTrade } from '../utils/trades-api';
import { ensureSession, requireSupabaseClient, toastSessionExpiredOnce, toastSupabaseError } from '../utils/supabase';
import { calculatePnL, determineOutcome } from '../utils/trade-calculations';
import type { TradeMarket, TradeSizeUnit, TradeType } from '../types/trade';

interface AddTradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTradeAdded: () => void;
}

const SCREENSHOTS_BUCKET = 'trade-screenshots';
const MAX_SCREENSHOTS_PER_TRADE = 3;
const GIGABYTE_BYTES = 1024 * 1024 * 1024;
const FREE_SCREENSHOT_STORAGE_BYTES = 2 * GIGABYTE_BYTES; // 2GB
const PRO_SCREENSHOT_STORAGE_BYTES = 5 * GIGABYTE_BYTES; // 5GB
const PREMIUM_SCREENSHOT_STORAGE_BYTES = 10 * GIGABYTE_BYTES; // 10GB

type ScreenshotMeta = { name: string; size: number };

type DraftPayloadV1 = {
  v: 1;
  savedAt: string;
  form: {
    date: string;
    symbol: string;
    type: TradeType;
    market: TradeMarket;
    entry: string;
    exit: string;
    quantity: string;
    notes: string;
    emotions: string;
    setup: string;
    mistakes: string;
  };
  screenshots: ScreenshotMeta[];
};

function isMissingColumnOrSchemaCacheError(error: unknown): boolean {
  const message = typeof (error as any)?.message === 'string' ? String((error as any).message) : '';
  const details = typeof (error as any)?.details === 'string' ? String((error as any).details) : '';
  const hint = typeof (error as any)?.hint === 'string' ? String((error as any).hint) : '';
  const code = typeof (error as any)?.code === 'string' ? String((error as any).code) : '';
  const text = `${message} ${details} ${hint} ${code}`.toLowerCase();
  return text.includes('schema cache') || (text.includes('column') && text.includes('does not exist'));
}

function toSafeNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function getStorageLimitLabel(plan: string): string {
  if (plan === 'pro') return '5GB';
  if (plan === 'premium') return '10GB';
  return '2GB';
}

function getStorageLimitBytes(plan: string): number {
  if (plan === 'premium') return PREMIUM_SCREENSHOT_STORAGE_BYTES;
  if (plan === 'pro') return PRO_SCREENSHOT_STORAGE_BYTES;
  return FREE_SCREENSHOT_STORAGE_BYTES;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function serializeDraft(input: {
  formData: DraftPayloadV1['form'];
  screenshotsMeta: ScreenshotMeta[];
}): DraftPayloadV1 {
  return {
    v: 1,
    savedAt: new Date().toISOString(),
    form: { ...input.formData },
    screenshots: input.screenshotsMeta.map((s) => ({ name: s.name, size: s.size })),
  };
}

function deserializeDraft(value: unknown): DraftPayloadV1 | null {
  if (!value || typeof value !== 'object') return null;
  const v = (value as any).v;
  if (v !== 1) return null;
  const form = (value as any).form;
  if (!form || typeof form !== 'object') return null;
  const screenshots = Array.isArray((value as any).screenshots) ? (value as any).screenshots : [];

  const requiredStrings = ['date', 'symbol', 'entry', 'exit', 'quantity', 'notes', 'emotions', 'setup', 'mistakes'] as const;
  for (const k of requiredStrings) {
    if (typeof (form as any)[k] !== 'string') return null;
  }
  if ((form as any).type !== 'long' && (form as any).type !== 'short') return null;
  if ((form as any).market !== 'forex_cfd' && (form as any).market !== 'futures') return null;

  return {
    v: 1,
    savedAt: typeof (value as any).savedAt === 'string' ? (value as any).savedAt : new Date().toISOString(),
    form: {
      date: String((form as any).date),
      symbol: String((form as any).symbol),
      type: (form as any).type as TradeType,
      market: (form as any).market as TradeMarket,
      entry: String((form as any).entry),
      exit: String((form as any).exit),
      quantity: String((form as any).quantity),
      notes: String((form as any).notes),
      emotions: String((form as any).emotions),
      setup: String((form as any).setup),
      mistakes: String((form as any).mistakes),
    },
    screenshots: screenshots
      .map((s: any) => ({ name: typeof s?.name === 'string' ? s.name : '', size: typeof s?.size === 'number' ? s.size : Number(s?.size) }))
      .filter((s: ScreenshotMeta) => Boolean(s.name) && Number.isFinite(s.size) && s.size >= 0),
  };
}

function isAuthStatus(status: unknown): boolean {
  return status === 401 || status === '401';
}

function isPermissionStatus(status: unknown): boolean {
  return status === 403 || status === '403';
}

export function AddTradeDialog({ open, onOpenChange, onTradeAdded }: AddTradeDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [restoredScreenshotMeta, setRestoredScreenshotMeta] = useState<ScreenshotMeta[]>([]);
  const [authReady, setAuthReady] = useState(false);
  const [draftKey, setDraftKey] = useState<string>('tj:add-trade:draft:anon');
  const [draftRestored, setDraftRestored] = useState(false);
  const draftSaveTimerRef = useRef<number | null>(null);
  const storageWarningShownRef = useRef(false);
  const supabaseRef = useRef<ReturnType<typeof requireSupabaseClient> | null>(null);
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

  const screenshotsMeta: ScreenshotMeta[] = useMemo(() => {
    const current = screenshots.map((f) => ({ name: f.name, size: f.size }));
    // When restoring from draft, we can't restore raw Files. Keep metadata visible.
    return current.length ? current : restoredScreenshotMeta;
  }, [screenshots, restoredScreenshotMeta]);

  const getSupabase = (): ReturnType<typeof requireSupabaseClient> => {
    if (!supabaseRef.current) {
      supabaseRef.current = requireSupabaseClient();
    }
    return supabaseRef.current;
  };

  useEffect(() => {
    if (!open) return;

    let active = true;
    setAuthReady(false);

    (async () => {
      try {
        const supabase = getSupabase();
        await supabase.auth.getSession();

        // Determine draft key from the current authenticated user.
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData.user?.id;

        const anonKey = 'tj:add-trade:draft:anon';
        const userKey = `tj:add-trade:draft:${userId ?? 'anon'}`;
        const key = userId ? userKey : anonKey;

        if (active) {
          setDraftKey(key);
        }

        // Restore draft (prefer user draft; fallback to anon draft).
        if (typeof window !== 'undefined') {
          const tryRead = (k: string): DraftPayloadV1 | null => {
            try {
              const raw = window.localStorage.getItem(k);
              if (!raw) return null;
              const parsed = JSON.parse(raw);
              return deserializeDraft(parsed);
            } catch {
              return null;
            }
          };

          const draft = userId ? tryRead(userKey) ?? tryRead(anonKey) : tryRead(anonKey);
          if (draft && active) {
            setFormData(draft.form);
            setRestoredScreenshotMeta(draft.screenshots);
            setScreenshots([]);
            setDraftRestored(true);

            // If we loaded anon draft for an authenticated user, migrate it to the user key.
            if (userId && !tryRead(userKey) && tryRead(anonKey)) {
              try {
                window.localStorage.setItem(userKey, JSON.stringify(draft));
                window.localStorage.removeItem(anonKey);
              } catch {
                // ignore
              }
            }
          } else if (active) {
            setDraftRestored(false);
          }
        }
      } catch {
        // Ignore; authReady will still allow the UI to proceed.
      } finally {
        if (active) setAuthReady(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    storageWarningShownRef.current = false;
  }, [open]);

  // Persist draft (debounced) while the modal is open.
  useEffect(() => {
    if (!open) return;
    if (typeof window === 'undefined') return;

    if (draftSaveTimerRef.current) window.clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = window.setTimeout(() => {
      try {
        const payload = serializeDraft({ formData, screenshotsMeta });
        window.localStorage.setItem(draftKey, JSON.stringify(payload));
      } catch {
        // ignore
      }
    }, 400);

    return () => {
      if (draftSaveTimerRef.current) window.clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    };
  }, [open, draftKey, formData, screenshotsMeta]);

  const handleAddScreenshots = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    // The user is selecting new files; clear any restored (metadata-only) placeholders.
    if (restoredScreenshotMeta.length) setRestoredScreenshotMeta([]);

    const next = [...screenshots, ...Array.from(files)];
    if (next.length > MAX_SCREENSHOTS_PER_TRADE) {
      toast.error('Max 3 screenshots per trade.');
    }
    setScreenshots(next.slice(0, MAX_SCREENSHOTS_PER_TRADE));

    // Only show storage warning when the user explicitly interacts with screenshots.
    void (async () => {
      const check = await canUploadScreenshots(next.slice(0, MAX_SCREENSHOTS_PER_TRADE));
      if (check.ok && check.warning && !storageWarningShownRef.current) {
        storageWarningShownRef.current = true;
        toast.info(check.warning);
      }
    })();
  };

  const removeScreenshot = (index: number) => {
    setScreenshots((prev) => prev.filter((_, i) => i !== index));
  };

  const canUploadScreenshots = async (
    filesOverride?: File[],
  ): Promise<
    | { ok: true; profilePlan: string; storageUsedBytes: number; warning?: string; warningDetail?: string }
    | { ok: false; reason: 'not_authenticated' | 'limit' | 'unknown' }
  > => {
    const files = filesOverride ?? screenshots;
    if (files.length === 0) return { ok: true, profilePlan: 'free', storageUsedBytes: 0 };

    let supabase: ReturnType<typeof requireSupabaseClient>;
    try {
      supabase = getSupabase();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Supabase is not configured.');
      return { ok: false, reason: 'unknown' };
    }

    const session = await ensureSession(supabase);
    if (!session) return { ok: false, reason: 'not_authenticated' };
    const userId = session.user.id;

    const totalUploadBytes = files.reduce((sum, file) => sum + file.size, 0);
    const FALLBACK_WARNING = 'Storage check unavailable. Upload may fail if you exceed your plan limit.';
    const fallback = (warning: string, warningDetail?: string) =>
      ({ ok: true, profilePlan: 'free', storageUsedBytes: 0, warning, warningDetail } as const);

    const runProfileSelect = () =>
      supabase
        .from('profiles')
        .select('subscription_plan,storage_used_bytes')
        .eq('id', userId)
        .maybeSingle<{ subscription_plan: string; storage_used_bytes: number | null }>();

    let { data: profileRow, error: profileError, status: profileStatus } = await runProfileSelect();

    if (profileError && isAuthStatus(profileStatus)) {
      try {
        await supabase.auth.refreshSession();
      } catch {
        // ignore
      }
      ({ data: profileRow, error: profileError, status: profileStatus } = await runProfileSelect());
    }

    if (profileError) {
      // PostgREST schema cache can lag immediately after migrations; retry with a narrower select.
      if (isMissingColumnOrSchemaCacheError(profileError)) {
        const { data: planOnly, error: planError } = await supabase
          .from('profiles')
          .select('subscription_plan')
          .eq('id', userId)
          .maybeSingle<{ subscription_plan: string }>();
        if (!planError && planOnly) {
          const plan = typeof planOnly.subscription_plan === 'string' ? planOnly.subscription_plan : 'free';
          return fallback(FALLBACK_WARNING);
        }
      }

      const detail =
        profileStatus === 401
          ? 'Session expired, please login again.'
          : profileStatus === 403
            ? 'No permission to check storage limits.'
            : 'Unable to check storage limits. Please try again.';

      // Do not block the user completely when storage check is unavailable.
      // We surface a generic warning, and only show the status-specific detail for actionable cases.
      return fallback(FALLBACK_WARNING, detail);
    }

    if (!profileRow) {
      toast.error('Unable to load your profile. Please try again.');
      return fallback(FALLBACK_WARNING);
    }

    const plan = typeof profileRow.subscription_plan === 'string' ? profileRow.subscription_plan : 'free';
    const storageUsedBytes = Math.max(0, toSafeNumber(profileRow.storage_used_bytes));

    const limitBytes = getStorageLimitBytes(plan);
    if (!Number.isFinite(limitBytes)) {
      return { ok: true, profilePlan: plan, storageUsedBytes };
    }

    if (storageUsedBytes + totalUploadBytes > limitBytes) {
      toast.error(`Storage limit reached (${getStorageLimitLabel(plan)}). Upgrade to upload more screenshots.`);
      return { ok: false, reason: 'limit' };
    }

    return { ok: true, profilePlan: plan, storageUsedBytes };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFieldErrors({});

    if (!authReady) {
      toast.error('Please wait a moment for your session to load.');
      return;
    }

    const clearDraft = () => {
      if (typeof window === 'undefined') return;
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
        // ignore
      }
    };

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

    // Must-have: verify session before any RLS/storage checks.
    let supabase: ReturnType<typeof requireSupabaseClient>;
    try {
      supabase = getSupabase();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Supabase is not configured.');
      return;
    }

    const sessionInfo = await ensureSession(supabase);
    if (!sessionInfo) {
      toastSessionExpiredOnce();
      return;
    }

    const storageCheck = await canUploadScreenshots();
    if (!storageCheck.ok) {
      if (storageCheck.reason === 'not_authenticated') {
        toastSessionExpiredOnce();
      }
      return;
    }
    if (storageCheck.warning && screenshots.length > 0 && !storageWarningShownRef.current) {
      storageWarningShownRef.current = true;
      toast.info(storageCheck.warning);
    }

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
      // Re-check session once at submit time.
      const sessionInfo = await ensureSession(supabase);
      if (!sessionInfo) {
        toastSessionExpiredOnce();
        return;
      }

      let result = await createTrade(trade);

      // Occasionally in Codespaces/slow boots, auth can hydrate after the first call.
      // Retry once after a refresh if the API reports not_authenticated.
      if (!result.ok && result.reason === 'not_authenticated') {
        try {
          await supabase.auth.refreshSession();
        } catch {
          // ignore
        }
        result = await createTrade(trade);
      }

      if (!result.ok) {
        const msg = (result.message ?? '').trim();
        if (result.reason === 'not_authenticated') {
          const session = await ensureSession(supabase);
          if (!session) toastSessionExpiredOnce();
          else toast.error('Authentication error, please retry.');
        } else {
          // The API surface here doesn't provide HTTP status codes, so keep messaging minimal.
          toast.error(msg || 'Failed to save trade.');
        }
        if (result.reason === 'upgrade_required') {
          window.dispatchEvent(new Event('open-billing'));
        } else if (result.reason === 'trade_limit' || result.reason === 'trial_expired') {
          window.dispatchEvent(new Event('open-subscription-dialog'));
        }
        return;
      }

      const tradeId = result.tradeId;
      if (screenshots.length > 0 && tradeId) {
        const session = await ensureSession(supabase);
        if (!session) {
          toastSessionExpiredOnce();
          return;
        }

        const userId = session.user.id;

        const uploaded: Array<{ path: string; sizeBytes: number }> = [];
        for (const file of screenshots) {
          const safeName = sanitizeFileName(file.name || 'screenshot.png');
          const unique = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now());
          const path = `${userId}/trades/${tradeId}/${unique}-${safeName}`;

          const uploadOnce = () =>
            supabase.storage.from(SCREENSHOTS_BUCKET).upload(path, file, {
              upsert: false,
              contentType: file.type,
            });

          let { error: uploadError } = await uploadOnce();
          const uploadStatus = (uploadError as { statusCode?: number })?.statusCode;
          if (uploadError && isAuthStatus(uploadStatus)) {
            try {
              await supabase.auth.refreshSession();
            } catch {
              // ignore
            }
            ({ error: uploadError } = await uploadOnce());
          }
          if (uploadError) {
            const statusCode = (uploadError as { statusCode?: number }).statusCode;
            await toastSupabaseError(supabase, { error: uploadError, status: statusCode });
            return;
          }

          uploaded.push({ path, sizeBytes: file.size });
        }

        if (uploaded.length > 0) {
          const metaInsertOnce = () =>
            supabase.from('trade_screenshots').insert(
              uploaded.map((s) => ({
                trade_id: tradeId,
                path: s.path,
                size_bytes: s.sizeBytes,
              })),
            );

          let { error: metaError, status: metaStatus } = await metaInsertOnce();
          if (metaError && isAuthStatus(metaStatus)) {
            try {
              await supabase.auth.refreshSession();
            } catch {
              // ignore
            }
            ({ error: metaError, status: metaStatus } = await metaInsertOnce());
          }
          if (metaError) {
            await toastSupabaseError(supabase, { error: metaError, status: metaStatus });
            return;
          }

          const updateOnce = () =>
            supabase
              .from('trades')
              .update({ screenshots: uploaded.map((s) => s.path) })
              .eq('id', tradeId);

          let { error: updateError, status: updateStatus } = await updateOnce();
          if (updateError && isAuthStatus(updateStatus)) {
            try {
              await supabase.auth.refreshSession();
            } catch {
              // ignore
            }
            ({ error: updateError, status: updateStatus } = await updateOnce());
          }
          if (updateError) {
            await toastSupabaseError(supabase, { error: updateError, status: updateStatus });
            return;
          }
        }
      }

      toast.success('Trade added successfully!');

      clearDraft();
	    
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
      setRestoredScreenshotMeta([]);
      setDraftRestored(false);

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

        {draftRestored ? <p className="text-xs text-muted-foreground">Draft restored.</p> : null}

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
              {restoredScreenshotMeta.length > 0 && screenshots.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Previously selected screenshots (reselect to upload):</p>
                  {restoredScreenshotMeta.map((s, index) => (
                    <div key={`${s.name}-${index}`} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{(s.size / (1024 * 1024)).toFixed(2)} MB</p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => setRestoredScreenshotMeta((prev) => prev.filter((_, i) => i !== index))}>
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
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
	            <Button type="submit" disabled={isSubmitting || !authReady}>
              {isSubmitting ? 'Adding…' : 'Add Trade'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
