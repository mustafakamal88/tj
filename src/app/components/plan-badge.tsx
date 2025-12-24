import { Badge } from './ui/badge';
import { useProfile } from '../utils/use-profile';
import { hasPaidEntitlement } from '../utils/entitlements';

export function PlanBadge({ className }: { className?: string }) {
  const { profile, loading } = useProfile();

  const stableClass = `w-[104px] sm:w-auto sm:min-w-[140px] h-7 sm:h-auto justify-center text-[11px] sm:text-xs px-1.5 sm:px-2 py-0 sm:py-0.5 leading-none truncate shrink-0 ${className ?? ''}`.trim();

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
