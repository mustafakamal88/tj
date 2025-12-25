import { ChevronLeft } from 'lucide-react';
import { cn } from './ui/utils';

type BreadcrumbsProps = {
  sectionLabel?: string;
  currentLabel: string;
  onBack?: () => void;
  className?: string;
};

export function Breadcrumbs({
  sectionLabel = 'Tradespace',
  currentLabel,
  onBack,
  className,
}: BreadcrumbsProps) {
  return (
    <div className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        aria-label="Go back"
      >
        <ChevronLeft className="size-4" />
      </button>

      <span className="truncate">
        {sectionLabel}
        <span className="mx-1 text-muted-foreground/60">/</span>
        <span className="font-medium text-foreground">{currentLabel}</span>
      </span>
    </div>
  );
}
