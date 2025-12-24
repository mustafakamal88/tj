import { useEffect } from 'react';
import { HomePage } from '../components/home-page';

type Props = {
  onGetStarted: () => void;
  onLearnMore: () => void;
};

export function FeaturesPage({ onGetStarted, onLearnMore }: Props) {
  useEffect(() => {
    const id = 'features';
    const el = document.getElementById(id);
    if (!el) return;
    requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
  }, []);

  return <HomePage onGetStarted={onGetStarted} onLearnMore={onLearnMore} />;
}
