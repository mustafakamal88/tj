import { useState, useEffect } from 'react';
import { Navigation } from './components/navigation';
import { HomePage } from './components/home-page';
import { Dashboard } from './components/dashboard';
import { TradeJournal } from './components/trade-journal';
import { Analytics } from './components/analytics';
import { LearnMorePage } from './components/learn-more-page';
import { AuthDialog } from './components/auth-dialog';
import { SubscriptionDialog } from './components/subscription-dialog';
import { ThemeProvider } from './components/theme-provider';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
<<<<<<< HEAD
=======
import { getSupabaseClient } from './utils/supabase';
import { ensureProfile, getMyProfile } from './utils/profile';
>>>>>>> f8d36ea (Initial commit)

export type Page = 'home' | 'dashboard' | 'journal' | 'analytics' | 'learn';

function AppContent() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [user, setUser] = useState<string | null>(null);
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
  const [isSubscriptionDialogOpen, setIsSubscriptionDialogOpen] = useState(false);

<<<<<<< HEAD
  // Load user from localStorage on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('trade-journal-user');
    if (savedUser) {
      setUser(savedUser);
    }
=======
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    let active = true;

    const syncProfileToLocalCache = async () => {
      const profile = await getMyProfile();
      if (!profile) return;
      localStorage.setItem('user-subscription', profile.subscriptionPlan);
      localStorage.setItem('user-trial-start', profile.trialStartAt);
    };

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!active) return;
        const sessionUser = data.session?.user ?? null;
        setUser(sessionUser?.email ?? null);

        if (sessionUser) {
          await ensureProfile(sessionUser);
          await syncProfileToLocalCache();
        }
      })
      .catch(() => {
        // handled via toasts in the UI when user attempts auth actions
      });

    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      const sessionUser = session?.user ?? null;
      setUser(sessionUser?.email ?? null);

      if (sessionUser) {
        await ensureProfile(sessionUser);
        await syncProfileToLocalCache();

        if (event === 'SIGNED_IN') {
          toast.success('Welcome back!');
          setCurrentPage('dashboard');
        }
      } else {
        localStorage.removeItem('user-subscription');
        localStorage.removeItem('user-trial-start');
        setCurrentPage('home');
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const openSubscription = () => setIsSubscriptionDialogOpen(true);
    window.addEventListener('open-subscription-dialog', openSubscription as EventListener);
    return () =>
      window.removeEventListener('open-subscription-dialog', openSubscription as EventListener);
>>>>>>> f8d36ea (Initial commit)
  }, []);

  // Protected route logic
  const handleNavigate = (page: Page) => {
    // Check if trying to access protected routes
    if ((page === 'dashboard' || page === 'journal' || page === 'analytics') && !user) {
      toast.error('Please login to access this page');
      setIsAuthDialogOpen(true);
      return;
    }
    setCurrentPage(page);
  };

  const renderPage = () => {
    // Redirect to home if not logged in and trying to access protected routes
    if ((currentPage === 'dashboard' || currentPage === 'journal' || currentPage === 'analytics') && !user) {
      return <HomePage onGetStarted={() => setIsAuthDialogOpen(true)} onLearnMore={() => setCurrentPage('learn')} />;
    }

    switch (currentPage) {
      case 'home':
        return <HomePage onGetStarted={() => user ? setCurrentPage('dashboard') : setIsAuthDialogOpen(true)} onLearnMore={() => setCurrentPage('learn')} />;
      case 'dashboard':
        return <Dashboard />;
      case 'journal':
        return <TradeJournal />;
      case 'analytics':
        return <Analytics />;
      case 'learn':
        return <LearnMorePage />;
      default:
        return <HomePage onGetStarted={() => user ? setCurrentPage('dashboard') : setIsAuthDialogOpen(true)} onLearnMore={() => setCurrentPage('learn')} />;
    }
  };

<<<<<<< HEAD
  const handleAuthSuccess = (email: string) => {
    setUser(email);
    localStorage.setItem('trade-journal-user', email);
    toast.success('Welcome back!');
    // Auto navigate to dashboard after login
    setCurrentPage('dashboard');
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('trade-journal-user');
    setCurrentPage('home');
=======
  const handleLogout = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setUser(null);
      setCurrentPage('home');
      toast.success('Logged out successfully');
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error(error.message);
      return;
    }

    // onAuthStateChange will also run; keep this message simple.
>>>>>>> f8d36ea (Initial commit)
    toast.success('Logged out successfully');
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation
        currentPage={currentPage}
        onNavigate={handleNavigate}
        user={user}
        onAuthClick={() => setIsAuthDialogOpen(true)}
        onLogout={handleLogout}
        onSubscriptionClick={() => setIsSubscriptionDialogOpen(true)}
      />
      {renderPage()}
      <AuthDialog
        open={isAuthDialogOpen}
        onOpenChange={setIsAuthDialogOpen}
<<<<<<< HEAD
        onAuthSuccess={handleAuthSuccess}
=======
>>>>>>> f8d36ea (Initial commit)
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
      <AppContent />
    </ThemeProvider>
  );
<<<<<<< HEAD
}
=======
}
>>>>>>> f8d36ea (Initial commit)
