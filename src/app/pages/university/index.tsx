import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { universityStages } from '../../data/university';
import { pushPath } from '../../utils/nav';

function navigateToUniversityLesson(stageId: string, lessonId: string) {
  pushPath(`/university/${stageId}/${lessonId}`);
}

export function UniversityPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl mb-2">University</h1>
          <p className="text-muted-foreground">Structured learning to improve consistency.</p>
        </div>
        <Badge variant="outline">Stages → Lessons</Badge>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6">
        {universityStages.map((stage) => (
          <Card key={stage.id} className="overflow-hidden">
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <CardTitle className="text-xl">{stage.title}</CardTitle>
                  <CardDescription>{stage.description}</CardDescription>
                </div>
                <Badge variant="secondary" className="capitalize">
                  {stage.id}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="pt-0">
              <div className="divide-y">
                {stage.lessons.map((lesson) => (
                  <div key={lesson.id} className="py-4 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-medium truncate">{lesson.title}</div>
                        {lesson.locked ? (
                          <Badge variant="outline" className="text-muted-foreground">
                            Locked
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">{lesson.summary}</div>
                      <div className="mt-2 text-xs text-muted-foreground">~{lesson.durationMins} min</div>
                    </div>

                    <div className="shrink-0">
                      <Button
                        variant="outline"
                        disabled={Boolean(lesson.locked)}
                        onClick={() => {
                          if (lesson.locked) return;
                          navigateToUniversityLesson(stage.id, lesson.id);
                        }}
                      >
                        {lesson.locked ? 'Locked' : 'Open'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
