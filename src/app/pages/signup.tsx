import { useEffect } from 'react';
import { HomePage } from '../components/home-page';

type Props = {
  onOpenAuth: () => void;
  onHome: () => void;
};

export function SignupPage({ onOpenAuth, onHome }: Props) {
  useEffect(() => {
    onOpenAuth();
  }, [onOpenAuth]);

  return <HomePage onGetStarted={onOpenAuth} onLearnMore={onHome} />;
}
