export type UniversityLesson = {
  id: string;
  title: string;
  summary: string;
  durationMins: number;
  content: string;
  locked?: boolean;
};

export type UniversityStage = {
  id: 'beginner' | 'intermediate' | 'pro';
  title: string;
  description: string;
  lessons: UniversityLesson[];
};

export const universityStages: UniversityStage[] = [
  {
    id: 'beginner',
    title: 'Beginner',
    description: 'Build the foundations: risk, process, and a simple journal you will actually use.',
    lessons: [
      {
        id: 'journal-setup',
        title: 'Your Journal Setup (The Minimum Viable Log)',
        summary: 'What to record on every trade so you can learn faster without overcomplicating it.',
        durationMins: 12,
        content: `Goal\nTurn your trades into feedback you can act on.

What to record (every trade)\n- Setup / pattern name (your own words)
- Instrument + session (e.g., ES RTH, EURUSD London)
- Entry, stop, target, size
- Planned R multiple (e.g., target = +2R)
- Result in R (not dollars)
- One sentence: \"Why did I take it?\"
- One sentence: \"What was the mistake / best decision?\"

Two rules\n1) If you don’t track stop + size, you don’t track risk.
2) If you don’t track a reason, you can’t review.

Review checklist (end of day)\n- Did I follow my entry rules?
- Did I respect stops?
- Did I take only A/B setups?
- What is the 1 thing to repeat tomorrow?\n`,
      },
      {
        id: 'risk-basics',
        title: 'Risk Basics: 1R, Position Size, and Survival',
        summary: 'How to define risk per trade and size consistently so one trade can’t derail you.',
        durationMins: 15,
        content: `Definitions\n- 1R = the amount you lose if your stop is hit.
- Risk per trade = a fixed fraction of your account (commonly 0.25%–1%).

Sizing formula\nPosition Size = Risk Dollars / Stop Distance

Practical steps\n1) Pick your risk per trade (start small).
2) Always place stop first.
3) Size last.
4) Record the planned R and actual R in your journal.

Common mistakes\n- Moving stops because \"it will come back\".
- Increasing size to \"make it back\".
- Tracking P&L in dollars only (hides risk consistency).

Micro habit\nBefore entering: say out loud, \"If stopped, I lose ___R and I’m okay with it.\"\n`,
      },
      {
        id: 'rr-and-expectancy',
        title: 'Risk/Reward and Expectancy (What Actually Matters)',
        summary: 'Why win-rate alone is meaningless and how R-multiples reveal your edge.',
        durationMins: 18,
        content: `Key idea\nA system can be profitable with a low win-rate if winners are larger than losers.

Expectancy (in R)\nE = (WinRate * AvgWinR) - (LossRate * AvgLossR)

Example\n- Win rate: 40%
- Avg win: +2.0R
- Avg loss: -1.0R
E = 0.4*2 - 0.6*1 = +0.2R per trade

Journal action\nTrack these weekly\n- Win rate
- Avg win (R)
- Avg loss (R)
- Expectancy (R)

What to improve first\n- If avg loss > 1R: fix execution.
- If avg win is small: improve trade management or targets.
- If win rate is low: tighten setup quality.\n`,
      },
    ],
  },
  {
    id: 'intermediate',
    title: 'Intermediate',
    description: 'Turn your journal into a system: tagging, review loops, and process metrics.',
    lessons: [
      {
        id: 'tagging-and-playbook',
        title: 'Tagging Trades and Building a Playbook',
        summary: 'Create a repeatable language for your setups so review becomes measurable.',
        durationMins: 20,
        locked: true,
        content: `Why tags matter\nTags let you answer: \"Which setups actually work for me?\" without guessing.

Tagging framework\n- Setup tag: the pattern (e.g., Breakout Pullback)
- Context tag: trend / range / news / session
- Quality grade: A / B / C (simple, but powerful)
- Error tag (optional): early entry, late exit, oversize, revenge

Playbook entry (one setup)\n- Conditions: what must be true
- Entry trigger: what you actually click on
- Stop logic: where it’s invalidated
- Target logic: where you take profits
- Common failure mode: when to avoid it

Weekly review\n- Sort by Setup tag
- Compare expectancy by setup
- Keep only 2–3 core setups until consistent\n`,
      },
      {
        id: 'process-metrics',
        title: 'Process Metrics > Outcome Metrics',
        summary: 'Track what you control (rules followed, risk consistency) to stabilize performance.',
        durationMins: 16,
        locked: true,
        content: `Outcome vs process\n- Outcome: P&L, win rate (lagging)
- Process: rule adherence, sizing, entries/exits (leading)

Suggested process metrics\n- % trades sized correctly
- % trades with stop placed before entry
- % trades that match an A/B setup
- # of impulsive trades

Daily score (simple)\n- 1 point: followed risk rule
- 1 point: only valid setups
- 1 point: wrote a post-trade note
Target: 2/3 or 3/3 most days.

Why this works\nProcess metrics reduce emotional variance and prevent \"one bad day\" spirals.\n`,
      },
      {
        id: 'review-workflow',
        title: 'A Weekly Review Workflow That Takes 30 Minutes',
        summary: 'A repeatable cadence to find one improvement and one strength every week.',
        durationMins: 22,
        locked: true,
        content: `Weekly review (30 minutes)\n1) Quick stats (5 min)
- Trades taken
- Expectancy (R)
- Best setup expectancy
- Worst setup expectancy

2) Deep review (15 min)
- Pick 3 best trades: why were they good?
- Pick 3 worst trades: what rule broke?
- Identify one pattern you keep repeating.

3) Action plan (10 min)
- One rule to enforce next week
- One setup to focus on
- One thing to stop doing

Journal prompt\n\"If I could only change one behavior next week, what would have the biggest impact?\"\n`,
      },
    ],
  },
  {
    id: 'pro',
    title: 'Pro',
    description: 'Refine edge and psychology: constraints, execution, and deliberate practice.',
    lessons: [
      {
        id: 'psychology-loops',
        title: 'Psychology Loops: Triggers, Behavior, Outcome',
        summary: 'Spot the emotional patterns that produce your worst trades and interrupt them.',
        durationMins: 18,
        locked: true,
        content: `The loop\nTrigger → Thought → Emotion → Action → Result

Common triggers\n- Early loss
- Missed entry
- Seeing others profit
- Breaking a rule earlier

Interrupt plan (2 minutes)\n- Name it: \"I’m feeling FOMO\".
- Breathe: 4 slow breaths.
- Reset: \"Next trade must be A setup + proper size\".
- If not possible: walk away for 5 minutes.

Journal prompt\n\"What did I feel right before the click? What was I trying to get?\"\n`,
      },
      {
        id: 'constraints-and-guards',
        title: 'Constraints: The Fastest Way to Improve Consistency',
        summary: 'Use simple constraints (max trades, max loss) to protect edge and reduce variance.',
        durationMins: 14,
        locked: true,
        content: `Why constraints work\nThey reduce decision fatigue and prevent overtrading.

Examples\n- Max trades/day: 3
- Max loss/day: -2R
- No trades after 2 consecutive losses
- Only trade one session per day

How to implement\n1) Choose ONE constraint.
2) Track compliance in your journal (yes/no).
3) Review weekly: did it reduce your biggest mistake?

Reminder\nConstraints are training wheels. Keep them until the habit sticks.\n`,
      },
      {
        id: 'deliberate-practice',
        title: 'Deliberate Practice: Fix One Leak at a Time',
        summary: 'A structured way to improve a single weakness with focus and feedback.',
        durationMins: 24,
        locked: true,
        content: `Pick one leak\nExamples\n- Moving stops
- Late entries
- Cutting winners
- Oversizing

Practice cycle (1 week)\n- Define success: e.g., \"0 moved stops\"
- Pre-trade reminder: sticky note / checklist
- Post-trade review: record if leak happened
- End of week: count leak occurrences

Upgrade criteria\nWhen the leak is rare, move to the next.

Pro tip\nDon’t change 5 things at once. Your journal becomes noise.\n`,
      },
    ],
  },
];
