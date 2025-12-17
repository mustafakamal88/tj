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
import { ensureProfile, getMyProfile } from './utils/profile';
import { ProfileProvider } from './utils/use-profile';
import { AuthProvider, useAuth } from './utils/auth';

export type Page = 'home' | 'dashboard' | 'journal' | 'analytics' | 'learn' | 'billing';

function AppContent() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
  const [isSubscriptionDialogOpen, setIsSubscriptionDialogOpen] = useState(false);
  const { user, loading: authLoading, signOut } = useAuth();
  const userEmail = user?.email ?? null;

  useEffect(() => {
    if (authLoading) return;
    if (!userEmail) return;
    if (isAuthDialogOpen) setIsAuthDialogOpen(false);
    if (currentPage === 'home') setCurrentPage('dashboard');
  }, [authLoading, userEmail, isAuthDialogOpen, currentPage]);

  useEffect(() => {
    const syncProfileToLocalCache = async () => {
      const profile = await getMyProfile();
      if (!profile) return;
      localStorage.setItem('user-subscription', profile.subscriptionPlan);
      localStorage.setItem('user-trial-start', profile.trialStartAt);
    };

    // When auth resolves, ensure profile row exists and sync cached values (used by some MVP gating).
    if (!user) return;
    void (async () => {
      const ok = await ensureProfile(user);
      if (!ok) {
        toast.error('Profile setup failed. Apply the Supabase schema/policies, then reload.');
      }
      await syncProfileToLocalCache();
    })();
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (user) return;
    localStorage.removeItem('user-subscription');
    localStorage.removeItem('user-trial-start');
    setCurrentPage('home');
  }, [authLoading, user]);

  useEffect(() => {
    const openSubscription = () => setIsSubscriptionDialogOpen(true);
    window.addEventListener('open-subscription-dialog', openSubscription as EventListener);
    return () =>
      window.removeEventListener('open-subscription-dialog', openSubscription as EventListener);
  }, []);

  useEffect(() => {
    const openBilling = () => setCurrentPage('billing');
    window.addEventListener('open-billing', openBilling as EventListener);
    return () => window.removeEventListener('open-billing', openBilling as EventListener);
  }, []);

  // Protected route logic
  const handleNavigate = (page: Page) => {
    // Check if trying to access protected routes
    if ((page === 'dashboard' || page === 'journal' || page === 'analytics' || page === 'billing') && !userEmail) {
      toast.error('Please login to access this page');
      setIsAuthDialogOpen(true);
      return;
    }
    setCurrentPage(page);
  };

  const renderPage = () => {
    // Redirect to home if not logged in and trying to access protected routes
    if ((currentPage === 'dashboard' || currentPage === 'journal' || currentPage === 'analytics') && !userEmail) {
      return <HomePage onGetStarted={() => setIsAuthDialogOpen(true)} onLearnMore={() => setCurrentPage('learn')} />;
    }

    switch (currentPage) {
      case 'home':
        return <HomePage onGetStarted={() => userEmail ? setCurrentPage('dashboard') : setIsAuthDialogOpen(true)} onLearnMore={() => setCurrentPage('learn')} />;
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
        return <HomePage onGetStarted={() => userEmail ? setCurrentPage('dashboard') : setIsAuthDialogOpen(true)} onLearnMore={() => setCurrentPage('learn')} />;
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      toast.success('Logged out successfully');
      setCurrentPage('home');
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
        onAuthClick={() => setIsAuthDialogOpen(true)}
        onLogout={handleLogout}
        onSubscriptionClick={() => setIsSubscriptionDialogOpen(true)}
        onBillingClick={() => setCurrentPage('billing')}
      />
      {renderPage()}
      <AuthDialog
        open={isAuthDialogOpen}
        onOpenChange={setIsAuthDialogOpen}
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
