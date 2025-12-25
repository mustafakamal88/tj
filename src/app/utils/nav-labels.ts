import type { Page } from '../App';
import { appNavGroups } from '../nav/app-nav';

type NavLabelMeta = {
  sectionLabel: string;
  currentLabel: string;
  pageId: Page;
};

const cleanPathname = (p: string) => p.replace(/\/+$/, '') || '/';

const pageFromPathname = (pathname: string): Page | null => {
  const p = cleanPathname(pathname);
  if (p === '/' || p === '/dashboard') return 'dashboard';
  if (p === '/calendar') return 'calendar';
  if (p === '/journal') return 'journal';
  if (p === '/analytics') return 'analytics';
  if (p === '/billing') return 'billing';
  if (p === '/community') return 'community';
  if (p === '/import-history') return 'importHistory';
  if (p === '/settings' || p.startsWith('/settings/')) return 'settings';
  if (p === '/university' || p.startsWith('/university/')) return 'university';
  return null;
};

const buildMetaByPage = () => {
  const map = new Map<Page, { sectionLabel: string; currentLabel: string }>();
  for (const group of appNavGroups) {
    for (const item of group.items) {
      map.set(item.id, { sectionLabel: group.label, currentLabel: item.label });
    }
  }
  return map;
};

const metaByPage = buildMetaByPage();

export function getNavLabelMeta(input: { pathname: string; currentPage?: Page }): NavLabelMeta {
  const byPath = pageFromPathname(input.pathname);
  const pageId = byPath ?? input.currentPage ?? 'dashboard';

  const meta = metaByPage.get(pageId);
  if (meta) return { pageId, ...meta };

  // Fallback: keep UI stable even if a new page is added.
  return { pageId, sectionLabel: 'Tradespace', currentLabel: 'Dashboard' };
}
