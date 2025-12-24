import { useState, useEffect } from 'react';
import { Navigation } from './components/navigation';
import { HomePage } from './components/home-page';
import { Dashboard } from './components/dashboard';
import { JournalPage } from './pages/journal';
import { Analytics } from './components/analytics';
import { LearnMorePage } from './components/learn-more-page';
import { BillingPage } from './components/billing-page';
import { FeaturesPage } from './pages/features';
import { BrokersPage } from './pages/brokers';
import { PricingPage } from './pages/pricing';
import { LoginPage } from './pages/login';
import { SignupPage } from './pages/signup';
import { AppShell } from './components/app-shell';
import { ErrorBoundary } from './components/error-boundary';
import { AuthDialog } from './components/auth-dialog';
import { SubscriptionDialog } from './components/subscription-dialog';
import { OnboardingDialog } from './components/onboarding-dialog';
import { MetaApiImportRunner } from './components/metaapi-import-runner';
import { ThemeProvider } from './components/theme-provider';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import { getSupabaseClient } from './utils/supabase';
import { ensureProfile } from './utils/profile';
import { ProfileProvider, useProfile } from './utils/use-profile';
import { AuthProvider, useAuth } from './utils/auth';

export type Page =
  | 'home'
  | 'features'
  | 'brokers'
  | 'pricing'
  | 'login'
  | 'signup'
  | 'dashboard'
  | 'journal'
  | 'analytics'
  | 'learn'
  | 'billing';

function AppContent() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [mobileAppSidebarOpen, setMobileAppSidebarOpen] = useState(false);
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
  const [authDialogDefaultTab, setAuthDialogDefaultTab] = useState<'login' | 'signup'>('login');
  const [isSubscriptionDialogOpen, setIsSubscriptionDialogOpen] = useState(false);
  const { user, loading: authLoading, signOut } = useAuth();
  const { profile, loading: profileLoading, refresh: refreshProfile } = useProfile();
  const userEmail = user?.email ?? null;

  const isProtectedPage = (page: Page) => {
    return page === 'dashboard' || page === 'journal' || page === 'analytics' || page === 'billing';
  };

  const cleanPathname = (p: string) => p.replace(/\/+$/, '') || '/';

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
      page === 'features' ? '/features' :
      page === 'brokers' ? '/brokers' :
      page === 'pricing' ? '/pricing' :
      page === 'login' ? '/login' :
      page === 'signup' ? '/signup' :
      page === 'dashboard' ? '/dashboard' :
      page === 'journal' ? '/journal' :
      page === 'analytics' ? '/analytics' :
      page === 'learn' ? '/learn' :
      '/billing';
    const url = new URL(window.location.href);
    url.pathname = path;
    if (opts?.replace) window.history.replaceState({}, '', url.toString());
    else window.history.pushState({}, '', url.toString());
    setPathname(url.pathname);
  };

  useEffect(() => {
    // Initial route based on path (important for Stripe redirect to /billing).
    const path = cleanPathname(window.location.pathname);
    setPathname(path);
    const pageFromPath: Page =
      path === '/features' ? 'features' :
      path === '/brokers' ? 'brokers' :
      path === '/pricing' ? 'pricing' :
      path === '/login' ? 'login' :
      path === '/signup' ? 'signup' :
      path === '/dashboard' ? 'dashboard' :
      path === '/journal' ? 'journal' :
      path === '/analytics' ? 'analytics' :
      path === '/learn' ? 'learn' :
      path === '/billing' ? 'billing' :
      'home';
    setCurrentPage(pageFromPath);

    const onPop = () => {
      const p = cleanPathname(window.location.pathname);
      setPathname(p);
      const next: Page =
        p === '/features' ? 'features' :
        p === '/brokers' ? 'brokers' :
        p === '/pricing' ? 'pricing' :
        p === '/login' ? 'login' :
        p === '/signup' ? 'signup' :
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
    setMobileAppSidebarOpen(false);
  }, [pathname]);

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
        return;
      }
      await refreshProfile();
    })();
  }, [user, refreshProfile]);

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
    if (isProtectedPage(page) && !userEmail) {
      toast.error('Please login to access this page');
      openAuthDialog('login');
      return;
    }
    setRoute(page);
  };

  const renderPage = () => {
    // Redirect to home if not logged in and trying to access protected routes
    if (isProtectedPage(currentPage) && !userEmail) {
      return <HomePage onGetStarted={() => openAuthDialog('signup')} onLearnMore={() => setCurrentPage('learn')} />;
    }

    const wrapApp = (node: React.ReactNode) => (
      <AppShell
        currentPage={currentPage}
        onNavigate={handleNavigate}
        mobileSidebarOpen={mobileAppSidebarOpen}
        onMobileSidebarOpenChange={setMobileAppSidebarOpen}
      >
        {node}
      </AppShell>
    );

    switch (currentPage) {
      case 'home':
        return <HomePage onGetStarted={() => userEmail ? setCurrentPage('dashboard') : openAuthDialog('signup')} onLearnMore={() => setCurrentPage('learn')} />;
      case 'features':
        return <FeaturesPage onGetStarted={() => userEmail ? setCurrentPage('dashboard') : openAuthDialog('signup')} onLearnMore={() => setCurrentPage('learn')} />;
      case 'brokers':
        return <BrokersPage onGetStarted={() => userEmail ? setCurrentPage('dashboard') : openAuthDialog('signup')} onLearnMore={() => setCurrentPage('learn')} />;
      case 'pricing':
        return <PricingPage onGetStarted={() => userEmail ? setCurrentPage('dashboard') : openAuthDialog('signup')} onLearnMore={() => setCurrentPage('learn')} />;
      case 'login':
        return <LoginPage onOpenAuth={() => openAuthDialog('login')} onHome={() => setCurrentPage('home')} />;
      case 'signup':
        return <SignupPage onOpenAuth={() => openAuthDialog('signup')} onHome={() => setCurrentPage('home')} />;
      case 'dashboard':
        return wrapApp(
          <ErrorBoundary title="Dashboard crashed" description="Refresh the page and try opening the day drawer again.">
            <Dashboard />
          </ErrorBoundary>
        );
      case 'journal':
        return wrapApp(<JournalPage />);
      case 'analytics':
        return wrapApp(<Analytics />);
      case 'learn':
        return <LearnMorePage />;
      case 'billing':
        return wrapApp(<BillingPage />);
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
        appSidebarOpen={mobileAppSidebarOpen}
        onAppSidebarOpenChange={setMobileAppSidebarOpen}
      />
      {renderPage()}
      <AuthDialog
        open={isAuthDialogOpen}
        onOpenChange={handleAuthDialogOpenChange}
        defaultTab={authDialogDefaultTab}
      />
      <MetaApiImportRunner />
      <OnboardingDialog
        open={Boolean(user && !authLoading && !profileLoading && profile && !profile.onboardingCompletedAt)}
        userId={user?.id ?? ''}
        onCompleted={() => void refreshProfile()}
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
