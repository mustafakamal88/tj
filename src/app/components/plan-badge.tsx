import { Badge } from './ui/badge';
import { useProfile } from '../utils/use-profile';

export function PlanBadge({ className }: { className?: string }) {
  const { plan, isActive, loading } = useProfile();

  if (loading) {
    return (
      <Badge variant="secondary" className={className}>
        Loading…
      </Badge>
    );
  }

  const isPaidActive = isActive && (plan === 'pro' || plan === 'premium');
  const label = isPaidActive ? `Current: ${plan.toUpperCase()}` : 'Current: FREE';

  return (
    <Badge
      variant="secondary"
      className={isPaidActive ? `bg-[#34a85a] text-white border-transparent ${className ?? ''}`.trim() : className}
    >
      {label}
    </Badge>
  );
}
