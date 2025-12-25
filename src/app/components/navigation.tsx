import { BadgeDollarSign, CreditCard, Globe, LogOut, Menu, Receipt, Sparkles, TrendingUp, User, X } from 'lucide-react';
import { Button } from './ui/button';
import { useEffect, useMemo, useState } from 'react';
import type { Page } from '../App';
import { ThemeToggle } from './theme-toggle';
import { PlanBadge } from './plan-badge';
import svgPaths from '../../imports/svg-4h62f17bbh';
import { cn } from './ui/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

interface NavigationProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  user: string | null;
  onAuthClick: (tab?: 'login' | 'signup') => void;
  onLogout: () => void;
  onSubscriptionClick: () => void;
  onBillingClick: () => void;
  appSidebarOpen?: boolean;
  onAppSidebarOpenChange?: (open: boolean) => void;
}

export function Navigation({
  currentPage,
  onNavigate,
  user,
  onAuthClick,
  onLogout,
  onSubscriptionClick,
  onBillingClick,
  appSidebarOpen,
  onAppSidebarOpenChange,
}: NavigationProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isAppRoute =
    currentPage === 'dashboard' ||
    currentPage === 'journal' ||
    currentPage === 'analytics' ||
    currentPage === 'billing' ||
    currentPage === 'university' ||
    currentPage === 'community' ||
    currentPage === 'importHistory' ||
    currentPage === 'settings';

  const showAppTopbar = Boolean(user) || isAppRoute;

  const publicNavItems = useMemo(
    () => [
      { id: 'home' as Page, label: 'Home', icon: TrendingUp },
      { id: 'features' as Page, label: 'Features', icon: Sparkles },
      { id: 'brokers' as Page, label: 'Supported Brokers', icon: Globe },
      { id: 'pricing' as Page, label: 'Pricing', icon: BadgeDollarSign },
    ],
    [],
  );

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [currentPage]);

  const Logo = (
    <button
      type="button"
      className="flex items-center gap-2 cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      onClick={() => onNavigate(showAppTopbar ? 'dashboard' : 'home')}
      aria-label={showAppTopbar ? 'Go to dashboard' : 'Go to home'}
    >
      <svg
        className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 text-[#34a85a] block"
        viewBox="0 0 37 44"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path d={svgPaths.p20226f80} fill="currentColor" />
      </svg>
      <span className="hidden sm:block text-base md:text-lg font-semibold leading-none tracking-tight text-foreground whitespace-nowrap">
        <span className="text-foreground">Trade</span>{' '}
        <span className="text-[#34a85a]">Journal</span>
      </span>
    </button>
  );

  if (showAppTopbar) {
    return (
      <nav className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50 dark:border-white/10">
        <div className="h-14 grid grid-cols-[1fr_auto] md:grid-cols-[15rem_1fr] items-center">
          <div className={cn('px-4 sm:px-6 md:px-4 flex items-center', isAppRoute ? 'md:px-0' : null)}>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex md:hidden">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 hover:bg-muted/40 dark:hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-[#34a85a]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  onClick={() => onAppSidebarOpenChange?.(!Boolean(appSidebarOpen))}
                  aria-expanded={Boolean(appSidebarOpen)}
                  aria-label={Boolean(appSidebarOpen) ? 'Close sidebar' : 'Open sidebar'}
                  disabled={!isAppRoute}
                >
                  {Boolean(appSidebarOpen) ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </Button>
              </div>
              {!isAppRoute ? Logo : null}
            </div>
          </div>

          <div className="px-4 sm:px-6 lg:px-8 flex items-center justify-end min-w-0 md:border-l md:border-border/60">
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <div className="flex items-center justify-center shrink-0">
                <ThemeToggle />
              </div>

              <div aria-hidden="true" className="hidden sm:block h-5 w-px bg-foreground/10 shrink-0" />

              <div className="flex items-center shrink-0 min-w-0">
                <PlanBadge className="max-w-[92px] sm:max-w-[120px]" />
              </div>

              <div aria-hidden="true" className="hidden sm:block h-5 w-px bg-foreground/10 shrink-0" />

              <div className="flex items-center shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 hover:bg-muted/40 dark:hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-[#34a85a]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      disabled={!user}
                      aria-label="Open profile menu"
                    >
                      <User className="w-5 h-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>
                      <div className="flex flex-col">
                        <span>My Account</span>
                        <span className="text-xs font-normal text-muted-foreground">{user ?? 'Not signed in'}</span>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onNavigate('settings')} disabled={!user}>
                      <User className="w-4 h-4 mr-2" />
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onBillingClick} disabled={!user}>
                      <Receipt className="w-4 h-4 mr-2" />
                      Billing
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onLogout} disabled={!user}>
                      <LogOut className="w-4 h-4 mr-2" />
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50 dark:border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {Logo}

          <div className="hidden md:flex items-center gap-1">
            {publicNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              return (
                <Button
                  key={item.id}
                  variant="ghost"
                  size="sm"
                  onClick={() => onNavigate(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`gap-2 ${
                    isActive
                      ? 'bg-[#34a85a] hover:bg-[#2d9450] text-white'
                      : 'text-foreground/80 hover:text-foreground'
                  }`}
                >
                  <Icon className="w-4 h-4 hidden lg:block" />
                  {item.label}
                </Button>
              );
            })}
          </div>

          <div className="hidden md:flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" onClick={() => onAuthClick()}>
              Log in
            </Button>
            <Button onClick={() => onAuthClick('signup')} className="bg-[#34a85a] hover:bg-[#2d9450]">
              Get started
            </Button>
          </div>

          <div className="flex md:hidden items-center gap-2">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 sm:h-10 sm:w-10 hover:bg-muted/40 dark:hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-[#34a85a]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-expanded={mobileMenuOpen}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t">
            <div className="flex flex-col gap-2">
              {publicNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentPage === item.id;
                return (
                  <Button
                    key={item.id}
                    variant="ghost"
                    onClick={() => {
                      onNavigate(item.id);
                      setMobileMenuOpen(false);
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    className={`gap-2 justify-start ${
                      isActive
                        ? 'bg-[#34a85a] hover:bg-[#2d9450] text-white'
                        : 'text-foreground/80 hover:text-foreground'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Button>
                );
              })}

              <div className="border-t mt-2 pt-2">
                <div className="grid grid-cols-1 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      onAuthClick();
                      setMobileMenuOpen(false);
                    }}
                    className="w-full"
                  >
                    Log in
                  </Button>
                  <Button
                    onClick={() => {
                      onAuthClick('signup');
                      setMobileMenuOpen(false);
                    }}
                    className="w-full bg-[#34a85a] hover:bg-[#2d9450]"
                  >
                    Get started
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
