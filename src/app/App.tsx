import { useEffect, useRef, useState } from 'react';
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
import { Seo } from './components/seo';
import { CommunityPage } from './pages/community';
import { ImportHistoryPage } from './pages/import-history';
import { SettingsPage } from './pages/settings';
import { CalendarPage } from './pages/calendar';
import { UniversityPage } from './pages/university';
import { UniversityLessonPage } from './pages/university/lesson';
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
  | 'calendar'
  | 'journal'
  | 'analytics'
  | 'learn'
  | 'billing'
  | 'university'
  | 'community'
  | 'importHistory'
  | 'settings';

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
  const prevUserEmailRef = useRef<string | null>(null);

  const isProtectedPage = (page: Page) => {
    return (
      page === 'dashboard' ||
      page === 'calendar' ||
      page === 'journal' ||
      page === 'analytics' ||
      page === 'billing' ||
      page === 'university' ||
      page === 'community' ||
      page === 'importHistory' ||
      page === 'settings'
    );
  };

  const cleanPathname = (p: string) => p.replace(/\/+$/, '') || '/';

  const isKnownPath = (p: string) => {
    const cleaned = cleanPathname(p);
    if (cleaned === '/') return true;
    if (cleaned === '/features') return true;
    if (cleaned === '/brokers') return true;
    if (cleaned === '/pricing') return true;
    if (cleaned === '/login') return true;
    if (cleaned === '/signup') return true;
    if (cleaned === '/dashboard') return true;
    if (cleaned === '/calendar') return true;
    if (cleaned === '/journal') return true;
    if (cleaned === '/analytics') return true;
    if (cleaned === '/learn') return true;
    if (cleaned === '/billing') return true;
    if (cleaned === '/community') return true;
    if (cleaned === '/import-history') return true;
    if (cleaned === '/settings') return true;
    if (cleaned === '/university' || cleaned.startsWith('/university/')) return true;
    if (cleaned.startsWith('/settings/')) return true;
    return false;
  };

  const parseUniversityLessonPath = (p: string) => {
    const cleaned = cleanPathname(p);
    if (!cleaned.startsWith('/university/')) return null;
    const parts = cleaned.split('/').filter(Boolean);
    // parts: ['university', stageId, lessonId]
    if (parts.length !== 3) return null;
    const [, stageId, lessonId] = parts;
    if (!stageId || !lessonId) return null;
    return { stageId, lessonId };
  };

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
      page === 'calendar' ? '/calendar' :
      page === 'journal' ? '/journal' :
      page === 'analytics' ? '/analytics' :
      page === 'learn' ? '/learn' :
      page === 'billing' ? '/billing' :
      page === 'university' ? '/university' :
      page === 'community' ? '/community' :
      page === 'importHistory' ? '/import-history' :
      '/settings';
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
      path === '/calendar' ? 'calendar' :
      path === '/journal' ? 'journal' :
      path === '/analytics' ? 'analytics' :
      path === '/learn' ? 'learn' :
      path === '/billing' ? 'billing' :
      (path === '/university' || path.startsWith('/university/')) ? 'university' :
      path === '/community' ? 'community' :
      path === '/import-history' ? 'importHistory' :
      path === '/settings' ? 'settings' :
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
        p === '/calendar' ? 'calendar' :
        p === '/journal' ? 'journal' :
        p === '/analytics' ? 'analytics' :
        p === '/learn' ? 'learn' :
        p === '/billing' ? 'billing' :
        (p === '/university' || p.startsWith('/university/')) ? 'university' :
        p === '/community' ? 'community' :
        p === '/import-history' ? 'importHistory' :
        p === '/settings' ? 'settings' :
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
  }, [authLoading, userEmail, isAuthDialogOpen, currentPage]);

  useEffect(() => {
    if (authLoading) return;

    const prevEmail = prevUserEmailRef.current;
    if (!prevEmail && userEmail) {
      // Successful login: ensure the app state + URL are explicitly on dashboard
      // so the sidebar active pill is correct.
      if (isAuthDialogOpen) setIsAuthDialogOpen(false);
      setRoute('dashboard', { replace: true });
    }

    prevUserEmailRef.current = userEmail;
  }, [authLoading, userEmail, isAuthDialogOpen]);

  useEffect(() => {
    if (authLoading) return;

    // If authenticated, auth pages are always redirected to dashboard.
    if (userEmail && (currentPage === 'login' || currentPage === 'signup')) {
      setRoute('dashboard', { replace: true });
      return;
    }

    // If not authenticated, protected pages redirect to login.
    if (!userEmail && isProtectedPage(currentPage)) {
      setRoute('login', { replace: true });
    }
  }, [authLoading, userEmail, currentPage]);

  useEffect(() => {
    if (authLoading) return;
    if (!userEmail) return;

    const p = cleanPathname(window.location.pathname);

    // Logged-in users should not land on an empty/unknown route.
    if (p === '/') {
      setRoute('dashboard', { replace: true });
      return;
    }

    if (!isKnownPath(p)) {
      setRoute('dashboard', { replace: true });
    }
  }, [authLoading, userEmail]);

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
    if (isProtectedPage(currentPage)) {
      setRoute('login', { replace: true });
    }
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
      setRoute('login');
      return;
    }
    setRoute(page);
  };

  const renderPage = () => {
    const wrapApp = (node: React.ReactNode) => (
      <AppShell
        currentPage={currentPage}
        pathname={pathname}
        onNavigate={handleNavigate}
        user={userEmail}
        onLogout={handleLogout}
        onBillingClick={() => handleNavigate('billing')}
        mobileSidebarOpen={mobileAppSidebarOpen}
        onMobileSidebarOpenChange={setMobileAppSidebarOpen}
      >
        {node}
      </AppShell>
    );

    switch (currentPage) {
      case 'home':
        return (
          <>
            <Seo title="Trader Journal" />
            <HomePage
              onGetStarted={() => userEmail ? setRoute('dashboard') : openAuthDialog('signup')}
              onLearnMore={() => setRoute('learn')}
            />
          </>
        );
      case 'features':
        return (
          <>
            <Seo title="Features" />
            <FeaturesPage
              onGetStarted={() => userEmail ? setRoute('dashboard') : openAuthDialog('signup')}
              onLearnMore={() => setRoute('learn')}
            />
          </>
        );
      case 'brokers':
        return (
          <>
            <Seo title="Brokers" />
            <BrokersPage
              onGetStarted={() => userEmail ? setRoute('dashboard') : openAuthDialog('signup')}
              onLearnMore={() => setRoute('learn')}
            />
          </>
        );
      case 'pricing':
        return (
          <>
            <Seo title="Pricing" />
            <PricingPage
              onGetStarted={() => userEmail ? setRoute('dashboard') : openAuthDialog('signup')}
              onLearnMore={() => setRoute('learn')}
            />
          </>
        );
      case 'login':
        return (
          <>
            <Seo title="Log In" noindex />
            <LoginPage onOpenAuth={() => openAuthDialog('login')} onHome={() => setRoute('home')} />
          </>
        );
      case 'signup':
        return (
          <>
            <Seo title="Sign Up" noindex />
            <SignupPage onOpenAuth={() => openAuthDialog('signup')} onHome={() => setRoute('home')} />
          </>
        );
      case 'dashboard':
        return wrapApp(
          <>
            <Seo title="Dashboard" noindex />
            <ErrorBoundary title="Dashboard crashed" description="Refresh the page and try opening the day drawer again.">
              <Dashboard />
            </ErrorBoundary>
          </>
        );
      case 'calendar':
        return wrapApp(
          <>
            <Seo title="Calendar" noindex />
            <ErrorBoundary title="Calendar crashed" description="Refresh the page and try again.">
              <CalendarPage />
            </ErrorBoundary>
          </>
        );
      case 'journal':
        return wrapApp(
          <>
            <Seo title="Journal" noindex />
            <JournalPage />
          </>
        );
      case 'analytics':
        return wrapApp(
          <>
            <Seo title="Analytics" noindex />
            <Analytics />
          </>
        );
      case 'learn':
        return (
          <>
            <Seo title="Learn More" />
            <LearnMorePage />
          </>
        );
      case 'billing':
        return wrapApp(
          <>
            <Seo title="Billing" noindex />
            <BillingPage />
          </>
        );
      case 'university':
        const universityLesson = parseUniversityLessonPath(pathname);
        return wrapApp(
          <>
            <Seo title="University" noindex />
            {universityLesson ? (
              <UniversityLessonPage stageId={universityLesson.stageId} lessonId={universityLesson.lessonId} />
            ) : (
              <UniversityPage />
            )}
          </>
        );
      case 'community':
        return wrapApp(
          <>
            <Seo title="Community" noindex />
            <CommunityPage />
          </>
        );
      case 'importHistory':
        return wrapApp(
          <>
            <Seo title="Import History" noindex />
            <ImportHistoryPage />
          </>
        );
      case 'settings':
        return wrapApp(
          <>
            <Seo title="Settings" noindex />
            <SettingsPage onConnectBroker={() => handleNavigate('brokers')} onImport={() => handleNavigate('importHistory')} />
          </>
        );
      default:
        return (
          <>
            <Seo title="Trader Journal" />
            <HomePage
              onGetStarted={() => userEmail ? setRoute('dashboard') : openAuthDialog('signup')}
              onLearnMore={() => setRoute('learn')}
            />
          </>
        );
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
