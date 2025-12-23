export type TradeType = 'long' | 'short';
export type TradeOutcome = 'win' | 'loss' | 'breakeven';
export type TradeMarket = 'forex_cfd' | 'futures';
export type TradeSizeUnit = 'lots' | 'contracts';

export interface Trade {
  id: string;
  date: string; // ISO date string
  closeTime?: string;
  openTime?: string;
  accountLogin?: string;
  ticket?: string;
  positionId?: string;
  commission?: number;
  swap?: number;
  symbol: string;
  type: TradeType;
  entry: number;
  stopLoss?: number;
  takeProfit?: number;
  exit: number;
  quantity: number;
  market?: TradeMarket;
  size?: number;
  sizeUnit?: TradeSizeUnit;
  outcome: TradeOutcome;
  pnl: number;
  pnlPercentage: number;
  notes?: string;
  emotions?: string;
  setup?: string;
  mistakes?: string;
  screenshots?: string[];
  tags?: string[];
  createdAt: string;
}

export interface TradeFormData {
  date: string;
  symbol: string;
  type: TradeType;
  entry: string;
  stopLoss?: string;
  takeProfit?: string;
  exit: string;
  quantity: string;
  market?: TradeMarket;
  notes?: string;
  emotions?: string;
  setup?: string;
  mistakes?: string;
  tags?: string[];
}
