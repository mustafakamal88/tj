import { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';

type TradingViewChartProps = {
  symbol: string;
  heightClassName?: string;
};

let tradingViewScriptPromise: Promise<void> | null = null;

function loadTradingViewScript(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.resolve();
  if (typeof (window as any).TradingView !== 'undefined') return Promise.resolve();

  if (tradingViewScriptPromise) return tradingViewScriptPromise;

  tradingViewScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://s3.tradingview.com/tv.js"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load TradingView script')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load TradingView script'));
    document.head.appendChild(script);
  });

  return tradingViewScriptPromise;
}

export function TradingViewChart({ symbol, heightClassName = 'h-[200px]' }: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const uniqueSuffixRef = useRef(Math.random().toString(36).slice(2, 9));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof document === 'undefined') return 'dark';
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  });

  const containerId = useMemo(() => {
    const safe = String(symbol || 'chart').replace(/[^a-zA-Z0-9_-]/g, '-');
    return `tradingview-widget-${safe}-${uniqueSuffixRef.current}`;
  }, [symbol]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (typeof MutationObserver === 'undefined') return;
    if (!containerRef.current) return;

    const el = document.documentElement;
    const updateTheme = () => setTheme(el.classList.contains('dark') ? 'dark' : 'light');
    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(el, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (!containerRef.current) return;

    let cancelled = false;
    setLoadError(null);

    // Clean up previous widget
    containerRef.current.innerHTML = '';

    // Format symbol for TradingView
    // XAUUSD -> OANDA:XAUUSD
    // EURUSD -> FX:EURUSD
    const formattedSymbol = symbol.includes('XAU') || symbol.includes('XAG')
      ? `OANDA:${symbol}`
      : `FX:${symbol}`;

    const initWidget = () => {
      if (cancelled) return;
      if (!containerRef.current) return;

      try {
        const tv = (window as any).TradingView;
        if (!tv || !tv.widget) {
          setLoadError('Chart unavailable');
          return;
        }

        new tv.widget({
          container_id: containerId,
          autosize: true,
          symbol: formattedSymbol,
          interval: '60',
          timezone: 'Etc/UTC',
          theme,
          style: '1',
          locale: 'en',
          enable_publishing: false,
          hide_side_toolbar: true,
          allow_symbol_change: false,
          details: false,
          hotlist: false,
          calendar: false,
          withdateranges: true,
          hide_top_toolbar: false,
          save_image: false,
          studies: [],
        });
      } catch (error) {
        console.error('[TradingViewChart] init failed', error);
        setLoadError('Chart unavailable');
      }
    };

    void loadTradingViewScript()
      .then(() => {
        initWidget();
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('[TradingViewChart] script load failed', error);
        setLoadError('Chart unavailable');
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, containerId, theme, retryNonce]);

  if (loadError) {
    return (
      <Card className="overflow-hidden bg-background">
        <div className={`w-full ${heightClassName} flex items-center justify-center p-4`}>
          <div className="text-center space-y-2">
            <div className="text-sm font-medium">Chart unavailable</div>
            <div className="text-xs text-muted-foreground">Your dashboard will still work without it.</div>
            <Button type="button" size="sm" variant="outline" onClick={() => setRetryNonce((n) => n + 1)}>
              Retry
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden bg-background">
      <div
        id={containerId}
        ref={containerRef}
        className={`w-full ${heightClassName}`}
      />
    </Card>
  );
}
