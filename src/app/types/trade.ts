export type TradeType = 'long' | 'short';
export type TradeOutcome = 'win' | 'loss' | 'breakeven';

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
  exit: number;
  quantity: number;
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
  exit: string;
  quantity: string;
  notes?: string;
  emotions?: string;
  setup?: string;
  mistakes?: string;
  tags?: string[];
}
