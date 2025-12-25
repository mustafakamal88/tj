import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

type MtPlatform = "mt4" | "mt5";
type BrokerEnvironment = "demo" | "live";
type BrokerStatus = "new" | "created" | "deploying" | "connected" | "imported" | "error";
type ImportJobStatus = "queued" | "running" | "succeeded" | "failed";

type BrokerConnectionRow = {
  id: string;
  user_id: string;
  provider: "metaapi";
  metaapi_account_id: string;
  platform: MtPlatform;
  environment: BrokerEnvironment;
  server: string | null;
  login: string | null;
  status: BrokerStatus;
  last_import_at: string | null;
  created_at: string;
  updated_at: string;
  trade_count?: number;
};

type MetaApiDeal = {
  id?: unknown;
  positionId?: unknown;
  orderId?: unknown;
  symbol?: unknown;
  type?: unknown;
  entryType?: unknown;
  price?: unknown;
  profit?: unknown;
  commission?: unknown;
  swap?: unknown;
  time?: unknown;
  volume?: unknown;
};

type TradeType = "long" | "short";

const PROVIDER = "metaapi" as const;
// Larger window reduces MetaApi round-trips while keeping each chunk bounded for serverless time limits.
const IMPORT_WINDOW_DAYS = 60;
// Quick import should return recent trades fast (UI expects last ~1 month).
const QUICK_IMPORT_DAYS_DEFAULT = 30;
// Use smaller windows so each MetaApi request stays bounded even for large accounts.
const QUICK_IMPORT_WINDOW_DAYS = 10;
// Process a few windows per request to reduce total round-trips while staying within Edge Function limits.
const IMPORT_CONTINUE_MAX_CHUNKS = 3;
const IMPORT_CONTINUE_CONCURRENCY = 3;
const IMPORT_UPSERT_CHUNK_SIZE = 500;

const app = new Hono();

app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "apikey", "x-client-info"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    maxAge: 600,
  }),
);

app.options("*", (c) => c.text("", 204));

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name} env var.`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toString(value: unknown): string | null {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function clampInt(value: unknown, min: number, max: number): number | null {
  const raw = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(raw)) return null;
  const n = Math.floor(raw);
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function ok(c: any, data: unknown) {
  return c.json({ ok: true, data });
}

function fail(
  c: any,
  status: number,
  error: string,
  code?: string,
  details?: Record<string, unknown>,
) {
  return c.json(
    { ok: false, error, code: code ?? "error", ...(details ? { details } : {}) },
    status,
  );
}

// No regex: parse "Bearer <token>"
function getBearerToken(authHeader: string | undefined | null): string | null {
  if (!authHeader) return null;
  const s = authHeader.trim();
  if (s.length < 8) return null;
  const prefix = "bearer ";
  if (s.toLowerCase().startsWith(prefix)) return s.slice(prefix.length).trim();
  return null;
}

function getSupabaseAdmin() {
  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
}

async function requireUserId(req: Request): Promise<string> {
  const token = getBearerToken(req.headers.get("Authorization"));
  if (!token) throw new Error("Missing Authorization bearer token.");
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) throw new Error("Invalid Authorization token.");
  return data.user.id;
}

function trimTrailingSlashes(input: string): string {
  let s = input.trim();
  while (s.endsWith("/")) s = s.slice(0, -1);
  return s;
}

function metaApiClientBaseUrl(): string {
  const base = trimTrailingSlashes(requireEnv("METAAPI_CLIENT_URL"));
  if (!base.includes("mt-client-api-v1")) {
    throw new Error(
      'METAAPI_CLIENT_URL must point to "mt-client-api-v1" (e.g. https://mt-client-api-v1.london.agiliumtrade.ai).',
    );
  }
  return base;
}

function metaApiProvisioningBaseUrl(): string {
  const base = trimTrailingSlashes(requireEnv("METAAPI_PROVISIONING_URL"));
  if (!base.includes("mt-provisioning-api-v1")) {
    throw new Error(
      'METAAPI_PROVISIONING_URL must point to "mt-provisioning-api-v1" (e.g. https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai).',
    );
  }
  return base;
}

function metaApiAuthHeaders(): Record<string, string> {
  return { "auth-token": requireEnv("METAAPI_TOKEN"), Accept: "application/json" };
}

type MetaApiRetryContext = {
  attempt: number;
  retryAfterMs: number;
  recommendedRetryTime?: string;
  meta?: unknown;
};

type MetaApiRetryOptions = {
  maxRetries?: number;
  pauseAfterMs?: number;
  onRateLimit?: (ctx: MetaApiRetryContext) => void | Promise<void>;
};

function safeJsonParse(value: string): unknown {
  if (!value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function metaApiRecommendedRetryTime(meta: unknown): string | null {
  if (!isRecord(meta)) return null;
  const direct = toString((meta as any).recommendedRetryTime);
  if (direct) return direct;
  const metadata = (meta as any).metadata;
  if (isRecord(metadata)) {
    const nested = toString((metadata as any).recommendedRetryTime);
    if (nested) return nested;
  }
  const error = (meta as any).error;
  if (isRecord(error)) {
    const nested = toString((error as any).recommendedRetryTime);
    if (nested) return nested;
    const nestedMetadata = (error as any).metadata;
    if (isRecord(nestedMetadata)) {
      const nested2 = toString((nestedMetadata as any).recommendedRetryTime);
      if (nested2) return nested2;
    }
  }
  return null;
}

function retryAfterMsFromHeaders(headers: Headers): number | null {
  const value = headers.get("retry-after");
  if (!value) return null;
  const asSeconds = Number(value);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) return Math.round(asSeconds * 1000);
  const asDate = Date.parse(value);
  if (Number.isFinite(asDate)) return Math.max(0, asDate - Date.now());
  return null;
}

function computeMetaApiRetryDelayMs(input: {
  attempt: number;
  headers: Headers;
  meta?: unknown;
}): { delayMs: number; recommendedRetryTime?: string } {
  const recommendedRetryTime = metaApiRecommendedRetryTime(input.meta);
  if (recommendedRetryTime) {
    const recommendedMs = Date.parse(recommendedRetryTime);
    if (Number.isFinite(recommendedMs)) {
      const delayMs = Math.min(15_000, Math.max(250, recommendedMs - Date.now() + 250));
      return { delayMs, recommendedRetryTime };
    }
  }

  const headerDelay = retryAfterMsFromHeaders(input.headers);
  if (typeof headerDelay === "number" && Number.isFinite(headerDelay)) {
    return {
      delayMs: Math.min(15_000, Math.max(250, headerDelay)),
      recommendedRetryTime: recommendedRetryTime ?? undefined,
    };
  }

  const exp = Math.min(15_000, Math.round(500 * Math.pow(2, Math.max(0, input.attempt))));
  return { delayMs: exp, recommendedRetryTime: recommendedRetryTime ?? undefined };
}

async function sleep(ms: number): Promise<void> {
  if (!Number.isFinite(ms) || ms <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

const METAAPI_RATE_LIMIT_DEFAULT_PAUSE_AFTER_MS = 2_000;

class MetaApiRateLimitPauseError extends Error {
  status = 429 as const;
  code = "rate_limited" as const;
  meta?: unknown;
  retryAfterMs: number;
  retryAt: string;
  recommendedRetryTime?: string;

  constructor(input: { meta?: unknown; retryAfterMs: number; retryAt: string; recommendedRetryTime?: string }) {
    super("Rate limited, retrying soon");
    this.name = "MetaApiRateLimitPauseError";
    this.meta = input.meta;
    this.retryAfterMs = input.retryAfterMs;
    this.retryAt = input.retryAt;
    this.recommendedRetryTime = input.recommendedRetryTime;
  }
}

async function metaApiRequestWithRetry(
  url: string,
  init?: RequestInit,
  opts?: MetaApiRetryOptions,
): Promise<Response> {
  const maxRetries = Math.max(0, Math.floor(opts?.maxRetries ?? 12));
  const pauseAfterMs = Math.max(250, Math.floor(opts?.pauseAfterMs ?? METAAPI_RATE_LIMIT_DEFAULT_PAUSE_AFTER_MS));
  let lastMeta: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429) return res;

    const text = await res.text();
    const meta = safeJsonParse(text) ?? (text ? { raw: text } : null);
    lastMeta = meta;

    const { delayMs, recommendedRetryTime } = computeMetaApiRetryDelayMs({ attempt, headers: res.headers, meta });
    const retryAt = new Date(Date.now() + delayMs).toISOString();

    if (attempt >= maxRetries || delayMs > pauseAfterMs) {
      throw new MetaApiRateLimitPauseError({
        meta,
        retryAfterMs: delayMs,
        retryAt,
        recommendedRetryTime: recommendedRetryTime ?? undefined,
      });
    }

    try {
      await opts?.onRateLimit?.({
        attempt: attempt + 1,
        retryAfterMs: delayMs,
        recommendedRetryTime: recommendedRetryTime ?? undefined,
        meta,
      });
    } catch (e) {
      console.warn("[broker-import] rate limit callback failed", e);
    }

    await sleep(delayMs);
  }

  throw new MetaApiRateLimitPauseError({
    meta: lastMeta,
    retryAfterMs: 15_000,
    retryAt: new Date(Date.now() + 15_000).toISOString(),
  });
}

async function metaApiJson(url: string, init?: RequestInit, opts?: MetaApiRetryOptions): Promise<any> {
  const res = await metaApiRequestWithRetry(url, init, opts);
  const text = await res.text();
  const json = text ? safeJsonParse(text) : null;
  if (!res.ok) {
    const message =
      (isRecord(json) ? ((json as any).message ?? (json as any)?.error?.message) : null) ??
      (typeof text === "string" && text.length ? text : `MetaApi error (HTTP ${res.status}).`);
    const err = new Error(message);
    (err as any).status = res.status;
    (err as any).meta = json ?? { raw: text };
    throw err;
  }
  return json;
}

function normalizePlatform(value: string): MtPlatform | null {
  const lower = value.trim().toLowerCase();
  if (lower === "mt4") return "mt4";
  if (lower === "mt5") return "mt5";
  return null;
}

function normalizeEnvironment(value: string): BrokerEnvironment | null {
  const lower = value.trim().toLowerCase();
  if (lower === "demo") return "demo";
  if (lower === "live") return "live";
  return null;
}

function normalizeCloudType(value: string): string | null {
  const lower = value.trim().toLowerCase();
  if (lower === "cloud-g1") return "cloud-g1";
  if (lower === "cloud-g2") return "cloud-g2";
  return null;
}

// No regex: keep only A-Z0-9
function normalizeSymbol(value: string): string {
  const s = value ?? "";
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const code = ch.charCodeAt(0);
    const isNum = code >= 48 && code <= 57;
    const isUpper = code >= 65 && code <= 90;
    const isLower = code >= 97 && code <= 122;
    if (isNum || isUpper || isLower) out += ch;
  }
  return out.toUpperCase();
}

function fnv1a32(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function magicForConnection(input: {
  userId: string;
  platform: MtPlatform;
  environment: BrokerEnvironment;
  server: string;
  login: string;
}): number {
  // MetaTrader magic numbers are 32-bit signed ints. Keep it stable and non-zero.
  const seed = `tj:${input.userId}:${input.platform}:${input.environment}:${input.server}:${input.login}`;
  const h = fnv1a32(seed);
  return (h % 2147483646) + 1; // 1..2147483646
}

function isClosingDeal(entryType: string): boolean {
  const t = (entryType ?? "").toUpperCase();
  // Keep it permissive but exclude pure "IN" (open)
  return t !== "DEAL_ENTRY_IN";
}

function mapDealDirection(typeField: string): TradeType | null {
  const t = (typeField ?? "").toUpperCase();
  if (t.includes("BUY")) return "long";
  if (t.includes("SELL")) return "short";
  return null;
}

function outcomeFromPnL(pnl: number): "win" | "loss" | "breakeven" {
  if (pnl > 0) return "win";
  if (pnl < 0) return "loss";
  return "breakeven";
}

function pnlPercentage(entry: number, exit: number, type: TradeType): number {
  if (!Number.isFinite(entry) || entry === 0) return 0;
  const raw = ((exit - entry) / entry) * 100;
  return type === "short" ? -raw : raw;
}

function toIsoDate(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function toMetaApiTimeString(date: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(date.getUTCMilliseconds(), 3)}`
  );
}

function addDays(date: Date, days: number): Date {
  const out = new Date(date.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

type ImportJobRow = {
  id: string;
  user_id: string;
  connection_id: string;
  status: ImportJobStatus;
  progress: number;
  total: number;
  message: string | null;
  created_at: string;
  updated_at: string;
};

type ImportJobState = {
  from: string; // ISO
  to: string; // ISO
  windowDays: number;
  fetchedTotal: number;
  upsertedTotal: number;
  metaapiAccountId?: string;
  accountLogin?: string;
  lastChunk?: { from: string; to: string; fetched: number; upserted: number };
  statusText?: string;
  rateLimitedUntil?: string;
  error?: string;
};

function parseJobState(message: string | null | undefined): ImportJobState | null {
  if (!message) return null;
  try {
    const parsed = JSON.parse(message);
    if (!isRecord(parsed)) return null;
    const from = toString(parsed.from);
    const to = toString(parsed.to);
    const windowDays = toNumber(parsed.windowDays) ?? IMPORT_WINDOW_DAYS;
    const fetchedTotal = toNumber(parsed.fetchedTotal) ?? 0;
    const upsertedTotal = toNumber(parsed.upsertedTotal) ?? 0;
    if (!from || !to) return null;
    const out: ImportJobState = { from, to, windowDays, fetchedTotal, upsertedTotal };
    const metaapiAccountId = toString(parsed.metaapiAccountId);
    if (metaapiAccountId) out.metaapiAccountId = metaapiAccountId;
    const accountLogin = toString(parsed.accountLogin);
    if (accountLogin) out.accountLogin = accountLogin;
    if (isRecord(parsed.lastChunk)) {
      const lcFrom = toString(parsed.lastChunk.from);
      const lcTo = toString(parsed.lastChunk.to);
      const lcFetched = toNumber(parsed.lastChunk.fetched) ?? 0;
      const lcUpserted = toNumber(parsed.lastChunk.upserted) ?? 0;
      if (lcFrom && lcTo) out.lastChunk = { from: lcFrom, to: lcTo, fetched: lcFetched, upserted: lcUpserted };
    }
    const statusText = toString((parsed as any).statusText);
    if (statusText) out.statusText = statusText;
    const rateLimitedUntil = toString((parsed as any).rateLimitedUntil);
    if (rateLimitedUntil) out.rateLimitedUntil = rateLimitedUntil;
    const err = toString(parsed.error);
    if (err) out.error = err;
    return out;
  } catch {
    return null;
  }
}

function stringifyJobState(state: ImportJobState): string {
  return JSON.stringify(state);
}

function computeTotalChunks(from: Date, to: Date, windowDays: number): number {
  const spanMs = to.getTime() - from.getTime();
  const chunkMs = windowDays * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(spanMs) || spanMs <= 0 || !Number.isFinite(chunkMs) || chunkMs <= 0) return 1;
  return Math.max(1, Math.ceil(spanMs / chunkMs));
}

async function runPromisePool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results: R[] = new Array(items.length);
  let next = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = next;
      next += 1;
      if (idx >= items.length) break;
      results[idx] = await worker(items[idx], idx);
    }
  });

  await Promise.all(runners);
  return results;
}

async function upsertMetaApiTrades(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  rows: any[],
): Promise<number> {
  let upserted = 0;
  for (let i = 0; i < rows.length; i += IMPORT_UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + IMPORT_UPSERT_CHUNK_SIZE);
    const { data: affected, error: rpcError } = await supabase.rpc("upsert_metaapi_trades", { p_trades: chunk });
    if (rpcError) throw new Error(rpcError.message);
    upserted += typeof affected === "number" ? affected : chunk.length;
  }
  return upserted;
}

const metaApiHistoryLocks = new Map<string, { locked: boolean; waiters: Array<() => void> }>();

async function withMetaApiHistoryLock<T>(accountId: string, work: () => Promise<T>): Promise<T> {
  const key = accountId.trim();
  if (!key) return await work();

  const lock = metaApiHistoryLocks.get(key) ?? { locked: false, waiters: [] };
  metaApiHistoryLocks.set(key, lock);

  if (lock.locked) {
    await new Promise<void>((resolve) => lock.waiters.push(resolve));
  }
  lock.locked = true;

  try {
    return await work();
  } finally {
    const next = lock.waiters.shift();
    if (next) {
      // Hand off the lock without allowing a new caller to barge in.
      next();
    } else {
      lock.locked = false;
      metaApiHistoryLocks.delete(key);
    }
  }
}

async function metaApiFetchDealsByTimeRange(
  accountId: string,
  fromIso: string,
  toIso: string,
  opts?: MetaApiRetryOptions,
): Promise<MetaApiDeal[]> {
  return await withMetaApiHistoryLock(accountId, async () => {
    const base = metaApiClientBaseUrl();
    const url =
      `${base}/users/current/accounts/${encodeURIComponent(accountId)}/history-deals/time/${encodeURIComponent(fromIso)}/${encodeURIComponent(toIso)}`;
    const json = await metaApiJson(url, { method: "GET", headers: metaApiAuthHeaders() }, opts);
    return Array.isArray(json) ? (json as MetaApiDeal[]) : [];
  });
}

function toShortSafeMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : "Unknown error";
  const s = String(raw);
  return s.length > 240 ? `${s.slice(0, 240)}…` : s;
}

type BrokerLiveStatus = "live" | "syncing" | "error" | "stale";

async function brokerLiveUpsert(payload: {
  user_id: string;
  broker: string;
  account_id: string;
  status: BrokerLiveStatus;
  metrics?: Record<string, unknown>;
  exposure?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    // Ensure required env vars exist.
    requireEnv("SUPABASE_URL");
    requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const supabaseAdmin = getSupabaseAdmin();
    const now = new Date().toISOString();

    const metrics = isRecord(payload.metrics) ? payload.metrics : {};
    const exposure = isRecord(payload.exposure) ? payload.exposure : {};
    const meta = isRecord(payload.meta) ? payload.meta : {};

    const row = {
      user_id: payload.user_id,
      broker: payload.broker,
      account_id: payload.account_id,
      status: payload.status,
      last_sync_at: now,
      balance: toNumber((metrics as any).balance),
      equity: toNumber((metrics as any).equity),
      floating_pnl: toNumber((metrics as any).floating_pnl),
      open_positions_count: clampInt((metrics as any).open_positions_count, 0, 1_000_000),
      margin_used: toNumber((metrics as any).margin_used),
      free_margin: toNumber((metrics as any).free_margin),
      exposure,
      meta,
      updated_at: now,
    };

    const { error } = await supabaseAdmin
      .from("broker_live_state")
      .upsert(row, { onConflict: "user_id,broker,account_id" });

    if (error) {
      console.warn("[live-state] upsert failed", { message: error.message, account_id: payload.account_id });
      return;
    }

    console.log("[live-state] direct upsert ok", {
      userId: payload.user_id,
      account_id: payload.account_id,
      status: payload.status,
    });
  } catch (e) {
    console.warn("[live-state] upsert error", { message: toShortSafeMessage(e), account_id: payload.account_id });
  }
}

async function metaApiReadAccountInformation(
  accountId: string,
  opts?: MetaApiRetryOptions,
): Promise<Record<string, unknown>> {
  const base = metaApiClientBaseUrl();
  const url = `${base}/users/current/accounts/${encodeURIComponent(accountId)}/account-information`;
  const json = await metaApiJson(url, { method: "GET", headers: metaApiAuthHeaders() }, opts);
  return isRecord(json) ? (json as Record<string, unknown>) : {};
}

async function metaApiReadPositions(accountId: string, opts?: MetaApiRetryOptions): Promise<any[]> {
  const base = metaApiClientBaseUrl();
  const url = `${base}/users/current/accounts/${encodeURIComponent(accountId)}/positions`;
  const json = await metaApiJson(url, { method: "GET", headers: metaApiAuthHeaders() }, opts);
  return Array.isArray(json) ? json : [];
}

function buildLiveMetricsFromAccountInfo(input: {
  accountInfo: Record<string, unknown>;
  positions: any[];
}): { metrics: Record<string, unknown>; meta: Record<string, unknown> } {
  const balance = toNumber((input.accountInfo as any).balance);
  const equity = toNumber((input.accountInfo as any).equity);
  const marginUsed =
    toNumber((input.accountInfo as any).margin) ??
    toNumber((input.accountInfo as any).marginUsed) ??
    toNumber((input.accountInfo as any).margin_used);
  const freeMargin =
    toNumber((input.accountInfo as any).freeMargin) ??
    toNumber((input.accountInfo as any).free_margin);
  const leverage = toNumber((input.accountInfo as any).leverage);
  const marginLevel =
    toNumber((input.accountInfo as any).marginLevel) ??
    toNumber((input.accountInfo as any).margin_level);

  const floatingPnl =
    equity !== null && balance !== null && Number.isFinite(equity) && Number.isFinite(balance) ? equity - balance : null;

  const metrics: Record<string, unknown> = {
    balance,
    equity,
    floating_pnl: floatingPnl,
    margin_used: marginUsed,
    free_margin: freeMargin,
    open_positions_count: Array.isArray(input.positions) ? input.positions.length : 0,
  };

  const meta: Record<string, unknown> = {
    broker_name: toString((input.accountInfo as any).broker),
    currency: toString((input.accountInfo as any).currency),
    leverage: leverage ?? undefined,
    margin_level: marginLevel ?? undefined,
    account_login: toString((input.accountInfo as any).login),
    server: toString((input.accountInfo as any).server),
  };

  return { metrics, meta };
}

function dealKey(positionId: string, ticket: string): string {
  return `${positionId}:${ticket}`;
}

async function fetchTradeCountByLogin(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  login: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("trades")
    .select("id", { head: true, count: "exact" })
    .eq("user_id", userId)
    .eq("broker_provider", PROVIDER)
    .eq("account_login", login);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function handleStatus(c: any): Promise<Response> {
  try {
    const userId = await requireUserId(c.req.raw);
    const supabase = getSupabaseAdmin();

    const connectionId = toString(c.req.query("connectionId"));
    if (connectionId) {
      const { data: conn, error: connErr } = await supabase
        .from("broker_connections")
        .select("id,status,last_import_at,login")
        .eq("id", connectionId)
        .eq("user_id", userId)
        .eq("provider", PROVIDER)
        .maybeSingle();

      if (connErr) return fail(c, 500, connErr.message);
      if (!conn) return fail(c, 404, "Connection not found.", "not_found");

      const accountLogin = toString((conn as any).login);
      const tradesForConnection = accountLogin ? await fetchTradeCountByLogin(supabase, userId, accountLogin) : 0;

      const { count: totalTrades, error: totalErr } = await supabase
        .from("trades")
        .select("id", { head: true, count: "exact" })
        .eq("user_id", userId);
      if (totalErr) return fail(c, 500, totalErr.message);

      return ok(c, {
        connection_status: (conn as any).status,
        last_import_at: (conn as any).last_import_at ?? null,
        trades_imported_total_for_connection: tradesForConnection,
        trades_total_for_user: totalTrades ?? 0,
      });
    }

    const { data: connections, error } = await supabase
      .from("broker_connections")
      .select("id,provider,metaapi_account_id,platform,environment,server,login,status,last_import_at,created_at,updated_at")
      .eq("user_id", userId)
      .eq("provider", PROVIDER)
      .not("metaapi_account_id", "is", null)
      .order("created_at", { ascending: false })
      .returns<BrokerConnectionRow[]>();

    if (error) return fail(c, 500, error.message);
    const enriched: BrokerConnectionRow[] = [];
    for (const conn of connections ?? []) {
      const login = toString(conn.login);
      const tradeCount = login ? await fetchTradeCountByLogin(supabase, userId, login) : 0;
      enriched.push({ ...conn, trade_count: tradeCount });
    }
    return ok(c, { connections: enriched });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error.";
    if (message.toLowerCase().includes("authorization")) return fail(c, 401, "Unauthorized.", "unauthorized");
    return fail(c, 500, message);
  }
}

async function metaApiCreateAccount(input: {
  login: string;
  password: string;
  server: string;
  platform: MtPlatform;
  name: string;
  cloudType: string;
  magic: number;
}): Promise<string> {
  const url = `${metaApiProvisioningBaseUrl()}/users/current/accounts`;
  const json = await metaApiJson(url, {
    method: "POST",
    headers: { ...metaApiAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      login: input.login,
      password: input.password,
      name: input.name,
      server: input.server,
      platform: input.platform,
      type: input.cloudType,
      // MetaApi provisioning requires `magic` for account identification in MT terminals.
      // We generate it deterministically per user+account.
      magic: input.magic,
    }),
  });
  const id = toString(json?.id ?? json?._id ?? json?.accountId);
  if (!id) throw new Error("MetaApi account create returned no id.");
  return id;
}

async function metaApiDeployAccount(accountId: string): Promise<void> {
  const url = `${metaApiProvisioningBaseUrl()}/users/current/accounts/${encodeURIComponent(accountId)}/deploy`;
  await metaApiJson(url, { method: "POST", headers: metaApiAuthHeaders() });
}

async function metaApiReadAccount(accountId: string): Promise<any> {
  const url = `${metaApiProvisioningBaseUrl()}/users/current/accounts/${encodeURIComponent(accountId)}`;
  return await metaApiJson(url, { method: "GET", headers: metaApiAuthHeaders() });
}

async function metaApiWaitForDeployed(accountId: string, timeoutMs = 120_000): Promise<{ status: BrokerStatus }> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const account = await metaApiReadAccount(accountId);
    const state = (toString(account?.state) ?? "").toUpperCase();
    if (state === "DEPLOYED") return { status: "connected" };
    if (state === "DEPLOY_FAILED") return { status: "error" };
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { status: "deploying" };
}

async function handleConnect(c: any, body: Record<string, unknown>): Promise<Response> {
  try {
    const userId = await requireUserId(c.req.raw);

    const server = toString(body.server);
    const login = toString(body.login);
    const password = toString(body.password);
    const platform = normalizePlatform(toString(body.platform) ?? "");
    const environment = normalizeEnvironment(toString(body.environment) ?? toString(body.accountType) ?? "");
    const cloudTypeRaw = toString(body.type) ?? "cloud-g2";
    const cloudType = normalizeCloudType(cloudTypeRaw);

    if (!server || !login || !password || !platform || !environment) {
      return fail(c, 400, "Missing platform, environment (demo/live), server, login, or password.", "bad_request");
    }
    if (!cloudType) {
      return fail(c, 400, 'Invalid MetaApi cloud type. Use "cloud-g1" or "cloud-g2".', "bad_request");
    }

    // Ensure required secrets exist.
    metaApiClientBaseUrl();
    metaApiProvisioningBaseUrl();
    requireEnv("METAAPI_TOKEN");

    const supabase = getSupabaseAdmin();

    // Reuse an existing connection if present.
    const { data: existing } = await supabase
      .from("broker_connections")
      .select("id,provider,metaapi_account_id,platform,environment,server,login,status,last_import_at,created_at,updated_at,user_id")
      .eq("user_id", userId)
      .eq("provider", PROVIDER)
      .eq("server", server)
      .eq("login", login)
      .eq("platform", platform)
      .eq("environment", environment)
      .maybeSingle<BrokerConnectionRow>();

    if (existing?.id && existing.metaapi_account_id) {
      return ok(c, { connection: existing });
    }

    const name = `TJ ${userId} ${platform.toUpperCase()} ${environment.toUpperCase()} ${login}@${server}`;
    console.log("[broker-import] connect: creating metaapi account", { userId, platform, environment, server, login });

    const magic = magicForConnection({ userId, platform, environment, server, login });
    const metaapiAccountId = await metaApiCreateAccount({
      login,
      password,
      server,
      platform,
      name,
      cloudType,
      magic,
    });

    const { data: inserted, error: insertError } = await supabase
      .from("broker_connections")
      .insert({
        user_id: userId,
        provider: PROVIDER,
        metaapi_account_id: metaapiAccountId,
        platform,
        environment,
        server,
        login,
        status: "new",
      })
      .select("id,provider,metaapi_account_id,platform,environment,server,login,status,last_import_at,created_at,updated_at")
      .single();

    if (insertError || !inserted) return fail(c, 500, insertError?.message ?? "Failed to save connection.");

    await supabase.from("broker_connections").update({ status: "deploying" }).eq("id", inserted.id);
    await metaApiDeployAccount(metaapiAccountId);

    const deployed = await metaApiWaitForDeployed(metaapiAccountId);
    await supabase.from("broker_connections").update({ status: deployed.status }).eq("id", inserted.id);

    const { data: fresh } = await supabase
      .from("broker_connections")
      .select("id,provider,metaapi_account_id,platform,environment,server,login,status,last_import_at,created_at,updated_at")
      .eq("id", inserted.id)
      .single();

    // Best-effort: seed/refresh live broker state so the dashboard can show real data.
    // Never log or persist passwords.
    try {
      if (deployed.status === "connected") {
        const accountInfo = await metaApiReadAccountInformation(metaapiAccountId);
        const positions = await metaApiReadPositions(metaapiAccountId);
        const { metrics, meta } = buildLiveMetricsFromAccountInfo({ accountInfo, positions });
        await brokerLiveUpsert({
          user_id: userId,
          broker: PROVIDER,
          account_id: metaapiAccountId,
          status: "live",
          metrics,
          meta: {
            ...meta,
            platform,
            environment,
            server,
            login,
          },
        });
      } else {
        await brokerLiveUpsert({
          user_id: userId,
          broker: PROVIDER,
          account_id: metaapiAccountId,
          status: deployed.status === "error" ? "error" : "syncing",
          meta: {
            platform,
            environment,
            server,
            login,
            connection_status: deployed.status,
          },
        });
      }
    } catch (e) {
      if (e instanceof MetaApiRateLimitPauseError) {
        await brokerLiveUpsert({
          user_id: userId,
          broker: PROVIDER,
          account_id: metaapiAccountId,
          status: "stale",
          meta: {
            platform,
            environment,
            server,
            login,
            rate_limited_until: e.retryAt,
            message: "Rate limited fetching live metrics",
          },
        });
      } else {
        await brokerLiveUpsert({
          user_id: userId,
          broker: PROVIDER,
          account_id: metaapiAccountId,
          status: "error",
          meta: {
            platform,
            environment,
            server,
            login,
            message: toShortSafeMessage(e),
          },
        });
      }
    }

    console.log("[broker-import] connect done", { userId, connectionId: inserted.id, status: deployed.status });
    return ok(c, { connection: fresh ?? inserted });
  } catch (e) {
    console.error("[broker-import] connect error", e);
    const message = e instanceof Error ? e.message : "Server error.";
    const status = (e as any)?.status;
    if (message.toLowerCase().includes("authorization")) return fail(c, 401, "Unauthorized.", "unauthorized");
    return fail(c, Number.isFinite(status) ? status : 500, message, "connect_error", {
      meta: (e as any)?.meta,
    });
  }
}

async function handleImport(c: any, body: Record<string, unknown>): Promise<Response> {
  try {
    const userId = await requireUserId(c.req.raw);

    const connectionId = toString(body.connectionId);
    const fromRaw = toString(body.from);
    const toRaw = toString(body.to);

    if (!connectionId) return fail(c, 400, "Missing connectionId.", "bad_request");

    const supabase = getSupabaseAdmin();
    const { data: connection, error } = await supabase
      .from("broker_connections")
      .select("id,metaapi_account_id,platform,environment,server,login,status,user_id")
      .eq("id", connectionId)
      .eq("user_id", userId)
      .eq("provider", PROVIDER)
      .maybeSingle();

    if (error) return fail(c, 500, error.message);
    if (!connection) return fail(c, 404, "Connection not found.", "not_found");

    const accountId = toString((connection as any).metaapi_account_id);
    const accountLogin = toString((connection as any).login);
    if (!accountId || !accountLogin) return fail(c, 500, "Connection missing MetaApi account id/login.");

    const from = fromRaw ? new Date(fromRaw) : new Date("2000-01-01T00:00:00.000Z");
    const to = toRaw ? new Date(toRaw) : new Date();
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      return fail(c, 400, "Invalid from/to range.", "bad_request");
    }

    const total = computeTotalChunks(from, to, IMPORT_WINDOW_DAYS);
    const state: ImportJobState = {
      from: from.toISOString(),
      to: to.toISOString(),
      windowDays: IMPORT_WINDOW_DAYS,
      fetchedTotal: 0,
      upsertedTotal: 0,
      metaapiAccountId: accountId,
      accountLogin,
    };

    const { data: job, error: jobErr } = await supabase
      .from("import_jobs")
      .insert({
        user_id: userId,
        connection_id: connectionId,
        status: "queued",
        progress: 0,
        total,
        message: stringifyJobState(state),
      })
      .select("id,user_id,connection_id,status,progress,total,message,created_at,updated_at")
      .single<ImportJobRow>();

    if (jobErr || !job) return fail(c, 500, jobErr?.message ?? "Failed to create import job.");

    console.log("[broker-import] import queued", { userId, connectionId, jobId: job.id, totalChunks: total });
    return ok(c, { job });
  } catch (e) {
    console.error("[broker-import] import error", e);
    const message = e instanceof Error ? e.message : "Server error.";
    const status = (e as any)?.status;
    if (message.toLowerCase().includes("authorization")) return fail(c, 401, "Unauthorized.", "unauthorized");
    return fail(c, Number.isFinite(status) ? status : 500, message, "import_error", {
      meta: (e as any)?.meta,
    });
  }
}

async function handleQuickImport(c: any, body: Record<string, unknown>): Promise<Response> {
  try {
    const userId = await requireUserId(c.req.raw);
    const connectionId = toString(body.connectionId);
    if (!connectionId) return fail(c, 400, "Missing connectionId.", "bad_request");

    const days = clampInt(body.days, 1, 90) ?? QUICK_IMPORT_DAYS_DEFAULT;
    const now = new Date();
    const from = new Date(now);
    from.setUTCDate(from.getUTCDate() - days);

    const supabase = getSupabaseAdmin();
    const { data: connection, error } = await supabase
      .from("broker_connections")
      .select("id,metaapi_account_id,platform,environment,server,login,status,user_id")
      .eq("id", connectionId)
      .eq("user_id", userId)
      .eq("provider", PROVIDER)
      .maybeSingle();

    if (error) return fail(c, 500, error.message);
    if (!connection) return fail(c, 404, "Connection not found.", "not_found");

    const accountId = toString((connection as any).metaapi_account_id);
    const accountLogin = toString((connection as any).login);
    if (!accountId || !accountLogin) return fail(c, 500, "Connection missing MetaApi account id/login.");

    const windowDays = Math.max(1, Math.min(days, QUICK_IMPORT_WINDOW_DAYS));
    const total = computeTotalChunks(from, now, windowDays);

    const state: ImportJobState = {
      from: from.toISOString(),
      to: now.toISOString(),
      windowDays,
      fetchedTotal: 0,
      upsertedTotal: 0,
      metaapiAccountId: accountId,
      accountLogin,
    };

    const { data: job, error: jobErr } = await supabase
      .from("import_jobs")
      .insert({
        user_id: userId,
        connection_id: connectionId,
        status: "queued",
        progress: 0,
        total,
        message: stringifyJobState(state),
      })
      .select("id,user_id,connection_id,status,progress,total,message,created_at,updated_at")
      .single<ImportJobRow>();

    if (jobErr || !job) return fail(c, 500, jobErr?.message ?? "Failed to create import job.");

    console.log("[broker-import] quick import queued", {
      userId,
      connectionId,
      jobId: job.id,
      days,
      windowDays,
      totalChunks: total,
    });

    return ok(c, {
      job,
      range: { from: state.from, to: state.to, days, windowDays },
    });
  } catch (e) {
    console.error("[broker-import] quick import error", e);
    const message = e instanceof Error ? e.message : "Server error.";
    const status = (e as any)?.status;
    if (message.toLowerCase().includes("authorization")) return fail(c, 401, "Unauthorized.", "unauthorized");
    return fail(c, Number.isFinite(status) ? status : 500, message, "quick_import_error", {
      meta: (e as any)?.meta,
    });
  }
}

async function buildTradeRowsFromDeals(input: {
  deals: MetaApiDeal[];
  userId: string;
  accountLogin: string;
}): Promise<any[]> {
  const dealsByPosition = new Map<string, MetaApiDeal[]>();
  for (const d of input.deals) {
    const positionId = toString(d.positionId) ?? toString(d.orderId) ?? toString(d.id);
    if (!positionId) continue;
    const list = dealsByPosition.get(positionId) ?? [];
    list.push(d);
    dealsByPosition.set(positionId, list);
  }

  const rows: any[] = [];
  const seen = new Set<string>();

  for (const [positionId, list] of dealsByPosition) {
    const sorted = [...list].sort((a, b) => {
      const at = Date.parse(toString(a.time) ?? "");
      const bt = Date.parse(toString(b.time) ?? "");
      return (Number.isFinite(at) ? at : 0) - (Number.isFinite(bt) ? bt : 0);
    });

    const entryDeal =
      sorted.find((d) => (toString(d.entryType) ?? "").toUpperCase() === "DEAL_ENTRY_IN") ?? sorted[0];

    const entryPrice = toNumber(entryDeal?.price) ?? 0;
    const entryTime = toString(entryDeal?.time);
    const dir = mapDealDirection(toString(entryDeal?.type) ?? "") ?? "long";

    for (const d of sorted) {
      const ticket = toString(d.id);
      const symbolRaw = toString(d.symbol);
      const entryTypeRaw = toString(d.entryType);
      const closeTime = toString(d.time);
      if (!ticket || !symbolRaw || !entryTypeRaw || !closeTime) continue;
      if (!isClosingDeal(entryTypeRaw)) continue;

      const closePrice = toNumber(d.price) ?? entryPrice;
      const volume = toNumber(d.volume) ?? 0;
      const profit = toNumber(d.profit) ?? 0;
      const commission = toNumber(d.commission) ?? 0;
      const swap = toNumber(d.swap) ?? 0;
      const pnl = profit + commission + swap;

      const k = dealKey(positionId, ticket);
      if (seen.has(k)) continue;
      seen.add(k);

      rows.push({
        user_id: input.userId,
        broker_provider: PROVIDER,
        account_login: input.accountLogin,
        ticket,
        position_id: positionId,
        open_time: entryTime ?? null,
        close_time: closeTime,
        commission: commission || null,
        swap: swap || null,

        date: toIsoDate(closeTime),
        symbol: normalizeSymbol(symbolRaw),
        type: dir,
        entry: entryPrice,
        exit: closePrice,
        quantity: volume,
        outcome: outcomeFromPnL(pnl),
        pnl,
        pnl_percentage: pnlPercentage(entryPrice, closePrice, dir),
        notes: `Imported via MetaApi (deal ${ticket}, position ${positionId})`,
      });
    }
  }

  return rows;
}

async function handleImportJob(c: any, body?: Record<string, unknown>): Promise<Response> {
  try {
    const userId = await requireUserId(c.req.raw);
    const jobId =
      toString(body?.jobId) ??
      toString(c.req.query("jobId")) ??
      toString(c.req.query("id"));
    if (!jobId) return fail(c, 400, "Missing jobId.", "bad_request");

    const supabase = getSupabaseAdmin();
    const { data: job, error } = await supabase
      .from("import_jobs")
      .select("id,user_id,connection_id,status,progress,total,message,created_at,updated_at")
      .eq("id", jobId)
      .eq("user_id", userId)
      .single<ImportJobRow>();

    if (error) return fail(c, 500, error.message);
    return ok(c, { job });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error.";
    if (message.toLowerCase().includes("authorization")) return fail(c, 401, "Unauthorized.", "unauthorized");
    return fail(c, 500, message);
  }
}

async function handleImportContinue(c: any, body: Record<string, unknown>): Promise<Response> {
  const jobId = toString(body.jobId);
  if (!jobId) return fail(c, 400, "Missing jobId.", "bad_request");

  const supabase = getSupabaseAdmin();
  let userId: string | null = null;
  let job: ImportJobRow | null = null;
  let state: ImportJobState | null = null;

  try {
    userId = await requireUserId(c.req.raw);
    const { data: loaded, error } = await supabase
      .from("import_jobs")
      .select("id,user_id,connection_id,status,progress,total,message,created_at,updated_at")
      .eq("id", jobId)
      .eq("user_id", userId)
      .single<ImportJobRow>();
    if (error) return fail(c, 500, error.message);
    job = loaded;

    if (job.status === "succeeded" || job.status === "failed") {
      return ok(c, { job });
    }

    state = parseJobState(job.message) ?? {
      from: new Date("2000-01-01T00:00:00.000Z").toISOString(),
      to: new Date().toISOString(),
      windowDays: IMPORT_WINDOW_DAYS,
      fetchedTotal: 0,
      upsertedTotal: 0,
    };

    const from = new Date(state.from);
    const to = new Date(state.to);
    const windowDays = Math.max(1, Math.min(180, Math.floor(state.windowDays || IMPORT_WINDOW_DAYS)));
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      return fail(c, 500, "Import job has an invalid date range.", "job_invalid");
    }

    if (state.rateLimitedUntil) {
      const untilMs = Date.parse(state.rateLimitedUntil);
      if (Number.isFinite(untilMs)) {
        if (untilMs <= Date.now()) {
          delete state.statusText;
          delete state.rateLimitedUntil;
        } else {
          return ok(c, {
            status: "rate_limited",
            retryAt: state.rateLimitedUntil,
            message: "Rate limited, retrying soon",
            job,
          });
        }
      }
    }

    const chunkIndex = job.progress;
    if (chunkIndex >= job.total) {
      const { data: updated } = await supabase
        .from("import_jobs")
        .update({ status: "succeeded" })
        .eq("id", jobId)
        .eq("user_id", userId)
        .select("id,user_id,connection_id,status,progress,total,message,created_at,updated_at")
        .single<ImportJobRow>();
      return ok(c, { job: updated ?? { ...job, status: "succeeded" } });
    }

    const connectionId = job.connection_id;
    let accountId = toString(state.metaapiAccountId);
    let accountLogin = toString(state.accountLogin);

    if (!accountId || !accountLogin) {
      const { data: connection, error: connErr } = await supabase
        .from("broker_connections")
        .select("metaapi_account_id,login")
        .eq("id", connectionId)
        .eq("user_id", userId)
        .eq("provider", PROVIDER)
        .maybeSingle();

      if (connErr) return fail(c, 500, connErr.message);
      if (!connection) return fail(c, 404, "Connection not found for this job.", "not_found");

      accountId = toString((connection as any).metaapi_account_id);
      accountLogin = toString((connection as any).login);
      if (accountId) state.metaapiAccountId = accountId;
      if (accountLogin) state.accountLogin = accountLogin;
    }

    if (!accountId || !accountLogin) return fail(c, 500, "Connection missing MetaApi account id/login.");

    await supabase.from("import_jobs").update({ status: "running" }).eq("id", jobId).eq("user_id", userId);

    const work: Array<{ index: number; start: Date; end: Date }> = [];
    for (let i = 0; i < IMPORT_CONTINUE_MAX_CHUNKS; i++) {
      const idx = chunkIndex + i;
      if (idx >= job.total) break;
      const start = addDays(from, idx * windowDays);
      if (start >= to) break;
      const end = addDays(start, windowDays) < to ? addDays(start, windowDays) : to;
      work.push({ index: idx, start, end });
    }

    if (!work.length) {
      const { data: updated } = await supabase
        .from("import_jobs")
        .update({ status: "succeeded", progress: job.total })
        .eq("id", jobId)
        .eq("user_id", userId)
        .select("id,user_id,connection_id,status,progress,total,message,created_at,updated_at")
        .single<ImportJobRow>();
      return ok(c, { job: updated ?? { ...job, status: "succeeded", progress: job.total } });
    }

    const rateLimitTracker = { lastDbUpdateMs: 0 };
    const onRateLimit = async (ctx: MetaApiRetryContext) => {
      state.statusText = "Rate limited, retrying…";
      state.rateLimitedUntil = new Date(Date.now() + ctx.retryAfterMs).toISOString();

      const nowMs = Date.now();
      if (nowMs - rateLimitTracker.lastDbUpdateMs < 4_000) return;
      rateLimitTracker.lastDbUpdateMs = nowMs;

      const { error: updateErr } = await supabase
        .from("import_jobs")
        .update({ message: stringifyJobState(state) })
        .eq("id", jobId)
        .eq("user_id", userId);
      if (updateErr) {
        console.warn("[broker-import] failed to persist rate limit status", updateErr);
      }
    };

    // Best-effort: refresh Live Broker Matrix metrics during import.
    // If MetaApi is rate limited, mark the live state as stale but do not fail the import.
    try {
      const accountInfo = await metaApiReadAccountInformation(accountId, { onRateLimit });
      const positions = await metaApiReadPositions(accountId, { onRateLimit });
      const { metrics, meta } = buildLiveMetricsFromAccountInfo({ accountInfo, positions });
      await brokerLiveUpsert({
        user_id: userId,
        broker: PROVIDER,
        account_id: accountId,
        status: "live",
        metrics,
        meta: {
          ...meta,
          account_login: accountLogin,
        },
      });
    } catch (e) {
      if (e instanceof MetaApiRateLimitPauseError) {
        await brokerLiveUpsert({
          user_id: userId,
          broker: PROVIDER,
          account_id: accountId,
          status: "stale",
          meta: {
            account_login: accountLogin,
            rate_limited_until: e.retryAt,
            message: "Rate limited fetching live metrics",
          },
        });
      } else {
        await brokerLiveUpsert({
          user_id: userId,
          broker: PROVIDER,
          account_id: accountId,
          status: "error",
          meta: {
            account_login: accountLogin,
            message: toShortSafeMessage(e),
          },
        });
      }
    }

    const results: Array<{ index: number; start: Date; end: Date; fetched: number; upserted: number }> = [];
    let rateLimited: { retryAt: string; message: string } | null = null;

    for (const chunk of work) {
      console.log("[broker-import] import chunk", {
        userId,
        jobId,
        connectionId,
        chunkIndex: chunk.index,
        window: { from: chunk.start.toISOString(), to: chunk.end.toISOString() },
      });

      try {
        const deals = await metaApiFetchDealsByTimeRange(
          accountId,
          toMetaApiTimeString(chunk.start),
          toMetaApiTimeString(chunk.end),
          { onRateLimit },
        );
        const rows = await buildTradeRowsFromDeals({ deals, userId, accountLogin });
        const upserted = rows.length ? await upsertMetaApiTrades(supabase, rows) : 0;

        console.log("[broker-import] import chunk done", {
          userId,
          jobId,
          chunkIndex: chunk.index,
          fetched: deals.length,
          upserted,
        });

        results.push({ index: chunk.index, start: chunk.start, end: chunk.end, fetched: deals.length, upserted });
      } catch (e) {
        if (e instanceof MetaApiRateLimitPauseError) {
          state.statusText = "Rate limited, retrying…";
          state.rateLimitedUntil = e.retryAt;
          if (state.error) delete state.error;
          rateLimited = { retryAt: e.retryAt, message: e.message };

          await brokerLiveUpsert({
            user_id: userId,
            broker: PROVIDER,
            account_id: accountId,
            status: "stale",
            meta: {
              account_login: accountLogin,
              rate_limited_until: e.retryAt,
              message: "Rate limited during import",
            },
          });
          break;
        }
        throw e;
      }
    }

    let fetched = 0;
    let upserted = 0;
    for (const r of results) {
      fetched += r.fetched;
      upserted += r.upserted;
    }

    state.fetchedTotal += fetched;
    state.upsertedTotal += upserted;

    const last = results.length ? results[results.length - 1] : null;
    if (last) {
      state.lastChunk = {
        from: last.start.toISOString(),
        to: last.end.toISOString(),
        fetched: last.fetched,
        upserted: last.upserted,
      };
    }
    if (!rateLimited) {
      if (state.statusText) delete state.statusText;
      if (state.rateLimitedUntil) delete state.rateLimitedUntil;
    }
    if (state.error) delete state.error;

    const nextProgress = chunkIndex + results.length;
    const done = nextProgress >= job.total || (last ? last.end >= to : false);
    const nextStatus: ImportJobStatus = done ? "succeeded" : "running";

    const { data: updatedJob, error: updateErr } = await supabase
      .from("import_jobs")
      .update({
        status: nextStatus,
        progress: done ? job.total : nextProgress,
        message: stringifyJobState(state),
      })
      .eq("id", jobId)
      .eq("user_id", userId)
      .select("id,user_id,connection_id,status,progress,total,message,created_at,updated_at")
      .single<ImportJobRow>();

    if (updateErr) return fail(c, 500, updateErr.message);

    if (done) {
      const now = new Date().toISOString();
      await supabase
        .from("broker_connections")
        .update({ last_import_at: now, status: "imported" })
        .eq("id", connectionId)
        .eq("user_id", userId);
    }

    if (rateLimited) {
      return ok(c, {
        status: "rate_limited",
        retryAt: rateLimited.retryAt,
        message: "Rate limited, retrying soon",
        job: updatedJob,
      });
    }

    return ok(c, { job: updatedJob, chunk: { fetched, upserted } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Import failed.";
    const status = (e as any)?.status;
    console.error("[broker-import] import continue error", e);

    if (userId && state?.metaapiAccountId) {
      await brokerLiveUpsert({
        user_id: userId,
        broker: PROVIDER,
        account_id: state.metaapiAccountId,
        status: e instanceof MetaApiRateLimitPauseError ? "stale" : "error",
        meta: {
          account_login: state.accountLogin,
          message: e instanceof MetaApiRateLimitPauseError ? "Rate limited during import" : toShortSafeMessage(e),
          ...(e instanceof MetaApiRateLimitPauseError ? { rate_limited_until: e.retryAt } : {}),
        },
      });
    }

    if (userId && job) {
      if (e instanceof MetaApiRateLimitPauseError) {
        const nextState =
          state ??
          parseJobState(job.message) ?? {
            from: new Date("2000-01-01T00:00:00.000Z").toISOString(),
            to: new Date().toISOString(),
            windowDays: IMPORT_WINDOW_DAYS,
            fetchedTotal: 0,
            upsertedTotal: 0,
          };
        nextState.statusText = "Rate limited, retrying…";
        nextState.rateLimitedUntil = e.retryAt;
        if (nextState.error) delete nextState.error;

        const { data: updatedRateLimitedJob } = await supabase
          .from("import_jobs")
          .update({ status: "running", message: stringifyJobState(nextState) })
          .eq("id", jobId)
          .eq("user_id", userId)
          .select("id,user_id,connection_id,status,progress,total,message,created_at,updated_at")
          .single<ImportJobRow>();

        return ok(c, {
          status: "rate_limited",
          retryAt: e.retryAt,
          message: "Rate limited, retrying soon",
          job:
            updatedRateLimitedJob ??
            ({
              ...job,
              status: "running",
              message: stringifyJobState(nextState),
            } as ImportJobRow),
        });
      }

      const nextState =
        state ??
        parseJobState(job.message) ?? {
          from: new Date("2000-01-01T00:00:00.000Z").toISOString(),
          to: new Date().toISOString(),
          windowDays: IMPORT_WINDOW_DAYS,
          fetchedTotal: 0,
          upsertedTotal: 0,
        };
      nextState.error = message;

      const { data: failedJob } = await supabase
        .from("import_jobs")
        .update({ status: "failed", message: stringifyJobState(nextState) })
        .eq("id", jobId)
        .eq("user_id", userId)
        .select("id,user_id,connection_id,status,progress,total,message,created_at,updated_at")
        .single<ImportJobRow>();

      return ok(c, { job: failedJob ?? { ...job, status: "failed", message: stringifyJobState(nextState) } });
    }

    if (message.toLowerCase().includes("authorization")) return fail(c, 401, "Unauthorized.", "unauthorized");
    return fail(c, Number.isFinite(status) ? status : 500, message, "import_continue_error", {
      meta: (e as any)?.meta,
    });
  }
}

async function handleAction(c: any): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  if (!isRecord(body)) return fail(c, 400, "Invalid JSON body.", "bad_request");
  const action = toString(body.action);
  if (!action) return fail(c, 400, "Missing action.", "bad_request");

  if (action === "status") return handleStatus(c);
  if (action === "connect") return handleConnect(c, body);
  if (action === "import") return handleImport(c, body);
  if (action === "quick_import") return handleQuickImport(c, body);
  if (action === "import_continue") return handleImportContinue(c, body);
  if (action === "import_job") return handleImportJob(c, body);

  return fail(c, 400, `Unknown action: ${action}`, "bad_request");
}

app.onError((err, c) => {
  console.error("[broker-import] unhandled error", err);
  return fail(c, 500, "Server error.", "server_error");
});

app.notFound((c) => fail(c, 404, "Not found.", "not_found"));

// Action-based router (preferred for supabase.functions.invoke("broker-import")).
app.post("/", handleAction);
app.post("/broker-import", handleAction);

// Path-based routes (curl/manual testing + compatibility).
app.get("/status", handleStatus);
app.get("/broker-import/status", handleStatus);

app.post("/connect", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!isRecord(body)) return fail(c, 400, "Invalid JSON body.", "bad_request");
  return handleConnect(c, body);
});
app.post("/broker-import/connect", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!isRecord(body)) return fail(c, 400, "Invalid JSON body.", "bad_request");
  return handleConnect(c, body);
});

app.post("/import", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!isRecord(body)) return fail(c, 400, "Invalid JSON body.", "bad_request");
  return handleImport(c, body);
});
app.post("/broker-import/import", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!isRecord(body)) return fail(c, 400, "Invalid JSON body.", "bad_request");
  return handleImport(c, body);
});

app.post("/import/continue", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!isRecord(body)) return fail(c, 400, "Invalid JSON body.", "bad_request");
  return handleImportContinue(c, body);
});
app.post("/broker-import/import/continue", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!isRecord(body)) return fail(c, 400, "Invalid JSON body.", "bad_request");
  return handleImportContinue(c, body);
});

app.get("/import/job", handleImportJob);
app.get("/broker-import/import/job", handleImportJob);

Deno.serve(app.fetch);
