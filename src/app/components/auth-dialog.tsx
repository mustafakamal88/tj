import { useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { toast } from 'sonner';
import { getSupabaseClient } from '../utils/supabase';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthDialog({ open, onOpenChange }: AuthDialogProps) {
  const supabase = getSupabaseClient();

  useEffect(() => {
    if (!open) return;
    if (!supabase) {
      toast.error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
    }
  }, [open, supabase]);

  const redirectTo = useMemo(() => {
    // Needed for magic links/OAuth providers; safe for email/password too.
    return window.location.origin;
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Welcome to TradeJournal</DialogTitle>
          <DialogDescription>
            Login or create an account to start tracking your trades
          </DialogDescription>
        </DialogHeader>
        {supabase ? (
          <div className="mt-2">
            <Auth
              supabaseClient={supabase}
              providers={[]}
              redirectTo={redirectTo}
              appearance={{
                theme: ThemeSupa,
                variables: {
                  default: {
                    colors: {
                      brand: '#34a85a',
                      brandAccent: '#2d9450',
                      inputBackground: 'transparent',
                    },
                  },
                },
              }}
              theme="dark"
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
