import { useCallback, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'tj_university_progress_v1';

type ProgressStateV1 = {
  completed: Record<string, true>;
};

function safeParse(raw: string | null): ProgressStateV1 {
  if (!raw) return { completed: {} };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return { completed: {} };
    const completed = (parsed as any).completed;
    if (!completed || typeof completed !== 'object') return { completed: {} };
    return { completed: completed as Record<string, true> };
  } catch {
    return { completed: {} };
  }
}

function keyFor(courseSlug: string, lessonSlug: string) {
  return `${courseSlug}:${lessonSlug}`;
}

export function useUniversityProgress() {
  const [state, setState] = useState<ProgressStateV1>(() => safeParse(localStorage.getItem(STORAGE_KEY)));

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setState(safeParse(e.newValue));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const persist = useCallback((next: ProgressStateV1) => {
    setState(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const isLessonCompleted = useCallback(
    (courseSlug: string, lessonSlug: string) => {
      return Boolean(state.completed[keyFor(courseSlug, lessonSlug)]);
    },
    [state.completed],
  );

  const markLessonComplete = useCallback(
    (courseSlug: string, lessonSlug: string) => {
      const k = keyFor(courseSlug, lessonSlug);
      if (state.completed[k]) return;
      persist({ completed: { ...state.completed, [k]: true } });
    },
    [persist, state.completed],
  );

  const markLessonIncomplete = useCallback(
    (courseSlug: string, lessonSlug: string) => {
      const k = keyFor(courseSlug, lessonSlug);
      if (!state.completed[k]) return;
      const next = { ...state.completed };
      delete next[k];
      persist({ completed: next });
    },
    [persist, state.completed],
  );

  const toggleLessonCompleted = useCallback(
    (courseSlug: string, lessonSlug: string) => {
      if (isLessonCompleted(courseSlug, lessonSlug)) markLessonIncomplete(courseSlug, lessonSlug);
      else markLessonComplete(courseSlug, lessonSlug);
    },
    [isLessonCompleted, markLessonComplete, markLessonIncomplete],
  );

  const getCourseCompletedCount = useCallback(
    (courseSlug: string, lessonSlugs: string[]) => {
      return lessonSlugs.reduce((acc, lessonSlug) => (isLessonCompleted(courseSlug, lessonSlug) ? acc + 1 : acc), 0);
    },
    [isLessonCompleted],
  );

  const completedKeys = useMemo(() => new Set(Object.keys(state.completed)), [state.completed]);

  return {
    storageKey: STORAGE_KEY,
    completedKeys,
    isLessonCompleted,
    markLessonComplete,
    markLessonIncomplete,
    toggleLessonCompleted,
    getCourseCompletedCount,
  };
}
