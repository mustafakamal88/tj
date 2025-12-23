import { useEffect, useMemo, useRef } from 'react';
import { Card } from './ui/card';

type TradingViewChartProps = {
  symbol: string;
  heightClassName?: string;
};

export function TradingViewChart({ symbol, heightClassName = 'h-[200px]' }: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptLoadedRef = useRef(false);

  const containerId = useMemo(() => {
    const safe = String(symbol || 'chart').replace(/[^a-zA-Z0-9_-]/g, '-');
    return `tradingview-widget-${safe}`;
  }, [symbol]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clean up previous widget
    containerRef.current.innerHTML = '';

    // Format symbol for TradingView
    // XAUUSD -> OANDA:XAUUSD
    // EURUSD -> FX:EURUSD
    const formattedSymbol = symbol.includes('XAU') || symbol.includes('XAG')
      ? `OANDA:${symbol}`
      : `FX:${symbol}`;

    // Load TradingView widget script
    if (!scriptLoadedRef.current) {
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/tv.js';
      script.async = true;
      script.onload = () => {
        scriptLoadedRef.current = true;
        initWidget();
      };
      document.head.appendChild(script);
    } else {
      initWidget();
    }

    function initWidget() {
      if (!containerRef.current || typeof (window as any).TradingView === 'undefined') return;

      new (window as any).TradingView.widget({
        container_id: containerId,
        autosize: true,
        symbol: formattedSymbol,
        interval: '60',
        timezone: 'Etc/UTC',
        theme: 'dark',
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
    }
  }, [symbol, containerId]);

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
