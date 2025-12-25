import { requireSupabaseClient, ensureSession } from './supabase';

export type ImportRunSource = 'broker' | 'csv';
export type ImportRunStatus = 'running' | 'success' | 'failed';

export type ImportRun = {
  id: string;
  userId: string;
  source: ImportRunSource;
  provider: string;
  status: ImportRunStatus;
  startedAt: string;
  endedAt: string | null;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  errorMessage: string | null;
  errorDetails: unknown | null;
  createdAt: string;
};

type ImportRunRow = {
  id: string;
  user_id: string;
  source: string;
  provider: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  imported_count: number | null;
  updated_count: number | null;
  skipped_count: number | null;
  error_message: string | null;
  error_details: unknown | null;
  created_at: string;
};

function toImportRun(row: ImportRunRow): ImportRun {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    source: (row.source as ImportRunSource) ?? 'broker',
    provider: String(row.provider ?? ''),
    status: (row.status as ImportRunStatus) ?? 'running',
    startedAt: String(row.started_at),
    endedAt: row.ended_at ?? null,
    importedCount: Math.max(0, Number(row.imported_count ?? 0)),
    updatedCount: Math.max(0, Number(row.updated_count ?? 0)),
    skippedCount: Math.max(0, Number(row.skipped_count ?? 0)),
    errorMessage: row.error_message ?? null,
    errorDetails: row.error_details ?? null,
    createdAt: String(row.created_at),
  };
}

export async function createImportRun(input: {
  source: ImportRunSource;
  provider: string;
}): Promise<ImportRun> {
  const supabase = requireSupabaseClient();
  const session = await ensureSession(supabase);
  if (!session) throw new Error('You must be logged in.');

  const { data, error } = await supabase
    .from('import_runs')
    .insert({
      user_id: session.user.id,
      source: input.source,
      provider: input.provider,
      status: 'running',
    })
    .select('*')
    .single<ImportRunRow>();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create import run.');
  }

  return toImportRun(data);
}

export async function updateImportRun(
  id: string,
  patch: {
    status?: ImportRunStatus;
    endedAt?: string | null;
    importedCount?: number;
    updatedCount?: number;
    skippedCount?: number;
    errorMessage?: string | null;
    errorDetails?: unknown | null;
  },
): Promise<ImportRun> {
  const supabase = requireSupabaseClient();

  const update: Record<string, unknown> = {};
  if (patch.status) update.status = patch.status;
  if (patch.endedAt !== undefined) update.ended_at = patch.endedAt;
  if (patch.importedCount !== undefined) update.imported_count = patch.importedCount;
  if (patch.updatedCount !== undefined) update.updated_count = patch.updatedCount;
  if (patch.skippedCount !== undefined) update.skipped_count = patch.skippedCount;
  if (patch.errorMessage !== undefined) update.error_message = patch.errorMessage;
  if (patch.errorDetails !== undefined) update.error_details = patch.errorDetails;

  const { data, error } = await supabase
    .from('import_runs')
    .update(update)
    .eq('id', id)
    .select('*')
    .single<ImportRunRow>();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to update import run.');
  }

  return toImportRun(data);
}

export async function listImportRuns(input: { limit: number }): Promise<ImportRun[]> {
  const supabase = requireSupabaseClient();

  const { data, error } = await supabase
    .from('import_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(Math.max(1, Math.min(100, input.limit)))
    .returns<ImportRunRow[]>();

  if (error) {
    throw new Error(error.message || 'Failed to load import runs.');
  }

  return (data ?? []).map(toImportRun);
}
