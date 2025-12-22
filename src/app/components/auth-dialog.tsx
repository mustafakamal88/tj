import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { getSupabaseClient } from '../utils/supabase';

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthDialog({ open, onOpenChange }: AuthDialogProps) {
  const supabase = getSupabaseClient();
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [submitting, setSubmitting] = useState(false);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (!open) return;
    if (!supabase) {
      toast.error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
    }
    // Reset sensitive fields when the dialog is opened.
    setLoginPassword('');
    setSignupPassword('');
    setConfirmPassword('');
  }, [open, supabase]);

  const redirectTo = useMemo(() => {
    // Needed for magic links/OAuth providers; safe for email/password too.
    return window.location.origin;
  }, []);

  const handleLogin = async () => {
    if (!supabase) return;
    if (!loginEmail.trim() || !loginPassword) {
      toast.error('Email and password are required.');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });
      if (error) throw error;
      toast.success('Welcome back!');
      onOpenChange(false);
    } catch (e) {
      console.error('[auth] login failed', e);
      toast.error(e instanceof Error ? e.message : 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignup = async () => {
    if (!supabase) return;

    const email = signupEmail.trim();
    const fn = firstName.trim();
    const ln = lastName.trim();

    if (!fn || !ln || !email || !signupPassword || !confirmPassword) {
      toast.error('First name, last name, email, and password are required.');
      return;
    }
    if (signupPassword !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const fullName = `${fn} ${ln}`.trim();
      const { data, error } = await supabase.auth.signUp({
        email,
        password: signupPassword,
        options: {
          emailRedirectTo: redirectTo,
          data: {
            first_name: fn,
            last_name: ln,
            full_name: fullName,
          },
        },
      });
      if (error) throw error;

      if (data.session) {
        toast.success('Account created.');
        onOpenChange(false);
        return;
      }

      toast.success('Account created. Check your email to confirm, then login.');
      setTab('login');
    } catch (e) {
      console.error('[auth] signup failed', e);
      toast.error(e instanceof Error ? e.message : 'Signup failed.');
    } finally {
      setSubmitting(false);
    }
  };

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
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'login' | 'signup')} className="mt-2">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login_email">Email</Label>
                <Input
                  id="login_email"
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login_password">Password</Label>
                <Input
                  id="login_password"
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <Button className="w-full bg-[#34a85a] hover:bg-[#2d9450]" disabled={submitting} onClick={() => void handleLogin()}>
                {submitting ? 'Logging in…' : 'Login'}
              </Button>
            </TabsContent>

            <TabsContent value="signup" className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="first_name">First Name</Label>
                  <Input
                    id="first_name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoComplete="given-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Last Name</Label>
                  <Input
                    id="last_name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    autoComplete="family-name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup_email">Email</Label>
                <Input
                  id="signup_email"
                  type="email"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup_password">Password</Label>
                <Input
                  id="signup_password"
                  type="password"
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm_password">Confirm Password</Label>
                <Input
                  id="confirm_password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>

              <Button
                className="w-full bg-[#34a85a] hover:bg-[#2d9450]"
                disabled={submitting}
                onClick={() => void handleSignup()}
              >
                {submitting ? 'Creating account…' : 'Sign Up'}
              </Button>
              <p className="text-xs text-muted-foreground">
                By signing up you agree to keep your credentials private.
              </p>
            </TabsContent>
          </Tabs>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
