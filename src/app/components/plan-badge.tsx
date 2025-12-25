import { Badge } from './ui/badge';
import { useProfile } from '../utils/use-profile';
import { hasPaidEntitlement } from '../utils/entitlements';

export function PlanBadge({ className }: { className?: string }) {
  const { profile, loading } = useProfile();

  const stableClass = `h-8 px-2.5 min-w-[56px] max-w-[56px] justify-center rounded-md leading-none inline-flex items-center gap-1.5 truncate text-[11px] font-semibold tracking-wide text-foreground border border-border/50 bg-background ${className ?? ''}`.trim();

  if (loading || !profile) {
    return (
      <Badge variant="secondary" className={stableClass}>
        <span className="size-1.5 rounded-full bg-primary/70" aria-hidden="true" />
        Loading…
      </Badge>
    );
  }

  const isPaid = hasPaidEntitlement(profile);
  const label = isPaid ? profile.subscriptionPlan.toUpperCase() : 'FREE';

  return (
    <Badge
      variant="secondary"
      className={stableClass}
    >
      <span className="size-1.5 rounded-full bg-primary/70" aria-hidden="true" />
      {label}
    </Badge>
  );
}
