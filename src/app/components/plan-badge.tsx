import { Badge } from './ui/badge';
import { useProfile } from '../utils/use-profile';
import { hasPaidEntitlement } from '../utils/entitlements';

export function PlanBadge({ className }: { className?: string }) {
  const { profile, loading } = useProfile();

  const stableClass = `h-6 sm:h-auto w-[64px] sm:w-auto sm:min-w-[140px] justify-center text-[11px] sm:text-xs leading-none px-2 sm:px-2 py-0 sm:py-0.5 truncate shrink-0 ${className ?? ''}`.trim();

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
