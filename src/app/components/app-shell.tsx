import type { Page } from '../App';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './ui/sheet';
import { cn } from './ui/utils';
import { appNavGroups } from '../nav/app-nav';
import { AlertCircle, LogOut, Receipt, User } from 'lucide-react';
import { useEffect } from 'react';
import svgPaths from '../../imports/svg-4h62f17bbh';
import { ThemeToggle } from './theme-toggle';
import { PlanBadge } from './plan-badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

type AppShellProps = {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  user: string | null;
  onLogout: () => void;
  onBillingClick: () => void;
  mobileSidebarOpen: boolean;
  onMobileSidebarOpenChange: (open: boolean) => void;
  children: React.ReactNode;
};

export function AppShell({
  currentPage,
  onNavigate,
  user,
  onLogout,
  onBillingClick,
  mobileSidebarOpen,
  onMobileSidebarOpenChange,
  children,
}: AppShellProps) {
  useEffect(() => {
    onMobileSidebarOpenChange(false);
  }, [currentPage, onMobileSidebarOpenChange]);

  const SidebarNav = ({ onItemClick }: { onItemClick?: () => void }) => (
    <div className="flex h-full min-h-0 flex-col text-sidebar-foreground">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="h-14 flex items-center px-4">
          <button
            type="button"
            onClick={() => {
              onNavigate('dashboard');
              onItemClick?.();
            }}
            className={cn(
              'group h-10 inline-flex w-full items-center gap-3 rounded-xl px-2.5 text-left transition-colors',
              'hover:bg-muted/40',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            )}
            aria-label="Go to dashboard"
          >
            <div className="size-10 grid place-items-center shrink-0 text-primary">
              <svg
                className="block size-9"
                viewBox="0 0 37 44"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path d={svgPaths.p20226f80} fill="currentColor" />
              </svg>
            </div>

            <div className="min-w-0 flex-1 flex flex-col justify-center">
              <div className="truncate text-sm font-semibold leading-none tracking-tight text-foreground">
                Trade Journal
              </div>
            </div>
          </button>
        </div>

        {/* Desktop utilities row */}
        <div className="h-10 px-4 flex items-center justify-end">
          <div className="hidden md:flex justify-end w-full">
            <div className="min-w-[140px] max-w-[140px]">
              <div className="flex w-full items-center overflow-hidden whitespace-nowrap rounded-lg border border-border/40 bg-muted/20">
                <div className="flex items-center px-2 h-8">
                  <ThemeToggle />
                </div>
                <div className="flex items-center justify-center px-2 h-8 border-l border-border/40 flex-1 min-w-0">
                  <PlanBadge />
                </div>
                <div className="flex items-center justify-center px-2 h-8 border-l border-border/40">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-md p-0 inline-flex items-center justify-center shrink-0 bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        disabled={!user}
                        aria-label="Open profile menu"
                      >
                        <User className="size-5" strokeWidth={2.25} />
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
        </div>
      </div>

      {/* Nav */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-3">
        {appNavGroups.map((group, groupIndex) => (
          <div key={group.label} className={cn(groupIndex === 0 ? 'mt-0' : 'mt-5')}>
            <div className="px-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {group.label}
            </div>

            <div className="mt-2 space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = currentPage === item.id;

                return (
                  <Button
                    key={item.id}
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      onNavigate(item.id);
                      onItemClick?.();
                    }}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative h-10 w-full px-3 rounded-xl flex items-center gap-3 text-sm font-medium transition-colors',
                      active
                        ? cn(
                            'bg-muted/50 text-foreground',
                          )
                        : cn(
                            'text-muted-foreground',
                            'hover:bg-muted/40 dark:hover:bg-white/5 hover:text-foreground',
                          ),
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute left-0 top-2 bottom-2 w-[2px] rounded-full bg-primary/50 transition-opacity',
                        active ? 'opacity-100' : 'opacity-0',
                      )}
                    />

                    <Icon
                      className={cn(
                        'size-5 shrink-0',
                        active ? 'text-foreground' : 'text-muted-foreground/70',
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                  </Button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-border dark:border-white/10 px-4 py-3">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            onNavigate('learn');
            onItemClick?.();
          }}
          className={cn(
            'h-11 w-full justify-start gap-3 rounded-xl px-3 text-[13px]',
            'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
          )}
        >
          <AlertCircle className="size-[18px] shrink-0 text-muted-foreground/70" />
          <span className="truncate">Get in touch</span>
        </Button>
      </div>
    </div>
  );

  const sidebarSurface = cn(
    'border-r',
    'bg-sidebar text-sidebar-foreground border-sidebar-border',
  );

  return (
    <div className="bg-background">
      <div className="flex min-h-[calc(100vh-3.5rem)] md:min-h-screen">
        <aside className={cn('hidden md:flex w-60', sidebarSurface)}>
          <SidebarNav />
        </aside>

        <main className="flex-1 min-w-0">{children}</main>
      </div>

      <Sheet open={mobileSidebarOpen} onOpenChange={onMobileSidebarOpenChange}>
        <SheetContent side="left" className={cn('w-60 p-0 [&>button]:hidden', sidebarSurface)}>
          <SheetHeader className="sr-only">
            <SheetTitle>Sidebar</SheetTitle>
            <SheetDescription>Navigate the app</SheetDescription>
          </SheetHeader>
          <SidebarNav onItemClick={() => onMobileSidebarOpenChange(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
