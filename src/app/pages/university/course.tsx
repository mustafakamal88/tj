import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../../components/ui/accordion';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Seo } from '../../components/seo';
import { cn } from '../../components/ui/utils';
import { getCourseBySlug, getCourseLessonSlugs } from '../../university/catalog';
import { useUniversityProgress } from '../../university/useUniversityProgress';

type Props = {
  courseSlug: string;
  onBackToUniversity: () => void;
  onOpenLesson: (courseSlug: string, lessonSlug: string) => void;
};

export function UniversityCoursePage({ courseSlug, onBackToUniversity, onOpenLesson }: Props) {
  const { isLessonCompleted, getCourseCompletedCount } = useUniversityProgress();
  const course = getCourseBySlug(courseSlug);

  if (!course) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <Seo title="University | TJ" noindex />
        <div className="text-sm text-muted-foreground">Course not found.</div>
        <div className="mt-4">
          <Button type="button" variant="ghost" onClick={onBackToUniversity}>
            Back to University
          </Button>
        </div>
      </div>
    );
  }

  const allLessonSlugs = getCourseLessonSlugs(courseSlug);
  const completed = getCourseCompletedCount(courseSlug, allLessonSlugs);
  const total = allLessonSlugs.length;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Seo title={`${course.title} | University | TJ`} noindex />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <button type="button" className="text-sm text-muted-foreground hover:underline" onClick={onBackToUniversity}>
            University
          </button>
          <h1 className="text-3xl mt-2">{course.title}</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">{course.description}</p>
        </div>

        <Card className="p-4 sm:min-w-[220px]">
          <div className="text-sm text-muted-foreground">Progress</div>
          <div className="mt-1 flex items-center justify-between">
            <div className="text-2xl font-semibold">
              {completed}/{total}
            </div>
            <Badge variant={completed === total && total > 0 ? 'default' : 'secondary'}>
              {completed === total && total > 0 ? 'Complete' : 'In progress'}
            </Badge>
          </div>
        </Card>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold">Modules</h2>
        <Accordion type="single" collapsible className="mt-3">
          {course.modules.map((m) => (
            <AccordionItem key={m.slug} value={m.slug}>
              <AccordionTrigger>{m.title}</AccordionTrigger>
              <AccordionContent>
                <div className="grid gap-2">
                  {m.lessons.map((lesson) => {
                    const done = isLessonCompleted(courseSlug, lesson.slug);
                    return (
                      <button
                        key={lesson.slug}
                        type="button"
                        onClick={() => onOpenLesson(courseSlug, lesson.slug)}
                        className={cn(
                          'w-full rounded-md border px-3 py-2 text-left transition-colors',
                          'hover:bg-accent/40',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                          done ? 'bg-accent/30' : 'bg-background',
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium">{lesson.title}</div>
                          <Badge variant={done ? 'default' : 'secondary'}>{done ? 'Done' : `${lesson.estMinutes}m`}</Badge>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      <div className="mt-8">
        <Button type="button" variant="ghost" onClick={onBackToUniversity}>
          Back to University
        </Button>
      </div>
    </div>
  );
}
