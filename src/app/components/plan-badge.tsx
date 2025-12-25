import { Badge } from './ui/badge';
import { useProfile } from '../utils/use-profile';
import { hasPaidEntitlement } from '../utils/entitlements';

export function PlanBadge({ className }: { className?: string }) {
  const { profile, loading } = useProfile();

  const stableClass = `h-6 sm:h-6 min-w-[56px] sm:min-w-[60px] justify-center rounded-full text-[11px] sm:text-[11px] leading-none px-2 sm:px-2.5 py-0 truncate ${className ?? ''}`.trim();

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
