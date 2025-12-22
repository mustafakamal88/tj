import { useState, useEffect } from 'react';
import { Navigation } from './components/navigation';
import { HomePage } from './components/home-page';
import { Dashboard } from './components/dashboard';
import { TradeJournal } from './components/trade-journal';
import { Analytics } from './components/analytics';
import { LearnMorePage } from './components/learn-more-page';
import { BillingPage } from './components/billing-page';
import { AuthDialog } from './components/auth-dialog';
import { SubscriptionDialog } from './components/subscription-dialog';
import { ThemeProvider } from './components/theme-provider';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import { getSupabaseClient } from './utils/supabase';
import { ensureProfile } from './utils/profile';
import { ProfileProvider } from './utils/use-profile';
import { AuthProvider, useAuth } from './utils/auth';

export type Page = 'home' | 'dashboard' | 'journal' | 'analytics' | 'learn' | 'billing';

function AppContent() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
  const [authDialogDefaultTab, setAuthDialogDefaultTab] = useState<'login' | 'signup'>('login');
  const [isSubscriptionDialogOpen, setIsSubscriptionDialogOpen] = useState(false);
  const { user, loading: authLoading, signOut } = useAuth();
  const userEmail = user?.email ?? null;

  const openAuthDialog = (tab: 'login' | 'signup' = 'login') => {
    setAuthDialogDefaultTab(tab);
    setIsAuthDialogOpen(true);
  };

  const handleAuthDialogOpenChange = (open: boolean) => {
    setIsAuthDialogOpen(open);
    if (!open) setAuthDialogDefaultTab('login');
  };

  const setRoute = (page: Page, opts?: { replace?: boolean }) => {
    setCurrentPage(page);
    const path =
      page === 'home' ? '/' :
      page === 'dashboard' ? '/dashboard' :
      page === 'journal' ? '/journal' :
      page === 'analytics' ? '/analytics' :
      page === 'learn' ? '/learn' :
      '/billing';
    const url = new URL(window.location.href);
    url.pathname = path;
    if (opts?.replace) window.history.replaceState({}, '', url.toString());
    else window.history.pushState({}, '', url.toString());
  };

  useEffect(() => {
    // Initial route based on path (important for Stripe redirect to /billing).
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    const pageFromPath: Page =
      path === '/dashboard' ? 'dashboard' :
      path === '/journal' ? 'journal' :
      path === '/analytics' ? 'analytics' :
      path === '/learn' ? 'learn' :
      path === '/billing' ? 'billing' :
      'home';
    setCurrentPage(pageFromPath);

    const onPop = () => {
      const p = window.location.pathname.replace(/\/+$/, '') || '/';
      const next: Page =
        p === '/dashboard' ? 'dashboard' :
        p === '/journal' ? 'journal' :
        p === '/analytics' ? 'analytics' :
        p === '/learn' ? 'learn' :
        p === '/billing' ? 'billing' :
        'home';
      setCurrentPage(next);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!userEmail) return;
    if (isAuthDialogOpen) setIsAuthDialogOpen(false);
    if (currentPage === 'home') setRoute('dashboard', { replace: true });
  }, [authLoading, userEmail, isAuthDialogOpen, currentPage]);

  useEffect(() => {
    // When auth resolves, ensure profile row exists.
    if (!user) return;
    void (async () => {
      const ok = await ensureProfile(user);
      if (!ok) {
        toast.error('Profile setup failed. Apply the Supabase schema/policies, then reload.');
      }
    })();
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (user) return;
    setCurrentPage('home');
  }, [authLoading, user]);

  useEffect(() => {
    const openSubscription = () => setIsSubscriptionDialogOpen(true);
    window.addEventListener('open-subscription-dialog', openSubscription as EventListener);
    return () =>
      window.removeEventListener('open-subscription-dialog', openSubscription as EventListener);
  }, []);

  useEffect(() => {
    const openBilling = () => setRoute('billing');
    window.addEventListener('open-billing', openBilling as EventListener);
    return () => window.removeEventListener('open-billing', openBilling as EventListener);
  }, []);

  // Protected route logic
  const handleNavigate = (page: Page) => {
    // Check if trying to access protected routes
    if ((page === 'dashboard' || page === 'journal' || page === 'analytics' || page === 'billing') && !userEmail) {
      toast.error('Please login to access this page');
      openAuthDialog('login');
      return;
    }
    setRoute(page);
  };

  const renderPage = () => {
    // Redirect to home if not logged in and trying to access protected routes
    if ((currentPage === 'dashboard' || currentPage === 'journal' || currentPage === 'analytics' || currentPage === 'billing') && !userEmail) {
      return <HomePage onGetStarted={() => openAuthDialog('signup')} onLearnMore={() => setCurrentPage('learn')} />;
    }

    switch (currentPage) {
      case 'home':
        return <HomePage onGetStarted={() => userEmail ? setCurrentPage('dashboard') : openAuthDialog('signup')} onLearnMore={() => setCurrentPage('learn')} />;
      case 'dashboard':
        return <Dashboard />;
      case 'journal':
        return <TradeJournal />;
      case 'analytics':
        return <Analytics />;
      case 'learn':
        return <LearnMorePage />;
      case 'billing':
        return <BillingPage />;
      default:
        return <HomePage onGetStarted={() => userEmail ? setCurrentPage('dashboard') : openAuthDialog('signup')} onLearnMore={() => setCurrentPage('learn')} />;
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      toast.success('Logged out successfully');
      setRoute('home', { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Logout failed');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation
        currentPage={currentPage}
        onNavigate={handleNavigate}
        user={userEmail}
        onAuthClick={openAuthDialog}
        onLogout={handleLogout}
        onSubscriptionClick={() => setIsSubscriptionDialogOpen(true)}
        onBillingClick={() => handleNavigate('billing')}
      />
      {renderPage()}
      <AuthDialog
        open={isAuthDialogOpen}
        onOpenChange={handleAuthDialogOpenChange}
        defaultTab={authDialogDefaultTab}
      />
      <SubscriptionDialog
        open={isSubscriptionDialogOpen}
        onOpenChange={setIsSubscriptionDialogOpen}
      />
      <Toaster />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="trade-journal-theme">
      <AuthProvider>
        <ProfileProvider>
          <AppContent />
        </ProfileProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
