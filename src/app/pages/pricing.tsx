import { useEffect } from 'react';
import { HomePage } from '../components/home-page';

type Props = {
  onGetStarted: () => void;
  onLearnMore: () => void;
};

export function PricingPage({ onGetStarted, onLearnMore }: Props) {
  useEffect(() => {
    const id = 'pricing';
    const el = document.getElementById(id);
    if (!el) return;
    requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
  }, []);

  return <HomePage onGetStarted={onGetStarted} onLearnMore={onLearnMore} />;
}
