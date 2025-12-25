import * as React from "react";
import { cn } from "@/app/components/ui/utils";

export type JudgmentStatus = "green" | "yellow" | "red";

export type JudgmentReason =
  | "trade_frequency"
  | "risk_spike"
  | "losing_streak"
  | "daily_drawdown";

export type JudgmentResult = {
  status: JudgmentStatus;
  title: "CLEAR" | "CAUTION" | "STOP";
  reason: JudgmentReason;
  message: string;
  updatedAt: Date;
};

function statusStyles(status: JudgmentStatus) {
  switch (status) {
    case "green":
      return {
        dot: "bg-emerald-500/80",
        ring: "ring-emerald-500/20",
        badge: "border-emerald-500/25 bg-emerald-500/10 text-emerald-200",
      };
    case "yellow":
      return {
        dot: "bg-amber-400/90",
        ring: "ring-amber-400/20",
        badge: "border-amber-400/25 bg-amber-400/10 text-amber-200",
      };
    case "red":
      return {
        dot: "bg-rose-500/85",
        ring: "ring-rose-500/20",
        badge: "border-rose-500/25 bg-rose-500/10 text-rose-200",
      };
  }
}

export function JudgmentCard({
  result,
  className,
  onViewBreakdown,
}: {
  result: JudgmentResult;
  className?: string;
  onViewBreakdown?: () => void;
}) {
  const s = statusStyles(result.status);

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/60 bg-card/80 backdrop-blur",
        "shadow-sm",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold text-foreground">
            Trading Judgment
          </div>
          <span className="inline-flex h-5 items-center rounded-md border border-border/50 bg-muted/30 px-2 text-[11px] font-semibold tracking-wide text-muted-foreground">
            v1
          </span>
        </div>
      </div>

      {/* Status */}
      <div className="px-5 pt-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "inline-flex size-3 rounded-full",
              s.dot,
              "ring-4",
              s.ring,
            )}
          />
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold leading-none text-foreground">
              {result.title}
            </span>
            <span
              className={cn(
                "inline-flex h-6 items-center rounded-md border px-2 text-[11px] font-semibold tracking-wide",
                s.badge,
              )}
            >
              {result.reason.split("_").join(" ").toUpperCase()}
            </span>
          </div>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {result.message}
        </p>
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between border-t border-border/50 px-5 py-3">
        <div className="text-[12px] text-muted-foreground">
          Last updated:{" "}
          <span className="text-foreground/80">
            {result.updatedAt.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        {onViewBreakdown ? (
          <button
            type="button"
            onClick={onViewBreakdown}
            className="text-[12px] font-semibold text-foreground/80 hover:text-foreground"
          >
            View breakdown
          </button>
        ) : (
          <span className="text-[12px] text-muted-foreground/70">
            Breakdown soon
          </span>
        )}
      </div>
    </div>
  );
}
