import type { LucideIcon } from 'lucide-react';
import {
  CalendarDays,
  LayoutDashboard,
  BookOpen,
  BarChart3,
  GraduationCap,
  Users,
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
    label: 'Main',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'calendar', label: 'Calendar', icon: CalendarDays },
      { id: 'journal', label: 'Journal', icon: BookOpen },
      { id: 'analytics', label: 'Analytics', icon: BarChart3 },
      { id: 'settings', label: 'Settings', icon: Settings },
    ],
  },
  {
    label: 'Learn',
    items: [
      { id: 'university', label: 'University', icon: GraduationCap },
      { id: 'community', label: 'Community', icon: Users },
    ],
  },
];
