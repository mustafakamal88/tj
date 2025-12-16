import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Upload, FileText, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { addTrade } from '../utils/local-storage';
import { calculatePnL, determineOutcome } from '../utils/trade-calculations';
import type { Trade, TradeType } from '../types/trade';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

interface MTImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
}

export function MTImportDialog({ open, onOpenChange, onImportComplete }: MTImportDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const parseMT4MT5File = async (file: File): Promise<Trade[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const lines = text.split('\n');
          const trades: Trade[] = [];
          
          // Skip header lines and find data
          let dataStartIndex = 0;
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('Ticket') || lines[i].includes('Order')) {
              dataStartIndex = i + 1;
              break;
            }
          }

          // Parse each trade line
          for (let i = dataStartIndex; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // Split by tab or multiple spaces
            const parts = line.split(/\t+|\s{2,}/);
            
            if (parts.length < 8) continue;

            try {
              // Try to extract trade data (format may vary)
              // Common format: Ticket, Time, Type, Size, Symbol, Price, S/L, T/P, Price, Commission, Swap, Profit
              
              let ticket, openTime, type, size, symbol, openPrice, closePrice, profit;
              
              // Flexible parsing based on common MT4/MT5 formats
              if (parts.length >= 10) {
                ticket = parts[0];
                openTime = parts[1] + ' ' + (parts[2] || '');
                type = parts[3] || parts[4];
                size = parseFloat(parts[5] || parts[6]);
                symbol = parts[6] || parts[7];
                openPrice = parseFloat(parts[7] || parts[8]);
                closePrice = parseFloat(parts[9] || parts[10]);
                profit = parseFloat(parts[parts.length - 1]);
              } else {
                continue;
              }

              if (isNaN(size) || isNaN(openPrice) || isNaN(closePrice) || isNaN(profit)) {
                continue;
              }

              // Determine trade type
              const tradeType: TradeType = type.toLowerCase().includes('sell') || type.toLowerCase().includes('short') ? 'short' : 'long';

              // Calculate P&L
              const { pnl, pnlPercentage } = calculatePnL(openPrice, closePrice, size, tradeType);
              const outcome = determineOutcome(profit); // Use actual profit from MT

              // Parse date
              const tradeDate = new Date(openTime);
              if (isNaN(tradeDate.getTime())) continue;

              const trade: Trade = {
                id: `mt_import_${ticket}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                date: tradeDate.toISOString().split('T')[0],
                symbol: symbol.replace(/[^a-zA-Z0-9]/g, ''),
                type: tradeType,
                entry: openPrice,
                exit: closePrice,
                quantity: size,
                outcome,
                pnl: profit,
                pnlPercentage,
                notes: `Imported from MT4/MT5 - Ticket: ${ticket}`,
                createdAt: new Date().toISOString(),
              };

              trades.push(trade);
            } catch (err) {
              console.warn('Error parsing line:', line, err);
              continue;
            }
          }

          resolve(trades);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

  const parseCSVFile = async (file: File): Promise<Trade[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const lines = text.split('\n');
          const trades: Trade[] = [];
          
          // Parse CSV header
          const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
          
          // Find column indices
          const dateIdx = headers.findIndex(h => h.includes('date') || h.includes('time'));
          const symbolIdx = headers.findIndex(h => h.includes('symbol') || h.includes('instrument'));
          const typeIdx = headers.findIndex(h => h.includes('type') || h.includes('side'));
          const entryIdx = headers.findIndex(h => h.includes('entry') || h.includes('open'));
          const exitIdx = headers.findIndex(h => h.includes('exit') || h.includes('close'));
          const sizeIdx = headers.findIndex(h => h.includes('size') || h.includes('volume') || h.includes('quantity'));
          const profitIdx = headers.findIndex(h => h.includes('profit') || h.includes('p&l') || h.includes('pnl'));

          // Parse data rows
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const parts = line.split(',').map(p => p.trim());
            
            try {
              const date = parts[dateIdx];
              const symbol = parts[symbolIdx];
              const type = parts[typeIdx];
              const entry = parseFloat(parts[entryIdx]);
              const exit = parseFloat(parts[exitIdx]);
              const size = parseFloat(parts[sizeIdx]);
              const profit = profitIdx >= 0 ? parseFloat(parts[profitIdx]) : 0;

              if (!symbol || isNaN(entry) || isNaN(exit) || isNaN(size)) continue;

              const tradeType: TradeType = type.toLowerCase().includes('sell') || type.toLowerCase().includes('short') ? 'short' : 'long';
              
              const { pnl, pnlPercentage } = calculatePnL(entry, exit, size, tradeType);
              const actualPnL = profit !== 0 ? profit : pnl;
              const outcome = determineOutcome(actualPnL);

              const trade: Trade = {
                id: `csv_import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                date: new Date(date).toISOString().split('T')[0],
                symbol: symbol.replace(/[^a-zA-Z0-9]/g, ''),
                type: tradeType,
                entry,
                exit,
                quantity: size,
                outcome,
                pnl: actualPnL,
                pnlPercentage,
                notes: 'Imported from CSV',
                createdAt: new Date().toISOString(),
              };

              trades.push(trade);
            } catch (err) {
              console.warn('Error parsing CSV line:', line, err);
              continue;
            }
          }

          resolve(trades);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, format: 'mt' | 'csv') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);

    try {
      let trades: Trade[] = [];
      
      if (format === 'mt') {
        trades = await parseMT4MT5File(file);
      } else {
        trades = await parseCSVFile(file);
      }

      if (trades.length === 0) {
        toast.error('No valid trades found in file. Please check the format.');
        return;
      }

      // Save all trades
      trades.forEach(trade => addTrade(trade));
      
      toast.success(`Successfully imported ${trades.length} trades!`);
      onImportComplete();
      onOpenChange(false);
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Failed to import trades. Please check the file format.');
    } finally {
      setIsProcessing(false);
      // Reset file input
      e.target.value = '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Trades from MT4/MT5</DialogTitle>
          <DialogDescription>
            Upload your trading history from MetaTrader 4/5 or CSV file
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="mt" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="mt">MT4/MT5</TabsTrigger>
            <TabsTrigger value="csv">CSV</TabsTrigger>
          </TabsList>

          {/* MT4/MT5 Import */}
          <TabsContent value="mt" className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm space-y-2">
                  <p className="font-medium text-blue-900 dark:text-blue-100">How to export from MT4/MT5:</p>
                  <ol className="list-decimal list-inside space-y-1 text-blue-800 dark:text-blue-200">
                    <li>Open MetaTrader 4 or 5</li>
                    <li>Go to "Terminal" → "Account History" tab</li>
                    <li>Right-click and select "Save as Report"</li>
                    <li>Choose "Open XML" or "HTML" format</li>
                    <li>Upload the file below</li>
                  </ol>
                </div>
              </div>
            </div>

            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <input
                type="file"
                accept=".html,.xml,.txt"
                onChange={(e) => handleFileUpload(e, 'mt')}
                className="hidden"
                id="mt-file-upload"
                disabled={isProcessing}
              />
              <label htmlFor="mt-file-upload" className="cursor-pointer">
                <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="mb-2">
                  {isProcessing ? 'Processing...' : 'Click to upload MT4/MT5 report'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Supports HTML, XML, or TXT format
                </p>
              </label>
            </div>
          </TabsContent>

          {/* CSV Import */}
          <TabsContent value="csv" className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
              <div className="flex gap-3">
                <FileText className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm space-y-2">
                  <p className="font-medium text-blue-900 dark:text-blue-100">CSV Format Requirements:</p>
                  <p className="text-blue-800 dark:text-blue-200">
                    Your CSV should include columns for: Date, Symbol, Type (Buy/Sell), Entry Price, Exit Price, Size/Volume, and optionally Profit
                  </p>
                </div>
              </div>
            </div>

            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <input
                type="file"
                accept=".csv"
                onChange={(e) => handleFileUpload(e, 'csv')}
                className="hidden"
                id="csv-file-upload"
                disabled={isProcessing}
              />
              <label htmlFor="csv-file-upload" className="cursor-pointer">
                <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="mb-2">
                  {isProcessing ? 'Processing...' : 'Click to upload CSV file'}
                </p>
                <p className="text-sm text-muted-foreground">
                  CSV format with trading data
                </p>
              </label>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
