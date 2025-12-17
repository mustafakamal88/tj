import type { TradeInput } from '../trades-api';

export type BrokerId = 'csv' | 'mt4' | 'mt5' | 'tradovate' | 'ninjatrader';

export type ImportFormat = 'csv' | 'html' | 'xml' | 'txt';

export type ParseResult =
  | { ok: true; trades: TradeInput[]; warnings: string[] }
  | { ok: false; error: string };

export interface BrokerAdapter {
  id: BrokerId;
  label: string;
  supportedFormats: ImportFormat[];
  parseImportFile(file: File): Promise<ParseResult>;
}

export const comingSoonAdapters: BrokerAdapter[] = [
  {
    id: 'tradovate',
    label: 'Tradovate (coming soon)',
    supportedFormats: [],
    async parseImportFile() {
      return { ok: false, error: 'Tradovate import is not implemented yet.' };
    },
  },
  {
    id: 'ninjatrader',
    label: 'NinjaTrader (coming soon)',
    supportedFormats: [],
    async parseImportFile() {
      return { ok: false, error: 'NinjaTrader import is not implemented yet.' };
    },
  },
];

