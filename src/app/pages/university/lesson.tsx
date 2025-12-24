import { useMemo } from 'react';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Seo } from '../../components/seo';
import { getLessonBySlugs } from '../../university/catalog';
import { useUniversityProgress } from '../../university/useUniversityProgress';

type Props = {
  courseSlug: string;
  lessonSlug: string;
  onBackToCourse: (courseSlug: string) => void;
  onOpenLesson: (courseSlug: string, lessonSlug: string) => void;
};

function computeNextLessonSlug(courseSlug: string, lessonSlug: string) {
  const lookup = getLessonBySlugs(courseSlug, lessonSlug);
  if (!lookup) return null;
  const { course } = lookup;
  const slugs: string[] = [];
  for (const m of course.modules) for (const l of m.lessons) slugs.push(l.slug);
  const idx = slugs.indexOf(lessonSlug);
  if (idx === -1) return null;
  return slugs[idx + 1] ?? null;
}

export function UniversityLessonPage({ courseSlug, lessonSlug, onBackToCourse, onOpenLesson }: Props) {
  const { isLessonCompleted, toggleLessonCompleted, markLessonComplete } = useUniversityProgress();

  const lookup = getLessonBySlugs(courseSlug, lessonSlug);
  const isDone = isLessonCompleted(courseSlug, lessonSlug);
  const nextLessonSlug = useMemo(() => computeNextLessonSlug(courseSlug, lessonSlug), [courseSlug, lessonSlug]);

  if (!lookup) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <Seo title="University | TJ" noindex />
        <div className="text-sm text-muted-foreground">Lesson not found.</div>
        <div className="mt-4">
          <Button type="button" variant="ghost" onClick={() => onBackToCourse(courseSlug)}>
            Back to course
          </Button>
        </div>
      </div>
    );
  }

  const { course, module, lesson } = lookup;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Seo title={`${lesson.title} | ${course.title} | University | TJ`} noindex />

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            className="text-sm text-muted-foreground hover:underline"
            onClick={() => onBackToCourse(courseSlug)}
          >
            {course.title}
          </button>
          <h1 className="text-3xl mt-2 truncate">{lesson.title}</h1>
          <p className="text-sm text-muted-foreground mt-2">
            {module.title} • {lesson.estMinutes} minutes
          </p>
        </div>
        <div className="shrink-0">
          <Button type="button" variant={isDone ? 'secondary' : 'default'} onClick={() => toggleLessonCompleted(courseSlug, lessonSlug)}>
            {isDone ? 'Completed' : 'Mark complete'}
          </Button>
        </div>
      </div>

      <div className="mt-8 grid gap-4">
        <Card className="p-5">
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <p>
              This lesson content is a placeholder for now. The goal is to keep each lesson focused: clear definitions, a few examples,
              and a short checklist you can apply in your next session.
            </p>
            <h3>Key idea</h3>
            <p>
              Turn concepts into rules. If you can’t write it as a rule, you can’t measure it.
            </p>
            <h3>Checklist</h3>
            <ul>
              <li>Define the setup in one sentence</li>
              <li>Define the invalidation level</li>
              <li>Define the risk amount before entry</li>
              <li>Write the exit plan (TP / trail / time stop)</li>
            </ul>
          </div>
        </Card>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => onBackToCourse(courseSlug)}>
            Back to course
          </Button>

          <div className="flex gap-2">
            {nextLessonSlug ? (
              <Button
                type="button"
                onClick={() => {
                  markLessonComplete(courseSlug, lessonSlug);
                  onOpenLesson(courseSlug, nextLessonSlug);
                }}
              >
                Next lesson
              </Button>
            ) : (
              <Button type="button" onClick={() => markLessonComplete(courseSlug, lessonSlug)}>
                Finish course
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
