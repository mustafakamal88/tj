import * as React from "react";
import { cn } from "@/app/components/ui/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

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

type RuleRow = {
  id: JudgmentReason;
  label: string;
  status: JudgmentStatus;
  valueText: string;
  thresholdText: string;
  missing?: boolean;
  tips?: string[];
};

type JudgmentBreakdown = {
  rows: RuleRow[];
  signalsPresent: number;
  confidence: "High" | "Medium" | "Low";
  showAccuracyHint: boolean;
  worstRowId: JudgmentReason;
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
  breakdown,
  updatedAt,
}: {
  result: JudgmentResult;
  className?: string;
  onViewBreakdown?: () => void;
  breakdown?: JudgmentBreakdown;
  updatedAt?: Date;
}) {
  const s = statusStyles(result.status);
  const [open, setOpen] = React.useState(false);

  const lastUpdated = updatedAt ?? result.updatedAt;

  const showBreakdown = Boolean(breakdown);
  const handleOpenBreakdown = onViewBreakdown
    ? onViewBreakdown
    : showBreakdown
      ? () => setOpen(true)
      : undefined;

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
            {lastUpdated.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        {handleOpenBreakdown ? (
          <button
            type="button"
            onClick={handleOpenBreakdown}
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

      {showBreakdown ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-lg w-full rounded-2xl border bg-background p-5 shadow-lg">
            <DialogHeader className="space-y-1 text-left">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <DialogTitle className="text-base">Trading Judgment v1</DialogTitle>
                  <DialogDescription className="text-sm">How this score was calculated</DialogDescription>
                </div>
                <div className="shrink-0 text-xs text-muted-foreground">
                  Confidence: <span className="font-medium text-foreground">{breakdown.confidence}</span>
                </div>
              </div>
              {breakdown.showAccuracyHint ? (
                <div className="text-xs text-muted-foreground">Add risk per trade to improve accuracy.</div>
              ) : null}
            </DialogHeader>

            <div className="mt-4 space-y-2">
              {breakdown.rows.map((row) => {
                const dotClass =
                  row.status === "green"
                    ? "bg-emerald-500"
                    : row.status === "red"
                      ? "bg-rose-500"
                      : "bg-amber-400";

                const isWorst = row.id === breakdown.worstRowId;

                return (
                  <div key={row.id}>
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={cn("inline-flex size-2.5 rounded-full", dotClass)} aria-hidden="true" />
                        <span className="text-sm text-foreground truncate">{row.label}</span>
                      </div>
                      <div className="text-sm font-semibold text-foreground shrink-0">{row.valueText}</div>
                      <div className="text-xs text-muted-foreground shrink-0">{row.thresholdText}</div>
                    </div>

                    {isWorst && row.tips && row.tips.length > 0 ? (
                      <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground space-y-1">
                        {row.tips.slice(0, 2).map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
