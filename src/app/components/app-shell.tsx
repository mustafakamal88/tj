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
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-3 py-4 space-y-6">
        {appNavGroups.map((group) => (
          <div key={group.label}>
            <div className="px-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
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
                      'relative w-full justify-start gap-2.5 text-sm',
                      active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-primary transition-opacity',
                        active ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <Icon className="size-[18px]" />
                    {item.label}
                  </Button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-auto border-t px-3 py-3">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            onNavigate('learn');
            onItemClick?.();
          }}
          className="w-full justify-start gap-2.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <AlertCircle className="size-[18px]" />
          Learn More
        </Button>
      </div>
    </div>
  );

  return (
    <div className="bg-background">
      <div className="flex min-h-[calc(100vh-4rem)]">
        <aside className="hidden md:flex w-60 border-r bg-background">
          <SidebarNav />
        </aside>

        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>

      <Sheet open={mobileSidebarOpen} onOpenChange={onMobileSidebarOpenChange}>
        <SheetContent side="left" className="w-60 p-0 [&>button]:hidden">
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
