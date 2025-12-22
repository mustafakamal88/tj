import { Badge } from './ui/badge';
import { useProfile } from '../utils/use-profile';
import { hasPaidEntitlement } from '../utils/entitlements';

export function PlanBadge({ className }: { className?: string }) {
  const { profile, loading } = useProfile();

  if (loading || !profile) {
    return (
      <Badge variant="secondary" className={className}>
        Loading…
      </Badge>
    );
  }

  const isPaid = hasPaidEntitlement(profile);
  const label = isPaid ? `Current: ${profile.subscriptionPlan.toUpperCase()}` : 'Current: FREE';

  return (
    <Badge
      variant="secondary"
      className={isPaid ? `bg-[#34a85a] text-white border-transparent ${className ?? ''}`.trim() : className}
    >
      {label}
    </Badge>
  );
}
