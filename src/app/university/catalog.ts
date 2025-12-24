export type UniversityLesson = {
  slug: string;
  title: string;
  estMinutes: number;
};

export type UniversityModule = {
  slug: string;
  title: string;
  lessons: UniversityLesson[];
};

export type UniversityCourse = {
  slug: string;
  title: string;
  level: 'Beginner' | 'Intermediate' | 'Pro';
  description: string;
  estMinutes: number;
  lockedByDefault: boolean;
  modules: UniversityModule[];
};

export const courses: UniversityCourse[] = [
  {
    slug: 'beginner',
    title: 'Beginner',
    level: 'Beginner',
    description: 'Build strong foundations in structure, risk, and journaling.',
    estMinutes: 120,
    lockedByDefault: false,
    modules: [
      {
        slug: 'foundations',
        title: 'Foundations',
        lessons: [
          { slug: 'market-structure', title: 'Market structure', estMinutes: 15 },
          { slug: 'sessions', title: 'Sessions', estMinutes: 10 },
          { slug: 'volatility', title: 'Volatility', estMinutes: 10 },
        ],
      },
      {
        slug: 'risk',
        title: 'Risk',
        lessons: [
          { slug: 'position-sizing', title: 'Position sizing', estMinutes: 15 },
          { slug: 'rr', title: 'Risk-to-reward (R:R)', estMinutes: 15 },
          { slug: 'drawdown-rules', title: 'Drawdown rules', estMinutes: 10 },
        ],
      },
      {
        slug: 'journaling',
        title: 'Journaling',
        lessons: [
          { slug: 'how-to-journal', title: 'How to journal', estMinutes: 10 },
          { slug: 'tagging', title: 'Tagging & categorization', estMinutes: 10 },
          { slug: 'reviewing', title: 'Reviewing your trades', estMinutes: 10 },
        ],
      },
    ],
  },
  {
    slug: 'intermediate',
    title: 'Intermediate',
    level: 'Intermediate',
    description: 'Turn concepts into rules and consistent execution.',
    estMinutes: 150,
    lockedByDefault: true,
    modules: [
      {
        slug: 'strategy-building',
        title: 'Strategy building',
        lessons: [
          { slug: 'setup-rules', title: 'Setup rules', estMinutes: 15 },
          { slug: 'confluence', title: 'Confluence', estMinutes: 15 },
          { slug: 'invalidation', title: 'Invalidation', estMinutes: 10 },
        ],
      },
      {
        slug: 'execution',
        title: 'Execution',
        lessons: [
          { slug: 'entries-exits', title: 'Entries & exits', estMinutes: 15 },
          { slug: 'scaling', title: 'Scaling', estMinutes: 10 },
          { slug: 'stops-and-tps', title: 'Stops & TP plans', estMinutes: 10 },
        ],
      },
      {
        slug: 'review',
        title: 'Review',
        lessons: [
          { slug: 'stats', title: 'Stats that matter', estMinutes: 10 },
          { slug: 'edge-validation', title: 'Edge validation', estMinutes: 10 },
          { slug: 'mistakes-catalog', title: 'Mistakes catalog', estMinutes: 10 },
        ],
      },
    ],
  },
  {
    slug: 'pro',
    title: 'Pro',
    level: 'Pro',
    description: 'Build a system and optimize performance under constraints.',
    estMinutes: 180,
    lockedByDefault: true,
    modules: [
      {
        slug: 'systems',
        title: 'Systems',
        lessons: [
          { slug: 'rulesets', title: 'Rulesets', estMinutes: 15 },
          { slug: 'playbooks', title: 'Playbooks', estMinutes: 10 },
          { slug: 'constraints', title: 'Constraints', estMinutes: 10 },
        ],
      },
      {
        slug: 'performance',
        title: 'Performance',
        lessons: [
          { slug: 'psychology', title: 'Psychology', estMinutes: 10 },
          { slug: 'routines', title: 'Routines', estMinutes: 10 },
          { slug: 'stress-control', title: 'Stress control', estMinutes: 10 },
        ],
      },
      {
        slug: 'optimization',
        title: 'Optimization',
        lessons: [
          { slug: 'ab-testing', title: 'A/B testing', estMinutes: 10 },
          { slug: 'metrics', title: 'Metrics', estMinutes: 10 },
          { slug: 'streak-management', title: 'Streak management', estMinutes: 10 },
        ],
      },
    ],
  },
];

export function getCourseBySlug(courseSlug: string) {
  return courses.find((c) => c.slug === courseSlug) ?? null;
}
