import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  BookOpen,
  BarChart3,
  GraduationCap,
  Users,
  History,
  CreditCard,
  Settings,
} from 'lucide-react';
import type { Page } from '../App';

export type AppNavItem = {
  id: Page;
  label: string;
  icon: LucideIcon;
};

export type AppNavGroup = {
  label: string;
  items: AppNavItem[];
};

export const appNavGroups: AppNavGroup[] = [
  {
    label: 'Tradespace',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'journal', label: 'Journal', icon: BookOpen },
      { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'Learning',
    items: [{ id: 'university', label: 'University', icon: GraduationCap }],
  },
  {
    label: 'Community',
    items: [{ id: 'community', label: 'Community', icon: Users }],
  },
  {
    label: 'Account',
    items: [
      { id: 'importHistory', label: 'Import History', icon: History },
      { id: 'billing', label: 'Billing', icon: CreditCard },
      { id: 'settings', label: 'Settings', icon: Settings },
    ],
  },
];
