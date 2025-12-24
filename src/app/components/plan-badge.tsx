import { Badge } from './ui/badge';
import { useProfile } from '../utils/use-profile';
import { hasPaidEntitlement } from '../utils/entitlements';

export function PlanBadge({ className }: { className?: string }) {
  const { profile, loading } = useProfile();

  const stableClass = `min-w-[140px] justify-center ${className ?? ''}`.trim();

  if (loading || !profile) {
    return (
      <Badge variant="secondary" className={stableClass}>
        Loading…
      </Badge>
    );
  }

  const isPaid = hasPaidEntitlement(profile);
  const label = isPaid ? profile.subscriptionPlan.toUpperCase() : 'FREE';

  return (
    <Badge
      variant="secondary"
      className={
        isPaid
          ? `bg-[#34a85a] text-white border-transparent ${stableClass}`.trim()
          : stableClass
      }
    >
      {label}
    </Badge>
  );
}
