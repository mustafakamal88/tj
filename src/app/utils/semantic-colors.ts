export const semanticColors = {
  profitText: 'text-emerald-600 dark:text-emerald-400',
  lossText: 'text-rose-600 dark:text-rose-400',
  neutralText: 'text-muted-foreground',

  profitBgSoft: 'bg-emerald-600/5 dark:bg-emerald-500/10',
  lossBgSoft: 'bg-rose-600/5 dark:bg-rose-500/10',

  // Useful for thin accent bars and small swatches.
  profitBar: 'bg-emerald-600/60 dark:bg-emerald-500/50',
  lossBar: 'bg-rose-600/60 dark:bg-rose-500/50',

  longChipClasses: 'border border-emerald-600/20 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400',
  shortChipClasses: 'border border-rose-600/20 bg-rose-600/10 text-rose-700 dark:text-rose-400',

  winChipClasses: 'border border-emerald-600/20 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400',
  lossChipClasses: 'border border-rose-600/20 bg-rose-600/10 text-rose-700 dark:text-rose-400',
};

export function pnlTextClass(pnl: number | null | undefined): string {
  if (typeof pnl !== 'number') return semanticColors.neutralText;
  if (pnl > 0) return semanticColors.profitText;
  if (pnl < 0) return semanticColors.lossText;
  return semanticColors.neutralText;
}

export function pnlBgSoftClass(pnl: number | null | undefined): string {
  if (typeof pnl !== 'number') return '';
  if (pnl > 0) return semanticColors.profitBgSoft;
  if (pnl < 0) return semanticColors.lossBgSoft;
  return '';
}
