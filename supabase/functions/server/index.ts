import { Hono } from "npm:hono";
import * as kv from "./kv_store.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
const app = new Hono();

type MtPlatform = "MT4" | "MT5";

type MtConnectionRecord = {
  userId: string;
  platform: MtPlatform;
  server: string;
  account: string;
  accountType?: "live" | "demo";
  autoSync: boolean;
  metaapiAccountId?: string;
  connectedAt: string;
  lastSyncAt?: string;
};

type MtConnectionByKey = MtConnectionRecord & {
  syncKey: string;
  syncUrl: string;
};

type ProfileRow = {
  subscription_plan: "free" | "pro" | "premium";
  trial_start_at: string | null;
};

type IncomingTrade = Record<string, unknown>;

const MT_CONNECTION_BY_USER_PREFIX = "mt_user:";
const MT_CONNECTION_BY_KEY_PREFIX = "mt_sync:";
const MT_RATE_LIMIT_PREFIX = "mt_rl:";
const MAKE_SERVER_PREFIX = "/make-server-a46fa5d6";

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name} env var.`);
  return value;
}

function safeTrimTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, "");
}

function getServerSyncUrl(): string {
  const base = safeTrimTrailingSlashes(requireEnv("SUPABASE_URL"));
  return `${base}/functions/v1/server${MAKE_SERVER_PREFIX}/mt/sync`;
}

function parseOptionalOrigin(raw: string): string | null {
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

const CORS_ALLOWED_ORIGINS = (() => {
  const origins = new Set<string>([
    "http://localhost:5173",
    "http://localhost:3000",
  ]);

  const siteUrl = Deno.env.get("SITE_URL");
  if (siteUrl) {
    const origin = parseOptionalOrigin(siteUrl);
    if (origin) origins.add(origin);
  }

  return origins;
})();

function corsHeadersForRequest(c: any): Record<string, string> {
  const origin = c.req.header("Origin");

  // Webhook/EAs won't send an Origin header → allow wildcard.
  // Browsers will send Origin → allow only known origins.
  const allowOrigin = origin ? (CORS_ALLOWED_ORIGINS.has(origin) ? origin : "null") : "*";

  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-tj-sync-key",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };

  if (origin) headers.Vary = "Origin";
  return headers;
}

function jsonResponse(c: any, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeadersForRequest(c),
      "Content-Type": "application/json",
    },
  });
}

function ok(c: any, data: unknown) {
  return jsonResponse(c, 200, { ok: true, data });
}

function errorCodeForStatus(status: number): string {
  if (status === 400) return "bad_request";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 413) return "payload_too_large";
  if (status === 429) return "rate_limited";
  return "server_error";
}

function fail(
  c: any,
  status: number,
  error: string,
  code?: string,
  details?: Record<string, unknown>,
) {
  return jsonResponse(c, status, {
    ok: false,
    error,
    code: code ?? errorCodeForStatus(status),
    ...(details ? { details } : {}),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getBearerToken(authHeader: string | undefined | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function getSupabaseAdmin() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));
}

async function requireUserIdFromRequest(c: any): Promise<string> {
  const token = getBearerToken(c.req.header("Authorization"));
  if (!token) {
    throw new Error("Missing Authorization bearer token.");
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) {
    throw new Error("Invalid Authorization token.");
  }
  return data.user.id;
}

function base64UrlEncode(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function generateSyncKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function normalizeSymbol(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[^0-9.+-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function toString(value: unknown): string | null {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = toString(record[key]);
    if (value) return value;
  }
  return null;
}

function pickNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = toNumber(record[key]);
    if (value !== null) return value;
  }
  return null;
}

function parseMtDateToIsoDate(value: string): string | null {
  const raw = value.trim();

  const mtPattern =
    /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/;
  const match = raw.match(mtPattern);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return `${year}-${mm}-${dd}`;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().split("T")[0] ?? null;
}

async function deterministicUuid(seed: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
  const bytes = new Uint8Array(digest).slice(0, 16);
  // Set RFC 4122 variant + version (v4-style) for nicer formatting.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20)}`;
}

function mapTradeType(value: string): "long" | "short" | null {
  const lower = value.toLowerCase();
  if (lower.includes("sell") || lower.includes("short")) return "short";
  if (lower.includes("buy") || lower.includes("long")) return "long";
  return null;
}

function outcomeFromPnL(pnl: number): "win" | "loss" | "breakeven" {
  if (pnl > 0) return "win";
  if (pnl < 0) return "loss";
  return "breakeven";
}

function pnlPercentage(entry: number, exit: number, type: "long" | "short"): number {
  if (!Number.isFinite(entry) || entry === 0) return 0;
  const raw = ((exit - entry) / entry) * 100;
  return type === "short" ? -raw : raw;
}

async function metaapiFindAccountId(input: { account: string; server: string }): Promise<string> {
  const baseUrl = safeTrimTrailingSlashes(requireEnv("METAAPI_BASE_URL"));
  if (!baseUrl.includes("mt-client-api-v1")) {
    throw new Error(
      'METAAPI_BASE_URL must point to "mt-client-api-v1" (e.g. https://mt-client-api-v1.london.agiliumtrade.ai).',
    );
  }
  const token = requireEnv("METAAPI_TOKEN");

  const res = await fetch(`${baseUrl}/users/current/accounts`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = json?.message ?? `MetaApi error (HTTP ${res.status}).`;
    throw new Error(message);
  }

  const accounts: unknown[] = Array.isArray(json)
    ? json
    : Array.isArray(json?.accounts)
      ? json.accounts
      : Array.isArray(json?.data)
        ? json.data
        : [];

  const targetAccount = input.account.trim();
  const targetServer = input.server.trim().toLowerCase();

  for (const item of accounts) {
    if (!isRecord(item)) continue;
    const id = pickString(item, ["id", "_id", "accountId"]);
    if (!id) continue;

    const login = pickString(item, ["login", "accountNumber", "number"]);
    const name = pickString(item, ["name", "label"]);
    const server = pickString(item, ["server", "brokerServer"]);

    if (login && login === targetAccount) return id;
    if (name && name.includes(targetAccount)) return id;
    if (server && server.toLowerCase() === targetServer && login && login === targetAccount) return id;
  }

  throw new Error("MetaApi account not found. Please add the account in MetaApi dashboard then retry.");
}

app.options("*", (c) => new Response(null, { status: 204, headers: corsHeadersForRequest(c) }));

const handleHealth = async (c: any) => {
  try {
    // Required env vars
    requireEnv("SUPABASE_URL");
    requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    // KV sanity (write/read/delete)
    const key = "__health__";
    const payload = { t: Date.now() };
    await kv.set(key, payload);
    const stored = await kv.get(key);
    await kv.del(key);

    if (!isRecord(stored) || stored.t !== payload.t) {
      throw new Error("KV sanity check failed.");
    }

    return jsonResponse(c, 200, { status: "ok" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Health check failed.";
    return jsonResponse(c, 500, { status: "error", message });
  }
};

// Health check endpoint (support both path styles).
app.get(`${MAKE_SERVER_PREFIX}/health`, handleHealth);
app.get(`/server${MAKE_SERVER_PREFIX}/health`, handleHealth);

// UI actions (called via supabase.functions.invoke('server', ...))
const handleAction = async (c: any) => {
  try {
    const body = await c.req.json().catch(() => null);
    if (!isRecord(body)) return fail(c, 400, "Invalid JSON body.");

    const action = toString(body.action);
    if (!action) return fail(c, 400, "Missing action.");

    if (action === "mt_connect") {
      const userId = await requireUserIdFromRequest(c);
      const platformRaw = toString(body.platform);
      const platform = platformRaw ? (platformRaw.toUpperCase() as MtPlatform) : null;
      const server = pickString(body, ["server", "serverName", "brokerServer"]);
      const account = pickString(body, ["account", "accountNumber", "login", "account_number"]);
      const accountTypeRaw = toString(body.accountType);
      const accountType = accountTypeRaw === "demo" || accountTypeRaw === "live" ? accountTypeRaw : undefined;
      const autoSync = Boolean(body.autoSync);

      if (platform !== "MT4" && platform !== "MT5") return fail(c, 400, "Invalid platform.");
      if (!server || !account) return fail(c, 400, "Missing server or account.");

      console.log("[mt_connect] request", {
        userId,
        platform,
        server,
        accountTail: account.length > 4 ? account.slice(-4) : account,
        autoSync,
      });

      let metaapiAccountId: string | undefined;
      let metaapiWarning: string | undefined;
      try {
        metaapiAccountId = await metaapiFindAccountId({ account, server });
      } catch (e) {
        metaapiWarning = e instanceof Error ? e.message : "MetaApi validation failed.";
        console.warn("[mt_connect] metaapi warning", {
          userId,
          platform,
          server,
          accountTail: account.length > 4 ? account.slice(-4) : account,
          message: metaapiWarning,
        });
      }

      const existing = (await kv.get(`${MT_CONNECTION_BY_USER_PREFIX}${userId}`).catch(() => null)) as
        | MtConnectionByKey
        | null;
      if (existing?.syncKey) {
        await kv.del(`${MT_CONNECTION_BY_KEY_PREFIX}${existing.syncKey}`).catch(() => null);
      }

      const syncKey = generateSyncKey();
      const connectedAt = new Date().toISOString();

      const syncUrl = getServerSyncUrl();

      const record: MtConnectionByKey = {
        userId,
        platform,
        server,
        account,
        accountType,
        autoSync,
        metaapiAccountId,
        syncKey,
        syncUrl,
        connectedAt,
      };

      await kv.set(`${MT_CONNECTION_BY_KEY_PREFIX}${syncKey}`, record);
      await kv.set(`${MT_CONNECTION_BY_USER_PREFIX}${userId}`, record);

      return ok(c, {
        syncKey,
        syncUrl,
        connectedAt,
        connection: {
          platform,
          server,
          account,
          accountType,
          autoSync,
          metaapiAccountId,
          connectedAt,
        },
        ...(metaapiWarning ? { warning: metaapiWarning } : {}),
      });
    }

    if (action === "mt_disconnect") {
      const userId = await requireUserIdFromRequest(c);
      const existing = (await kv.get(`${MT_CONNECTION_BY_USER_PREFIX}${userId}`).catch(() => null)) as
        | MtConnectionByKey
        | null;

      if (existing?.syncKey) {
        await kv.del(`${MT_CONNECTION_BY_KEY_PREFIX}${existing.syncKey}`).catch(() => null);
      }
      await kv.del(`${MT_CONNECTION_BY_USER_PREFIX}${userId}`).catch(() => null);

      return ok(c, { disconnected: true });
    }

    if (action === "mt_status") {
      const userId = await requireUserIdFromRequest(c);
      const existing = (await kv.get(`${MT_CONNECTION_BY_USER_PREFIX}${userId}`).catch(() => null)) as
        | MtConnectionByKey
        | null;
      return ok(c, { connected: !!existing?.syncKey, connection: existing ?? null });
    }

    return fail(c, 400, "Unknown action.");
  } catch (error) {
    console.error("Server action error", error);
    const message = error instanceof Error ? error.message : "Server error.";
    if (message.includes("Authorization")) return fail(c, 401, "Unauthorized.");
    return fail(c, 500, "Server error.");
  }
};

app.post("/", handleAction);
app.post("/server", handleAction);
app.post(`${MAKE_SERVER_PREFIX}/action`, handleAction);
app.post(`/server${MAKE_SERVER_PREFIX}/action`, handleAction);

// MT connector webhook: push closed trades from MT4/MT5 into Supabase.
const handleMtSync = async (c: any) => {
  try {
    const syncKey = toString(c.req.header("X-TJ-Sync-Key")) ?? toString(c.req.query("key"));
    if (!syncKey) return fail(c, 401, "Missing sync key.");

    const now = Date.now();
    const rlKey = `${MT_RATE_LIMIT_PREFIX}${syncKey}`;
    const last = (await kv.get(rlKey).catch(() => null)) as unknown;
    if (isRecord(last) && typeof last.t === "number") {
      const delta = now - last.t;
      if (delta >= 0 && delta < 800) {
        return fail(c, 429, "Too many requests. Please retry shortly.");
      }
    }
    await kv.set(rlKey, { t: now }).catch(() => null);

    const connection = (await kv.get(`${MT_CONNECTION_BY_KEY_PREFIX}${syncKey}`).catch(() => null)) as
      | MtConnectionByKey
      | null;
    if (!connection?.userId) return fail(c, 401, "Invalid sync key.");

    const body = await c.req.json().catch(() => null);
    if (!isRecord(body)) return fail(c, 400, "Invalid JSON body.");
    const trades = body.trades;
    if (!Array.isArray(trades)) return fail(c, 400, "Missing trades array.");
    if (trades.length === 0) return ok(c, { received: 0, normalized: 0, upserted: 0 });
    if (trades.length > 2000) return fail(c, 413, "Too many trades in one request.");

    const supabase = getSupabaseAdmin();

    // Load profile to enforce free plan gates (service role bypasses RLS, so we enforce here).
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("subscription_plan,trial_start_at")
      .eq("id", connection.userId)
      .maybeSingle<ProfileRow>();

    if (profileError || !profile) return fail(c, 404, "Profile not found.");

    const normalized: Array<{
      id: string;
      date: string;
      symbol: string;
      type: "long" | "short";
      entry: number;
      exit: number;
      quantity: number;
      outcome: "win" | "loss" | "breakeven";
      pnl: number;
      pnl_percentage: number;
      notes: string | null;
    }> = [];

    await Promise.all(
      trades.map(async (t) => {
        if (!isRecord(t)) return;
        const ticket = pickString(t, ["ticket", "order", "deal", "id"]);
        const symbolRaw = pickString(t, ["symbol", "item", "instrument"]);
        const sideRaw = pickString(t, ["type", "side", "action"]);
        const entry = pickNumber(t, ["open_price", "entry", "openPrice", "price_open", "price"]);
        const exit = pickNumber(t, ["close_price", "exit", "closePrice", "price_close", "close"]);
        const quantity = pickNumber(t, ["volume", "lots", "size", "quantity"]);
        const pnl = pickNumber(t, ["profit", "pnl", "pl"]);
        const openTime = pickString(t, ["open_time", "openTime", "time", "open"]);
        const closeTime = pickString(t, ["close_time", "closeTime", "close"]);

        if (!ticket || !symbolRaw || !sideRaw) return;
        const type = mapTradeType(sideRaw);
        if (!type) return;
        if (entry === null || exit === null || quantity === null || pnl === null) return;

        const date = parseMtDateToIsoDate(closeTime ?? openTime ?? "");
        if (!date) return;

        const id = await deterministicUuid(`${connection.userId}:${connection.account}:${ticket}`);
        const symbol = normalizeSymbol(symbolRaw);
        const outcome = outcomeFromPnL(pnl);
        const pct = pnlPercentage(entry, exit, type);

        normalized.push({
          id,
          date,
          symbol,
          type,
          entry,
          exit,
          quantity,
          outcome,
          pnl,
          pnl_percentage: pct,
          notes: `Imported via MT sync - Ticket: ${ticket}`,
        });
      }),
    );

    if (normalized.length === 0) return fail(c, 400, "No valid trades found.");

    // Enforce free plan limits (15 trades / 14 days).
    if (profile.subscription_plan === "free") {
      const trialStart = profile.trial_start_at ? new Date(profile.trial_start_at) : new Date();
      const trialStartTs = Number.isNaN(trialStart.getTime()) ? Date.now() : trialStart.getTime();
      const expired = Date.now() - trialStartTs > 14 * 24 * 60 * 60 * 1000;
      if (expired) return fail(c, 403, "Free trial expired. Upgrade to keep syncing trades.");

      const { count: existingCount } = await supabase
        .from("trades")
        .select("id", { count: "exact", head: true })
        .eq("user_id", connection.userId);

      const ids = normalized.map((t) => t.id);
      const { data: existingIds, error: existingIdsError } = await supabase
        .from("trades")
        .select("id")
        .in("id", ids);

      if (existingIdsError) return fail(c, 500, "Failed to validate trade limits.");

      const alreadyExisting = new Set((existingIds ?? []).map((row: any) => row.id));
      const newInserts = normalized.filter((t) => !alreadyExisting.has(t.id)).length;
      const totalAfter = (existingCount ?? 0) + newInserts;
      if (totalAfter > 15) {
        return fail(
          c,
          403,
          "Free plan is limited to 15 trades. Upgrade to sync unlimited trades.",
        );
      }
    }

    // Upsert on primary key (id) to avoid duplicates when MT re-sends history.
    const rows = normalized.map((t) => ({
      ...t,
      user_id: connection.userId,
    }));

    const { error: upsertError } = await supabase.from("trades").upsert(rows, { onConflict: "id" });
    if (upsertError) return fail(c, 500, upsertError.message);

    const existing = (await kv.get(`${MT_CONNECTION_BY_USER_PREFIX}${connection.userId}`).catch(() => null)) as
      | MtConnectionByKey
      | null;
    await kv.set(`${MT_CONNECTION_BY_USER_PREFIX}${connection.userId}`, {
      ...(existing ?? connection),
      lastSyncAt: new Date().toISOString(),
    });

    console.log("[mt_sync] upserted trades", {
      userId: connection.userId,
      received: trades.length,
      normalized: normalized.length,
      upserted: normalized.length,
    });

    return ok(c, { received: trades.length, normalized: normalized.length, upserted: normalized.length });
  } catch (error) {
    console.error("MT sync error", error);
    return fail(c, 500, "Server error.");
  }
};

app.post("/mt/sync", handleMtSync);
app.post("/server/mt/sync", handleMtSync);
app.post(`${MAKE_SERVER_PREFIX}/mt/sync`, handleMtSync);
app.post(`/server${MAKE_SERVER_PREFIX}/mt/sync`, handleMtSync);

Deno.serve(app.fetch);
