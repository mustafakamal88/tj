import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { universityStages } from '../../data/university';
import { pushPath } from '../../utils/nav';

type ContentBlock =
  | { type: 'heading'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'p'; text: string };

function parseLessonContent(content: string): ContentBlock[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');

  const blocks: ContentBlock[] = [];
  let paragraphBuffer: string[] = [];

  let ulBuffer: string[] = [];
  let olBuffer: string[] = [];

  const flushParagraph = () => {
    const text = paragraphBuffer.join(' ').trim();
    if (text) blocks.push({ type: 'p', text });
    paragraphBuffer = [];
  };

  const flushLists = () => {
    if (ulBuffer.length) blocks.push({ type: 'ul', items: ulBuffer });
    if (olBuffer.length) blocks.push({ type: 'ol', items: olBuffer });
    ulBuffer = [];
    olBuffer = [];
  };

  const flushAll = () => {
    flushParagraph();
    flushLists();
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushAll();
      continue;
    }

    const isHeading = line.endsWith(':') && !/^\d+\)\s+/.test(line) && !line.startsWith('- ');
    if (isHeading) {
      flushAll();
      blocks.push({ type: 'heading', text: line.slice(0, -1) });
      continue;
    }

    const ulMatch = line.startsWith('- ') ? line.slice(2).trim() : null;
    if (ulMatch) {
      flushParagraph();
      olBuffer = [];
      ulBuffer.push(ulMatch);
      continue;
    }

    const olMatch = line.match(/^\d+\)\s+(.*)$/);
    if (olMatch) {
      flushParagraph();
      ulBuffer = [];
      olBuffer.push(olMatch[1].trim());
      continue;
    }

    flushLists();
    paragraphBuffer.push(line);
  }

  flushAll();
  return blocks;
}

function renderLessonContent(content: string) {
  const blocks = parseLessonContent(content);
  return (
    <div className="space-y-3">
      {blocks.map((block, idx) => {
        if (block.type === 'heading') {
          return (
            <div key={idx} className="pt-2 font-semibold">
              {block.text}
            </div>
          );
        }

        if (block.type === 'ul') {
          return (
            <ul key={idx} className="list-disc pl-5 space-y-1">
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx}>{item}</li>
              ))}
            </ul>
          );
        }

        if (block.type === 'ol') {
          return (
            <ol key={idx} className="list-decimal pl-5 space-y-1">
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx}>{item}</li>
              ))}
            </ol>
          );
        }

        return (
          <p key={idx} className="text-sm leading-relaxed">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}

export function UniversityLessonPage({ stageId, lessonId }: { stageId: string; lessonId: string }) {
  const stage = universityStages.find((s) => s.id === stageId);
  const lessons = stage?.lessons ?? [];
  const lessonIndex = lessons.findIndex((l) => l.id === lessonId);
  const lesson = lessonIndex >= 0 ? lessons[lessonIndex] : null;

  const prevLesson = lessonIndex > 0 ? lessons[lessonIndex - 1] : null;
  const nextLesson = lessonIndex >= 0 && lessonIndex < lessons.length - 1 ? lessons[lessonIndex + 1] : null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button variant="ghost" onClick={() => pushPath('/university')} className="gap-2">
          <ArrowLeft className="size-4" />
          Back
        </Button>

        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="capitalize">
            {stage?.title ?? stageId}
          </Badge>
          {lesson?.locked ? (
            <Badge variant="outline" className="text-muted-foreground">
              Locked
            </Badge>
          ) : null}
        </div>
      </div>

      {stage && lesson ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-2xl">{lesson.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground">
                {stage.title} → {lesson.title}
            </div>
            <div className="text-sm text-muted-foreground">~{lesson.durationMins} min</div>
            <div className="mt-4">{renderLessonContent(lesson.content)}</div>

            <div className="mt-8 flex items-center justify-between gap-3">
              <Button
                variant="outline"
                disabled={!prevLesson}
                onClick={() => {
                  if (!prevLesson) return;
                  pushPath(`/university/${stage.id}/${prevLesson.id}`);
                }}
                className="gap-2"
              >
                <ArrowLeft className="size-4" />
                Prev
              </Button>

              <Button
                variant="outline"
                disabled={!nextLesson}
                onClick={() => {
                  if (!nextLesson) return;
                  pushPath(`/university/${stage.id}/${nextLesson.id}`);
                }}
                className="gap-2"
              >
                Next
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Lesson not found</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              The lesson URL is invalid or the lesson does not exist.
            </div>
            <div className="mt-4">
              <Button variant="outline" onClick={() => pushPath('/university')}>
                Back to University
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
