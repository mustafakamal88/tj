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

export type Page = 'home' | 'dashboard' | 'journal' | 'analytics' | 'learn';

function AppContent() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [user, setUser] = useState<string | null>(null);
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
  const [isSubscriptionDialogOpen, setIsSubscriptionDialogOpen] = useState(false);

  // Load user from localStorage on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('trade-journal-user');
    if (savedUser) {
      setUser(savedUser);
    }
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
        onAuthSuccess={handleAuthSuccess}
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
}