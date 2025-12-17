import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Upload, FileText, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { createTrades, type TradeInput } from '../utils/trades-api';
import type { TradeType } from '../types/trade';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { calculatePnL, determineOutcome } from '../utils/trade-calculations';

interface MTImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
}

export function MTImportDialog({ open, onOpenChange, onImportComplete }: MTImportDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const decodeText = (buffer: ArrayBuffer): { text: string; encoding: string } => {
    const bytes = new Uint8Array(buffer);
    const head = bytes.subarray(0, Math.min(bytes.length, 512));

    const hasUtf8Bom = head.length >= 3 && head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf;
    const hasUtf16LeBom = head.length >= 2 && head[0] === 0xff && head[1] === 0xfe;
    const hasUtf16BeBom = head.length >= 2 && head[0] === 0xfe && head[1] === 0xff;

    let encoding: 'utf-8' | 'utf-16le' | 'utf-16be' = 'utf-8';
    if (hasUtf16LeBom) encoding = 'utf-16le';
    else if (hasUtf16BeBom) encoding = 'utf-16be';
    else if (hasUtf8Bom) encoding = 'utf-8';
    else {
      // Heuristic: MT4/MT5 reports are often UTF-16. Detect frequent null bytes.
      let zerosEven = 0;
      let zerosOdd = 0;
      for (let i = 0; i < head.length; i++) {
        if (head[i] === 0) {
          if (i % 2 === 0) zerosEven++;
          else zerosOdd++;
        }
      }
      if (zerosOdd > zerosEven * 2 && zerosOdd > 8) encoding = 'utf-16le';
      else if (zerosEven > zerosOdd * 2 && zerosEven > 8) encoding = 'utf-16be';
    }

    const text = new TextDecoder(encoding).decode(bytes).replace(/^\uFEFF/, '');
    return { text, encoding };
  };

  const readText = async (file: File): Promise<string> => {
    try {
      const buffer = await file.arrayBuffer();
      const decoded = decodeText(buffer);
      console.info('[MT Import] decoded file', { name: file.name, size: file.size, encoding: decoded.encoding });
      return decoded.text;
    } catch {
      // Fallback for older browsers
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(String(e.target?.result ?? ''));
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
      });
    }
  };

  const parseNumber = (value: string): number | null => {
    let raw = String(value ?? '').trim();
    if (!raw) return null;

    // Normalize common thousands/decimal separators.
    // Examples: "1,234.56" -> "1234.56", "1.234,56" -> "1234.56", "1234,56" -> "1234.56"
    raw = raw.replace(/\s+/g, '');
    const lastComma = raw.lastIndexOf(',');
    const lastDot = raw.lastIndexOf('.');
    if (lastComma !== -1 && lastDot !== -1) {
      if (lastComma > lastDot) {
        // dot thousands, comma decimal
        raw = raw.replace(/\./g, '').replace(/,/g, '.');
      } else {
        // comma thousands, dot decimal
        raw = raw.replace(/,/g, '');
      }
    } else if (lastComma !== -1 && lastDot === -1) {
      raw = raw.replace(/,/g, '.');
    }

    const cleaned = raw.replace(/[^0-9.+-]/g, '');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const parseMtDateToIsoDate = (value: string): string | null => {
    const raw = value.trim();
    const match = raw.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?/);
    if (match) {
      const year = Number(match[1]);
      const month = String(Number(match[2])).padStart(2, '0');
      const day = String(Number(match[3])).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0] ?? null;
  };

  const normalizeSymbol = (value: string): string => value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

  const mapTradeType = (value: string): TradeType | null => {
    const lower = value.toLowerCase();
    if (lower.includes('sell') || lower.includes('short')) return 'short';
    if (lower.includes('buy') || lower.includes('long')) return 'long';
    return null;
  };

  const buildTrade = (params: {
    ticket?: string;
    date: string;
    symbol: string;
    type: TradeType;
    entry: number;
    exit: number;
    quantity: number;
    profit: number;
    source: string;
  }): TradeInput => {
    const { pnlPercentage } = calculatePnL(params.entry, params.exit, params.quantity, params.type);
    return {
      date: params.date,
      symbol: params.symbol,
      type: params.type,
      entry: params.entry,
      exit: params.exit,
      quantity: params.quantity,
      outcome: determineOutcome(params.profit),
      pnl: params.profit,
      pnlPercentage,
      notes: params.ticket
        ? `${params.source} - Ticket: ${params.ticket}`
        : params.source,
    };
  };

  const parseMtHtml = (text: string): TradeInput[] => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');
    const tables = Array.from(doc.querySelectorAll('table'));

    const getCellText = (cell: Element) =>
      (cell.textContent ?? '').replace(/\u00A0/g, ' ').trim();

    const normalizeHeader = (value: string) =>
      value.trim().toLowerCase().replace(/\s+/g, ' ');

    const findHeaderIndex = (headers: string[], patterns: RegExp[]): number | null => {
      const idx = headers.findIndex((h) => patterns.some((p) => p.test(h)));
      return idx >= 0 ? idx : null;
    };

    for (const table of tables) {
      const rows = Array.from(table.querySelectorAll('tr'));
      for (let headerRowIndex = 0; headerRowIndex < rows.length; headerRowIndex++) {
        const headerCells = Array.from(rows[headerRowIndex].querySelectorAll('th,td')).map(getCellText);
        const headers = headerCells.map(normalizeHeader);
        if (headers.length < 6) continue;

        const hasTicket = headers.some((h) => h.includes('ticket') || h.includes('order') || h.includes('deal'));
        const hasProfit = headers.some((h) => h.includes('profit') || h.includes('p&l') || h.includes('pnl'));
        const hasSymbol = headers.some((h) => h.includes('symbol') || h.includes('item') || h.includes('instrument'));
        if (!hasTicket || !hasProfit || !hasSymbol) continue;

        const idxTicket = findHeaderIndex(headers, [/ticket/, /order/, /deal/]);
        const idxOpenTime = findHeaderIndex(headers, [/open time/, /^time$/]) ?? findHeaderIndex(headers, [/time/]);
        const idxCloseTime = findHeaderIndex(headers, [/close time/, /^close time$/]);
        const idxType = findHeaderIndex(headers, [/type/, /action/, /side/]);
        const idxSize = findHeaderIndex(headers, [/size/, /volume/, /lots?/]);
        const idxSymbol = findHeaderIndex(headers, [/symbol/, /item/, /instrument/]);
        const idxProfit = findHeaderIndex(headers, [/profit/, /p&l/, /pnl/]);

        const priceIdxs = headers
          .map((h, idx) => ({ h, idx }))
          .filter(({ h }) => h.includes('price'))
          .map(({ idx }) => idx);

        const pickOpenClosePriceIdx = (): { openIdx: number | null; closeIdx: number | null } => {
          const openExplicit =
            findHeaderIndex(headers, [/open price/]) ?? findHeaderIndex(headers, [/^open$/]);
          const closeExplicit =
            findHeaderIndex(headers, [/close price/]) ?? findHeaderIndex(headers, [/^close$/]) ?? findHeaderIndex(headers, [/close.*price/]);

          if (openExplicit !== null && closeExplicit !== null) return { openIdx: openExplicit, closeIdx: closeExplicit };

          // MT reports often have two "Price" columns (open + close). Use Close Time as separator if present.
          if (priceIdxs.length >= 2) {
            if (idxCloseTime !== null) {
              const afterCloseTime = priceIdxs.find((i) => i > idxCloseTime) ?? null;
              const beforeCloseTime = [...priceIdxs].reverse().find((i) => i < idxCloseTime) ?? null;
              return { openIdx: beforeCloseTime, closeIdx: afterCloseTime ?? priceIdxs[1] };
            }
            return { openIdx: priceIdxs[0], closeIdx: priceIdxs[1] };
          }

          const anyPrice = findHeaderIndex(headers, [/price/]);
          return { openIdx: anyPrice, closeIdx: anyPrice };
        };

        const { openIdx: idxOpenPrice, closeIdx: idxClosePrice } = pickOpenClosePriceIdx();

        if (
          idxTicket === null ||
          idxType === null ||
          idxSize === null ||
          idxSymbol === null ||
          idxOpenPrice === null ||
          idxClosePrice === null ||
          idxProfit === null
        ) {
          continue;
        }

        const result: TradeInput[] = [];
        for (let i = headerRowIndex + 1; i < rows.length; i++) {
          const cells = Array.from(rows[i].querySelectorAll('td,th')).map(getCellText);
          if (cells.length < headers.length) continue;

          const ticket = cells[idxTicket]?.trim();
          const closeTime = idxCloseTime !== null ? cells[idxCloseTime]?.trim() : '';
          const openTime = idxOpenTime !== null ? cells[idxOpenTime]?.trim() : '';
          const side = cells[idxType]?.trim() ?? '';
          const sizeRaw = cells[idxSize]?.trim() ?? '';
          const symbolRaw = cells[idxSymbol]?.trim() ?? '';
          const openRaw = cells[idxOpenPrice]?.trim() ?? '';
          const closeRaw = cells[idxClosePrice]?.trim() ?? '';
          const profitRaw = cells[idxProfit]?.trim() ?? '';

          if (!ticket || !symbolRaw || !side) continue;
          const type = mapTradeType(side);
          if (!type) continue;

          const quantity = parseNumber(sizeRaw);
          const entry = parseNumber(openRaw);
          const exit = parseNumber(closeRaw);
          const profit = parseNumber(profitRaw);
          if (quantity === null || entry === null || exit === null || profit === null) continue;

          const date = parseMtDateToIsoDate(closeTime || openTime);
          if (!date) continue;

          result.push(
            buildTrade({
              ticket,
              date,
              symbol: normalizeSymbol(symbolRaw),
              type,
              entry,
              exit,
              quantity,
              profit,
              source: 'Imported from MT4/MT5',
            }),
          );
        }

        if (result.length > 0) return result;
      }
    }
    return [];
  };

  type ParsedDeal = {
    positionKey: string;
    time: string;
    symbol: string;
    side: TradeType;
    volume: number;
    price: number;
    profit: number;
    entryType: 'in' | 'out' | 'inout';
  };

  const buildTradesFromDeals = (deals: ParsedDeal[], source: string): TradeInput[] => {
    const byPosition = new Map<string, ParsedDeal[]>();
    for (const deal of deals) {
      if (!deal.positionKey) continue;
      if (!byPosition.has(deal.positionKey)) byPosition.set(deal.positionKey, []);
      byPosition.get(deal.positionKey)!.push(deal);
    }

    const trades: TradeInput[] = [];
    for (const [key, group] of byPosition.entries()) {
      group.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
      const entryDeals = group.filter((d) => d.entryType === 'in' || d.entryType === 'inout');
      const exitDeals = group.filter((d) => d.entryType === 'out' || d.entryType === 'inout');
      if (entryDeals.length === 0 || exitDeals.length === 0) continue;

      const type = entryDeals[0]?.side;
      const entry = weightedAverage(entryDeals.map((d) => ({ price: d.price, volume: d.volume })));
      const exit = weightedAverage(exitDeals.map((d) => ({ price: d.price, volume: d.volume })));
      if (entry === null || exit === null) continue;

      const quantity = entryDeals.reduce((sum, d) => sum + d.volume, 0);
      const pnl = group.reduce((sum, d) => sum + d.profit, 0);
      const lastExitTime = exitDeals[exitDeals.length - 1]?.time;
      const date = parseMtDateToIsoDate(lastExitTime ?? '') ?? new Date().toISOString().split('T')[0]!;

      trades.push(
        buildTrade({
          ticket: key,
          date,
          symbol: entryDeals[0].symbol,
          type,
          entry,
          exit,
          quantity,
          profit: pnl,
          source,
        }),
      );
    }
    return trades;
  };

  const parseMtDealsFromHtml = (text: string): TradeInput[] => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');
    const tables = Array.from(doc.querySelectorAll('table'));

    const getCellText = (cell: Element) => (cell.textContent ?? '').replace(/\u00A0/g, ' ').trim();
    const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
    const findHeaderIndex = (headers: string[], patterns: RegExp[]): number | null => {
      const idx = headers.findIndex((h) => patterns.some((p) => p.test(h)));
      return idx >= 0 ? idx : null;
    };

    for (const table of tables) {
      const rows = Array.from(table.querySelectorAll('tr'));
      for (let headerRowIndex = 0; headerRowIndex < rows.length; headerRowIndex++) {
        const headerCells = Array.from(rows[headerRowIndex].querySelectorAll('th,td')).map(getCellText);
        const headers = headerCells.map(normalizeHeader);
        if (headers.length < 6) continue;

        const hasDealsHint = headers.some((h) => h.includes('deal')) || headers.some((h) => h.includes('position'));
        const hasTime = headers.some((h) => h.includes('time'));
        const hasSymbol = headers.some((h) => h.includes('symbol') || h.includes('item') || h.includes('instrument'));
        const hasType = headers.some((h) => h === 'type' || h.includes('type') || h.includes('side'));
        const hasVolume = headers.some((h) => h.includes('volume') || h.includes('lots') || h.includes('size'));
        const hasPrice = headers.some((h) => h.includes('price'));
        const hasProfit = headers.some((h) => h.includes('profit') || h.includes('p&l') || h.includes('pnl'));
        if (!hasDealsHint || !hasTime || !hasSymbol || !hasType || !hasVolume || !hasPrice || !hasProfit) continue;

        const idxTime = findHeaderIndex(headers, [/^time$/, /time/]);
        const idxType = findHeaderIndex(headers, [/^type$/, /type/, /side/, /action/]);
        const idxSymbol = findHeaderIndex(headers, [/symbol/, /item/, /instrument/]);
        const idxVolume = findHeaderIndex(headers, [/volume/, /lots?/, /size/]);
        const idxPrice = findHeaderIndex(headers, [/^price$/, /price/]);
        const idxProfit = findHeaderIndex(headers, [/profit/, /p&l/, /pnl/]);
        const idxEntry = findHeaderIndex(headers, [/^entry$/, /entry/]);
        const idxPosition = findHeaderIndex(headers, [/position/, /pos id/, /position id/]);
        const idxOrder = findHeaderIndex(headers, [/order/, /^id$/]);
        const idxCommission = findHeaderIndex(headers, [/commission/]);
        const idxSwap = findHeaderIndex(headers, [/swap/]);

        if (
          idxTime === null ||
          idxType === null ||
          idxSymbol === null ||
          idxVolume === null ||
          idxPrice === null ||
          idxProfit === null
        ) {
          continue;
        }

        const deals: ParsedDeal[] = [];
        for (let i = headerRowIndex + 1; i < rows.length; i++) {
          const cells = Array.from(rows[i].querySelectorAll('td,th')).map(getCellText);
          if (cells.length < headers.length) continue;

          const timeRaw = cells[idxTime]?.trim() ?? '';
          const symbolRaw = cells[idxSymbol]?.trim() ?? '';
          const sideRaw = cells[idxType]?.trim() ?? '';
          const volumeRaw = cells[idxVolume]?.trim() ?? '';
          const priceRaw = cells[idxPrice]?.trim() ?? '';
          const profitRaw = cells[idxProfit]?.trim() ?? '';
          const entryRaw = idxEntry !== null ? (cells[idxEntry]?.trim() ?? '') : '';

          if (!timeRaw || !symbolRaw || !sideRaw) continue;
          const side = mapTradeType(sideRaw);
          if (!side) continue;

          const volume = parseNumber(volumeRaw);
          const price = parseNumber(priceRaw);
          const profit = parseNumber(profitRaw);
          if (volume === null || price === null || profit === null) continue;

          const commission = idxCommission !== null ? parseNumber(cells[idxCommission] ?? '') : null;
          const swap = idxSwap !== null ? parseNumber(cells[idxSwap] ?? '') : null;
          const totalProfit = profit + (commission ?? 0) + (swap ?? 0);

          const entryNorm = entryRaw.toLowerCase();
          let entryType: ParsedDeal['entryType'] = 'inout';
          if (entryNorm.includes('in') && !entryNorm.includes('out')) entryType = 'in';
          else if (entryNorm.includes('out') && !entryNorm.includes('in')) entryType = 'out';
          else if (entryNorm.includes('in') && entryNorm.includes('out')) entryType = 'inout';

          const positionKeyRaw =
            (idxPosition !== null ? cells[idxPosition] : null) ?? (idxOrder !== null ? cells[idxOrder] : null) ?? '';
          const positionKey = String(positionKeyRaw ?? '').trim();
          if (!positionKey) continue;

          deals.push({
            positionKey,
            time: timeRaw,
            symbol: normalizeSymbol(symbolRaw),
            side,
            volume,
            price,
            profit: totalProfit,
            entryType,
          });
        }

        const trades = buildTradesFromDeals(deals, 'Imported from MT4/MT5 (Deals)');
        if (trades.length > 0) return trades;
      }
    }

    return [];
  };

  const parseTableDoc = (doc: Document): TradeInput[] => {
    // Reuse HTML table parsing logic by serializing table content into HTML-ish DOM.
    const html = doc.documentElement?.outerHTML ?? '';
    return parseMtHtml(html);
  };

  const parseMtXml = (text: string): TradeInput[] => {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      // Some "Open XML" exports are actually HTML-ish; try HTML parser.
      const fallback = parseMtHtml(text);
      return fallback;
    }

    const getText = (node: Element, selectors: string[]): string | null => {
      for (const sel of selectors) {
        const el = node.querySelector(sel);
        const value = el?.textContent?.trim();
        if (value) return value;
      }
      return null;
    };

    const candidates = Array.from(doc.querySelectorAll('order,trade,deal,position'));
    const nodes = candidates.length > 0 ? candidates : Array.from(doc.querySelectorAll('*'));

    const result: TradeInput[] = [];
    for (const node of nodes) {
      const ticket = getText(node, ['ticket', 'order', 'deal', 'id']);
      const symbolRaw = getText(node, ['symbol', 'item', 'instrument']);
      const sideRaw = getText(node, ['type', 'side', 'action']);
      if (!ticket || !symbolRaw || !sideRaw) continue;

      const type = mapTradeType(sideRaw);
      if (!type) continue;

      const quantity = parseNumber(getText(node, ['volume', 'lots', 'size', 'quantity']) ?? '');
      const entry = parseNumber(getText(node, ['open_price', 'entry', 'openPrice', 'price_open', 'price']) ?? '');
      const exit = parseNumber(getText(node, ['close_price', 'exit', 'closePrice', 'price_close', 'close']) ?? '');
      const profit = parseNumber(getText(node, ['profit', 'pnl', 'pl']) ?? '');
      const timeRaw = getText(node, ['close_time', 'closeTime', 'open_time', 'openTime', 'time']);

      if (quantity === null || entry === null || exit === null || profit === null || !timeRaw) continue;
      const date = parseMtDateToIsoDate(timeRaw);
      if (!date) continue;

      result.push(
        buildTrade({
          ticket,
          date,
          symbol: normalizeSymbol(symbolRaw),
          type,
          entry,
          exit,
          quantity,
          profit,
          source: 'Imported from MT4/MT5',
        }),
      );
    }

    if (result.length > 0) return result;

    // Fallback: XML can also contain table-based reports.
    const tableParsed = parseTableDoc(doc);
    if (tableParsed.length > 0) return tableParsed;

    // Last resort: treat as HTML.
    return parseMtHtml(text);
  };

  const parseMtText = (text: string): TradeInput[] => {
    const lines = text.split('\n');
    const result: TradeInput[] = [];

    let dataStartIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('Ticket') || lines[i].includes('Order') || lines[i].includes('Deal')) {
        dataStartIndex = i + 1;
        break;
      }
    }

    for (let i = dataStartIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(/\t+|\s{2,}/).map((p) => p.trim());
      if (parts.length < 10) continue;

      const ticket = parts[0];
      const openTime = `${parts[1]} ${parts[2] ?? ''}`.trim();
      const side = parts[3] || parts[4] || '';
      const quantity = parseNumber(parts[5] || parts[6] || '');
      const symbolRaw = parts[6] || parts[7] || '';
      const entry = parseNumber(parts[7] || parts[8] || '');
      const exit = parseNumber(parts[9] || parts[10] || '');
      const profit = parseNumber(parts[parts.length - 1] || '');

      const type = mapTradeType(side);
      const date = parseMtDateToIsoDate(openTime);
      if (!type || !date) continue;
      if (quantity === null || entry === null || exit === null || profit === null) continue;
      if (!symbolRaw) continue;

      result.push(
        buildTrade({
          ticket,
          date,
          symbol: normalizeSymbol(symbolRaw),
          type,
          entry,
          exit,
          quantity,
          profit,
          source: 'Imported from MT4/MT5',
        }),
      );
    }

    return result;
  };

  const parseMT4MT5File = async (file: File): Promise<TradeInput[]> => {
    const text = await readText(file);
    const lowerName = file.name.toLowerCase();
    const trimmed = text.trimStart().toLowerCase();

    if (
      lowerName.endsWith('.html') ||
      lowerName.endsWith('.htm') ||
      trimmed.startsWith('<!doctype') ||
      trimmed.startsWith('<html') ||
      trimmed.includes('<table')
    ) {
      const parsed = parseMtHtml(text);
      console.info('[MT Import] html parsed trades', parsed.length);
      if (parsed.length > 0) return parsed;

      const dealsParsed = parseMtDealsFromHtml(text);
      console.info('[MT Import] html deals parsed trades', dealsParsed.length);
      if (dealsParsed.length > 0) return dealsParsed;
    }

    if (lowerName.endsWith('.xml') || trimmed.startsWith('<?xml') || trimmed.startsWith('<report')) {
      const parsed = parseMtXml(text);
      console.info('[MT Import] xml parsed trades', parsed.length);
      if (parsed.length > 0) return parsed;

      const dealsParsed = parseMtDealsFromHtml(text);
      console.info('[MT Import] xml deals parsed trades', dealsParsed.length);
      if (dealsParsed.length > 0) return dealsParsed;
    }

    const parsedText = parseMtText(text);
    console.info('[MT Import] text parsed trades', parsedText.length);
    return parsedText;
  };

  const parseCSVFile = async (file: File): Promise<TradeInput[]> => {
    const text = await readText(file);
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) return [];

    const headerLine = lines[0];
    const delimiters = [',', ';', '\t'] as const;
    const delimiter =
      delimiters
        .map((d) => ({ d, count: (headerLine.match(new RegExp(`\\${d}`, 'g')) ?? []).length }))
        .sort((a, b) => b.count - a.count)[0]?.d ?? ',';

    const splitDelimited = (line: string): string[] => {
      const out: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          const next = line[i + 1];
          if (inQuotes && next === '"') {
            current += '"';
            i++;
            continue;
          }
          inQuotes = !inQuotes;
          continue;
        }
        if (!inQuotes && ch === delimiter) {
          out.push(current.trim());
          current = '';
          continue;
        }
        current += ch;
      }
      out.push(current.trim());
      return out;
    };

    const headers = splitDelimited(headerLine).map((h) => h.trim().toLowerCase());
    const dateIdx = headers.findIndex((h) => h.includes('date') || h.includes('time'));
    const symbolIdx = headers.findIndex((h) => h.includes('symbol') || h.includes('instrument'));
    const typeIdx = headers.findIndex((h) => h.includes('type') || h.includes('side'));
    const entryIdx = headers.findIndex((h) => h.includes('entry') || h.includes('open'));
    const exitIdx = headers.findIndex((h) => h.includes('exit') || h.includes('close'));
    const sizeIdx = headers.findIndex((h) => h.includes('size') || h.includes('volume') || h.includes('quantity'));
    const profitIdx = headers.findIndex((h) => h.includes('profit') || h.includes('p&l') || h.includes('pnl'));

    const result: TradeInput[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = splitDelimited(line);

      const dateRaw = parts[dateIdx] ?? '';
      const symbolRaw = parts[symbolIdx] ?? '';
      const typeRaw = parts[typeIdx] ?? '';
      const entry = parseNumber(parts[entryIdx] ?? '');
      const exit = parseNumber(parts[exitIdx] ?? '');
      const quantity = parseNumber(parts[sizeIdx] ?? '');
      const profit = profitIdx >= 0 ? parseNumber(parts[profitIdx] ?? '') : null;

      const type = mapTradeType(typeRaw);
      const parsedDate = parseMtDateToIsoDate(dateRaw);
      const date =
        parsedDate ??
        (() => {
          if (!dateRaw) return null;
          const d = new Date(dateRaw);
          if (Number.isNaN(d.getTime())) return null;
          return d.toISOString().split('T')[0] ?? null;
        })();
      if (!type || !date) continue;
      if (!symbolRaw || entry === null || exit === null || quantity === null) continue;

      const { pnl } = calculatePnL(entry, exit, quantity, type);
      const actualPnL = profit !== null ? profit : pnl;

      result.push(
        buildTrade({
          date,
          symbol: normalizeSymbol(symbolRaw),
          type,
          entry,
          exit,
          quantity,
          profit: actualPnL,
          source: 'Imported from CSV',
        }),
      );
    }

    return result;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, format: 'mt' | 'csv') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);

    try {
      let trades: TradeInput[] = [];
      
      if (format === 'mt') {
        trades = await parseMT4MT5File(file);
      } else {
        trades = await parseCSVFile(file);
      }

      if (trades.length === 0) {
        toast.error('No valid trades found in file. Please check the format.');
        return;
      }

      const result = await createTrades(trades);
      if (!result.ok) {
        toast.error(result.message);
        onOpenChange(false);

        if (result.reason === 'trade_limit' || result.reason === 'trial_expired') {
          window.dispatchEvent(new Event('open-subscription-dialog'));
        }
        return;
      }
      
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
                accept=".htm,.html,.xml,.txt"
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
