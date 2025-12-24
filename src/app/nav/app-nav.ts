import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, BookOpen, BarChart3, CreditCard } from 'lucide-react';
import type { Page } from '../App';

export type AppNavItem = {
  id: Page;
  label: string;
  icon: LucideIcon;
};

export const appNavItems: AppNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'journal', label: 'Journal', icon: BookOpen },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'billing', label: 'Billing', icon: CreditCard },
];
