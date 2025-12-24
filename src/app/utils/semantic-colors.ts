export const semanticColors = {
  profitText: 'text-green-600 dark:text-green-500',
  lossText: 'text-red-600 dark:text-red-500',
  neutralText: 'text-muted-foreground',

  profitBgSoft: 'bg-green-600/5 dark:bg-green-500/10',
  lossBgSoft: 'bg-red-600/5 dark:bg-red-500/10',

  // Useful for thin accent bars and small swatches.
  profitBar: 'bg-green-600/60 dark:bg-green-500/50',
  lossBar: 'bg-red-600/60 dark:bg-red-500/50',

  longChipClasses: 'border border-green-600/20 bg-green-600/10 text-green-700 dark:text-green-400',
  shortChipClasses: 'border border-red-600/20 bg-red-600/10 text-red-700 dark:text-red-400',

  winChipClasses: 'border border-green-600/20 bg-green-600/10 text-green-700 dark:text-green-400',
  lossChipClasses: 'border border-red-600/20 bg-red-600/10 text-red-700 dark:text-red-400',
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
