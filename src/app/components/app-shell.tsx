import { useMemo, useState } from 'react';
import { LayoutDashboard, BookOpen, BarChart3 } from 'lucide-react';
import type { Page } from '../App';
import { cn } from './ui/utils';
import { Button } from './ui/button';
import { Sheet, SheetContent } from './ui/sheet';
import { Navigation } from './navigation';

type AppShellProps = {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  user: string | null;
  onAuthClick: (tab?: 'login' | 'signup') => void;
  onLogout: () => void;
  onSubscriptionClick: () => void;
  onBillingClick: () => void;
  children: React.ReactNode;
};

export function AppShell({
  currentPage,
  onNavigate,
  user,
  onAuthClick,
  onLogout,
  onSubscriptionClick,
  onBillingClick,
  children,
}: AppShellProps) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const items = useMemo(
    () => [
      { id: 'dashboard' as Page, label: 'Dashboard', icon: LayoutDashboard },
      { id: 'journal' as Page, label: 'Journal', icon: BookOpen },
      { id: 'analytics' as Page, label: 'Analytics', icon: BarChart3 },
    ],
    [],
  );

  const SidebarNav = ({ onItemClick }: { onItemClick?: () => void }) => (
    <div className="flex h-full flex-col">
      <div className="px-4 py-4">
        <div className="text-xs font-semibold tracking-wide text-muted-foreground">Control Panel</div>
      </div>
      <div className="px-2 pb-4">
        <div className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <Button
                key={item.id}
                type="button"
                variant="ghost"
                onClick={() => {
                  onNavigate(item.id);
                  onItemClick?.();
                }}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'w-full justify-start gap-2',
                  isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <Navigation
        currentPage={currentPage}
        onNavigate={onNavigate}
        user={user}
        onAuthClick={onAuthClick}
        onLogout={onLogout}
        onSubscriptionClick={onSubscriptionClick}
        onBillingClick={onBillingClick}
        appShell
        onOpenSidebar={() => setMobileSidebarOpen(true)}
      />

      <div className="flex min-h-[calc(100vh-4rem)]">
        <aside className="hidden md:flex w-60 border-r bg-background">
          <SidebarNav />
        </aside>

        <main className="flex-1 min-w-0">{children}</main>
      </div>

      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent side="left" className="p-0">
          <div className="h-full">
            <SidebarNav onItemClick={() => setMobileSidebarOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
