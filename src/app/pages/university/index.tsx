import { useMemo } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Seo } from '../../components/seo';
import { courses } from '../../university/catalog';

type Props = {
  onOpenCourse: (courseSlug: string) => void;
};

function formatTime(minutes: number) {
  const hours = Math.round((minutes / 60) * 10) / 10;
  return hours >= 1 ? `${hours}h` : `${minutes}m`;
}

export function UniversityHomePage({ onOpenCourse }: Props) {
  const courseCards = useMemo(() => {
    return courses.map((course) => {
      const lessonCount = course.modules.reduce((acc, m) => acc + m.lessons.length, 0);
      return {
        course,
        lessonCount,
        timeLabel: formatTime(course.estMinutes),
      };
    });
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Seo title="University | TJ" noindex />

      <div>
        <h1 className="text-3xl mb-2">University</h1>
        <p className="text-muted-foreground">Structured learning to improve consistency</p>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {courseCards.map(({ course, lessonCount, timeLabel }) => {
          const locked = course.lockedByDefault;
          const status = locked ? 'Locked' : 'Available';
          const cta = locked ? 'View' : 'Start';

          return (
            <Card key={course.slug} className="p-5 hover:bg-accent/30 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">{course.title}</div>
                  <div className="text-sm text-muted-foreground mt-1">{course.description}</div>
                </div>
                <Badge variant={locked ? 'secondary' : 'default'}>{status}</Badge>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-muted-foreground">Lessons</div>
                  <div className="font-medium">{lessonCount}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Time</div>
                  <div className="font-medium">{timeLabel}</div>
                </div>
              </div>

              <div className="mt-5">
                <Button type="button" className="w-full" onClick={() => onOpenCourse(course.slug)}>
                  {cta}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
