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
    <div className="flex h-full min-h-0 flex-col text-foreground dark:text-white">
      <div className="px-3 pt-4 pb-3 border-b border-border dark:border-white/10">
        <button
          type="button"
          className="w-full flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/40 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          onClick={() => {
            onNavigate('dashboard');
            onItemClick?.();
          }}
          aria-label="Go to dashboard"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-foreground text-background text-xs font-semibold">
            TJ
          </div>
          <div className="min-w-0 text-left">
            <div className="text-sm font-semibold leading-none truncate">Trade Journal</div>
            <div className="mt-0.5 text-xs text-muted-foreground dark:text-white/60 truncate">App</div>
          </div>
        </button>
      </div>

      <div className="px-3 pt-4 pb-4">
        {appNavGroups.map((group, groupIndex) => (
          <div key={group.label} className={cn(groupIndex === 0 ? 'mt-0' : 'mt-7')}>
            <div className="pl-3 pr-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground dark:text-white/50">
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
                      'relative h-10 w-full justify-start gap-3 rounded-md pl-3 pr-2 text-[13px] transition-colors box-border',
                      active
                        ? 'bg-muted/60 text-foreground font-medium border border-border dark:bg-white/10 dark:text-white dark:border-white/10 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                        : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground dark:text-white/80 dark:hover:bg-white/5 dark:hover:text-white',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute left-1 top-2 bottom-2 w-1 rounded-r bg-[#34a85a] transition-opacity',
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

      <div className="mt-auto border-t border-border dark:border-white/10 px-3 py-3">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            onNavigate('learn');
            onItemClick?.();
          }}
          className="h-10 w-full justify-start gap-3 rounded-md pl-3 pr-2 text-[13px] text-muted-foreground hover:bg-muted/40 hover:text-foreground dark:text-white/80 dark:hover:bg-white/5 dark:hover:text-white"
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
        <aside className="hidden md:flex w-60 border-r bg-white text-foreground border-border dark:bg-neutral-950 dark:text-white dark:border-white/10 dark:bg-gradient-to-b dark:from-neutral-950 dark:to-neutral-900/60 dark:shadow-[inset_-1px_0_0_rgba(255,255,255,0.06)]">
          <SidebarNav />
        </aside>

        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>

      <Sheet open={mobileSidebarOpen} onOpenChange={onMobileSidebarOpenChange}>
        <SheetContent
          side="left"
          className="w-60 p-0 bg-white text-foreground border-r border-border dark:bg-neutral-950 dark:text-white dark:border-white/10 dark:bg-gradient-to-b dark:from-neutral-950 dark:to-neutral-900/60 dark:shadow-[inset_-1px_0_0_rgba(255,255,255,0.06)] [&>button]:hidden"
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
