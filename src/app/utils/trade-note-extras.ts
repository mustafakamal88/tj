export function parseTradeNoteExtras(extraNotes?: string): { emotionsText: string; mistakesText: string } {
  const raw = (extraNotes || '').trim();
  if (!raw) return { emotionsText: '', mistakesText: '' };

  const emoMatch = raw.match(/## Emotions\n([\s\S]*?)(?=\n## Mistakes\n|$)/);
  const misMatch = raw.match(/## Mistakes\n([\s\S]*?)$/);

  return {
    emotionsText: (emoMatch?.[1] ?? '').trim(),
    mistakesText: (misMatch?.[1] ?? '').trim(),
  };
}

export function buildTradeNoteExtras(input: { emotionsText: string; mistakesText: string }): string | undefined {
  const e = (input.emotionsText || '').trim();
  const m = (input.mistakesText || '').trim();
  if (!e && !m) return undefined;
  const parts: string[] = [];
  if (e) parts.push(['## Emotions', e].join('\n'));
  if (m) parts.push(['## Mistakes', m].join('\n'));
  return parts.join('\n\n');
}
