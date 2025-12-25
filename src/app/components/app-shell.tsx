import type { Page } from '../App';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './ui/sheet';
import { cn } from './ui/utils';
import { appNavGroups } from '../nav/app-nav';
import { AlertCircle } from 'lucide-react';
import { useEffect } from 'react';

type AppShellProps = {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  mobileSidebarOpen: boolean;
  onMobileSidebarOpenChange: (open: boolean) => void;
  children: React.ReactNode;
};

export function AppShell({
  currentPage,
  onNavigate,
  mobileSidebarOpen,
  onMobileSidebarOpenChange,
  children,
}: AppShellProps) {
  useEffect(() => {
    onMobileSidebarOpenChange(false);
  }, [currentPage, onMobileSidebarOpenChange]);

  const SidebarNav = ({ onItemClick }: { onItemClick?: () => void }) => (
    <div className="flex h-full min-h-0 flex-col py-2 text-foreground dark:text-white">
      {/* Brand */}
      <div className="px-4 pt-2 pb-2">
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className={cn(
            'group flex w-full h-14 items-center gap-3 rounded-xl px-3 text-left transition-colors',
            'hover:bg-muted/40 dark:hover:bg-white/5',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          )}
        >
          {/* Logo */}
          <div
            className={cn(
              'flex size-10 items-center justify-center rounded-lg border shadow-sm',
              'bg-white border-border text-foreground',
              'dark:bg-neutral-950 dark:border-white/10 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
            )}
          >
            <span className="text-[13px] font-bold tracking-tight">
              <span className="text-[#34a85a]">T</span>J
            </span>
          </div>

          {/* Name */}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold leading-5 tracking-tight text-foreground dark:text-white">
              Trade Journal
            </div>
            <div className="truncate text-[12px] leading-4 text-muted-foreground dark:text-white/60">App</div>
          </div>

          {/* Optional chevron / affordance */}
          <div className="text-muted-foreground/70 opacity-0 transition-opacity group-hover:opacity-100 dark:text-white/50">
            ›
          </div>
        </button>
      </div>

      <div className="mx-4 mb-2 h-px bg-border dark:bg-white/10" />

      <div className="px-4 pt-2 pb-4">
        {appNavGroups.map((group, groupIndex) => (
          <div key={group.label} className={cn(groupIndex === 0 ? 'mt-0' : 'mt-7')}>
            <div className="px-3 text-xs font-medium tracking-wide text-muted-foreground/80 dark:text-white/50">
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
                      'relative h-11 w-full justify-start gap-3 rounded-lg px-3 text-[13px] transition-colors box-border',
                      active
                        ? 'bg-muted/60 text-foreground font-medium border border-border shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] dark:bg-white/10 dark:text-white dark:border-white/10 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                        : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground dark:text-white/80 dark:hover:bg-white/5 dark:hover:text-white',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute left-0 top-2.5 bottom-2.5 w-[2px] rounded-r bg-[#34a85a] transition-opacity',
                        active ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <Icon
                      className={cn(
                        'size-[18px] shrink-0',
                        active ? 'text-foreground dark:text-white' : 'text-muted-foreground/70 dark:text-white/55',
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

      <div className="mt-auto border-t border-border dark:border-white/10 px-4 py-3">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            onNavigate('learn');
            onItemClick?.();
          }}
          className="h-11 w-full justify-start gap-3 rounded-lg px-3 text-[13px] text-muted-foreground hover:bg-muted/40 hover:text-foreground dark:text-white/80 dark:hover:bg-white/5 dark:hover:text-white"
        >
          <AlertCircle className="size-[18px] shrink-0 text-muted-foreground/70 dark:text-white/55" />
          <span className="truncate">Learn More</span>
        </Button>
      </div>
    </div>
  );

  return (
    <div className="bg-background">
      <div className="flex min-h-[calc(100vh-4rem)]">
        <aside
          className={cn(
            'hidden md:flex w-60',
            'border-r',
            'bg-white text-foreground border-border shadow-sm',
            'dark:bg-neutral-950 dark:text-white dark:border-white/10',
            'dark:bg-gradient-to-b dark:from-neutral-950 dark:to-neutral-900/60',
            'dark:shadow-[inset_-1px_0_0_rgba(255,255,255,0.06)]',
          )}
        >
          <SidebarNav />
        </aside>

        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>

      <Sheet open={mobileSidebarOpen} onOpenChange={onMobileSidebarOpenChange}>
        <SheetContent
          side="left"
          className={cn(
            'w-60 p-0 [&>button]:hidden',
            'border-r',
            'bg-white text-foreground border-border shadow-sm',
            'dark:bg-neutral-950 dark:text-white dark:border-white/10',
            'dark:bg-gradient-to-b dark:from-neutral-950 dark:to-neutral-900/60',
            'dark:shadow-[inset_-1px_0_0_rgba(255,255,255,0.06)]',
          )}
        >
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
