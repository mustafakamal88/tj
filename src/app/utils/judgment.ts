import type { JudgmentReason, JudgmentResult, JudgmentStatus } from "../components/judgment-card";

export type JudgmentInputs = {
  tradesToday?: number;
  last10RiskValues?: number[];
  losingStreak?: number;
  todayPnL?: number;
  dailyMaxLoss?: number;
};

type Signal = {
  status: JudgmentStatus;
  reason: JudgmentReason;
  message: string;
};

function statusRank(s: JudgmentStatus): number {
  if (s === "red") return 3;
  if (s === "yellow") return 2;
  return 1;
}

function titleForStatus(status: JudgmentStatus): JudgmentResult["title"] {
  if (status === "red") return "STOP";
  if (status === "yellow") return "CAUTION";
  return "CLEAR";
}

function tradeFrequencySignal(tradesToday: number): Signal {
  if (tradesToday >= 7) {
    return {
      status: "red",
      reason: "trade_frequency",
      message: "Overtrading risk: 7+ trades today. Step back and reset.",
    };
  }
  if (tradesToday >= 4) {
    return {
      status: "yellow",
      reason: "trade_frequency",
      message: "High trade frequency today. Consider slowing down to avoid overtrading.",
    };
  }
  return {
    status: "green",
    reason: "trade_frequency",
    message: "Trade frequency is within plan.",
  };
}

function riskSpikeSignal(values: number[]): Signal | null {
  const cleaned = values.filter((v) => Number.isFinite(v) && v > 0);
  if (cleaned.length < 2) return null;

  const avg = cleaned.reduce((s, v) => s + v, 0) / cleaned.length;
  if (!Number.isFinite(avg) || avg <= 0) return null;

  const max = Math.max(...cleaned);
  const ratio = max / avg;
  if (!Number.isFinite(ratio)) return null;

  if (ratio > 2.0) {
    return {
      status: "red",
      reason: "risk_spike",
      message: `Risk spike detected: max risk is ${ratio.toFixed(2)}× your recent average.`,
    };
  }
  if (ratio > 1.5) {
    return {
      status: "yellow",
      reason: "risk_spike",
      message: `Risk spike: max risk is ${ratio.toFixed(2)}× your recent average.`,
    };
  }
  return {
    status: "green",
    reason: "risk_spike",
    message: "Risk sizing looks consistent across your last 10 trades.",
  };
}

function losingStreakSignal(streak: number): Signal {
  if (streak >= 4) {
    return {
      status: "red",
      reason: "losing_streak",
      message: `You're on a ${streak}-trade losing streak. Pause or cut risk immediately.`,
    };
  }
  if (streak === 3) {
    return {
      status: "yellow",
      reason: "losing_streak",
      message: "3 losses in a row. Reduce size and tighten criteria.",
    };
  }
  return {
    status: "green",
    reason: "losing_streak",
    message: "No losing streak pressure detected.",
  };
}

function dailyDrawdownSignal(todayPnL: number, dailyMaxLoss?: number): Signal | null {
  if (!Number.isFinite(todayPnL)) return null;
  const maxLoss = Number.isFinite(dailyMaxLoss ?? NaN) ? (dailyMaxLoss as number) : 200;
  if (!Number.isFinite(maxLoss) || maxLoss <= 0) return null;

  const ddPct = Math.abs(Math.min(0, todayPnL)) / maxLoss;

  if (ddPct > 0.7) {
    return {
      status: "red",
      reason: "daily_drawdown",
      message: `You're at ${(ddPct * 100).toFixed(0)}% of your daily max loss. Stop trading for today.`,
    };
  }
  if (ddPct >= 0.4) {
    return {
      status: "yellow",
      reason: "daily_drawdown",
      message: `You're at ${(ddPct * 100).toFixed(0)}% of your daily max loss. Trade smaller or pause.`,
    };
  }
  return {
    status: "green",
    reason: "daily_drawdown",
    message: "Daily drawdown is comfortably within limits.",
  };
}

export function computeJudgment(inputs: JudgmentInputs): JudgmentResult {
  const signals: Signal[] = [];

  if (typeof inputs.tradesToday === "number" && Number.isFinite(inputs.tradesToday)) {
    signals.push(tradeFrequencySignal(inputs.tradesToday));
  }

  if (Array.isArray(inputs.last10RiskValues)) {
    const s = riskSpikeSignal(inputs.last10RiskValues);
    if (s) signals.push(s);
  }

  if (typeof inputs.losingStreak === "number" && Number.isFinite(inputs.losingStreak)) {
    signals.push(losingStreakSignal(inputs.losingStreak));
  }

  if (typeof inputs.todayPnL === "number" && Number.isFinite(inputs.todayPnL)) {
    const s = dailyDrawdownSignal(inputs.todayPnL, inputs.dailyMaxLoss);
    if (s) signals.push(s);
  }

  if (signals.length === 0) {
    return {
      status: "green",
      title: "CLEAR",
      reason: "trade_frequency",
      message: "Not enough data yet to evaluate trading judgment.",
      updatedAt: new Date(),
    };
  }

  const worst = signals.reduce((acc, cur) => {
    return statusRank(cur.status) > statusRank(acc.status) ? cur : acc;
  }, signals[0]);

  return {
    status: worst.status,
    title: titleForStatus(worst.status),
    reason: worst.reason,
    message: worst.message,
    updatedAt: new Date(),
  };
}
