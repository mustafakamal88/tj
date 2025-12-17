import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

type Broker = "mt4" | "mt5";

type IncomingTrade = {
  account_login: number | string;
  ticket: number | string;
  symbol: string;
  side: "buy" | "sell";
  volume: number;
  open_time?: string;
  close_time?: string;
  open_price?: number;
  close_price?: number;
  profit?: number;
  commission?: number;
  swap?: number;
  comment?: string;
};

type ProfileRow = {
  subscription_plan: "free" | "pro" | "premium";
  trial_start_at: string;
};

const app = new Hono();

function ok(c: any, data: unknown) {
  return c.json({ ok: true, data });
}

function fail(c: any, status: number, error: string) {
  return c.json({ ok: false, error }, status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toString(value: unknown): string | null {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function normalizeSymbol(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function parseIsoDate(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function getBearerToken(authHeader: string | undefined | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function getSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, serviceRoleKey);
}

async function requireUserIdFromRequest(c: any): Promise<string> {
  const token = getBearerToken(c.req.header("Authorization"));
  if (!token) throw new Error("Missing Authorization bearer token.");

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) throw new Error("Invalid Authorization token.");
  return data.user.id;
}

function base64UrlEncode(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function generateEaKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
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

app.use("*", logger(console.log));
app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "X-EA-Key"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    maxAge: 600,
  }),
);

app.get("/health", (c) => ok(c, { status: "ok" }));

// UI: create/update a connection and return the EA key once.
app.post("/connect", async (c) => {
  try {
    const userId = await requireUserIdFromRequest(c);
    const body = await c.req.json().catch(() => null);
    if (!isRecord(body)) return fail(c, 400, "Invalid JSON body.");

    const broker = (toString(body.broker) ?? toString(body.platform) ?? "mt5").toLowerCase() as Broker;
    if (broker !== "mt4" && broker !== "mt5") return fail(c, 400, "Invalid broker.");

    const accountLogin = toString(body.account_login ?? body.account);
    if (!accountLogin) return fail(c, 400, "Missing account_login.");

    const supabase = getSupabaseAdmin();

    const { data: existing } = await supabase
      .from("broker_connections")
      .select("user_id, broker, account_login")
      .eq("broker", broker)
      .eq("account_login", accountLogin)
      .maybeSingle();

    if (existing?.user_id && existing.user_id !== userId) {
      return fail(c, 409, "This account is already connected to a different user.");
    }

    const eaKey = generateEaKey();
    const { data: hash, error: hashError } = await supabase.rpc("hash_ea_key", { p_plain: eaKey });
    if (hashError || !hash) return fail(c, 500, "Failed to generate EA key hash.");

    const connectedAt = new Date().toISOString();
    const { error } = await supabase
      .from("broker_connections")
      .upsert(
        {
          user_id: userId,
          broker,
          account_login: accountLogin,
          api_key_hash: String(hash),
          is_active: true,
        },
        { onConflict: "broker,account_login" },
      );
    if (error) return fail(c, 500, error.message);

    const url = Deno.env.get("SUPABASE_URL");
    const syncUrl = url ? `${url}/functions/v1/mt-bridge/sync` : "";

    return ok(c, { syncKey: eaKey, syncUrl, connectedAt });
  } catch (e) {
    console.error("mt-bridge connect error", e);
    return fail(c, 500, "Server error.");
  }
});

// UI: disconnect all active connections for the user.
app.post("/disconnect", async (c) => {
  try {
    const userId = await requireUserIdFromRequest(c);
    const supabase = getSupabaseAdmin();
    await supabase.from("broker_connections").update({ is_active: false }).eq("user_id", userId);
    return ok(c, { disconnected: true });
  } catch (e) {
    console.error("mt-bridge disconnect error", e);
    return fail(c, 500, "Server error.");
  }
});

app.get("/status", async (c) => {
  try {
    const userId = await requireUserIdFromRequest(c);
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("broker_connections")
      .select("broker,account_login,is_active,updated_at,created_at")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1);

    const record = data?.[0] ?? null;
    return ok(c, { connected: !!record, record });
  } catch (e) {
    console.error("mt-bridge status error", e);
    return fail(c, 500, "Server error.");
  }
});

async function enforceFreePlanLimits(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  newTicketCount: number,
) {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("subscription_plan,trial_start_at")
    .eq("id", userId)
    .maybeSingle<ProfileRow>();

  if (profileError || !profile) throw new Error("Profile not found.");
  if (profile.subscription_plan !== "free") return;

  const trialStart = new Date(profile.trial_start_at);
  const expired = Number.isNaN(trialStart.getTime())
    ? false
    : Date.now() - trialStart.getTime() > 14 * 24 * 60 * 60 * 1000;
  if (expired) throw new Error("Free trial expired. Upgrade to keep syncing trades.");

  const { count: existingCount } = await supabase
    .from("trades")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if ((existingCount ?? 0) + newTicketCount > 15) {
    throw new Error("Free plan is limited to 15 trades. Upgrade to sync unlimited trades.");
  }
}

async function ingestTrades(req: Request) {
  const supabase = getSupabaseAdmin();

  const eaKey = req.headers.get("x-ea-key") ?? req.headers.get("X-EA-Key");
  if (!eaKey) return { status: 401, body: { error: "Missing x-ea-key" } };

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { status: 400, body: { error: "Invalid JSON" } };
  }

  const payload = Array.isArray(body) ? body : [body];
  const trades = payload.filter((t) => !!t && typeof t === "object") as IncomingTrade[];
  if (trades.length === 0) return { status: 400, body: { error: "Empty payload" } };

  const accountLogin = toString((trades[0] as any)?.account_login);
  if (!accountLogin) return { status: 400, body: { error: "Missing account_login" } };

  const brokerRaw = toString((trades[0] as any)?.broker) ?? "mt5";
  const broker = brokerRaw.toLowerCase() as Broker;
  if (broker !== "mt4" && broker !== "mt5") return { status: 400, body: { error: "Invalid broker" } };

  const { data: conn, error: connErr } = await supabase
    .from("broker_connections")
    .select("user_id,broker,account_login,api_key_hash,is_active")
    .eq("broker", broker)
    .eq("account_login", accountLogin)
    .maybeSingle();

  if (connErr || !conn) return { status: 404, body: { error: "Connection not found" } };
  if (!conn.is_active) return { status: 403, body: { error: "Connection disabled" } };

  const { data: okKey, error: okErr } = await supabase.rpc("verify_ea_key", {
    p_plain: eaKey,
    p_hash: conn.api_key_hash,
  });
  if (okErr || okKey !== true) return { status: 401, body: { error: "Invalid key" } };

  const tickets = trades
    .map((t) => toString(t.ticket))
    .filter((t): t is string => !!t);
  if (tickets.length === 0) return { status: 400, body: { error: "Missing ticket" } };

  const { data: existingMaps } = await supabase
    .from("trade_external_map")
    .select("external_ticket,trade_id")
    .eq("user_id", conn.user_id)
    .eq("broker", broker)
    .eq("account_login", accountLogin)
    .in("external_ticket", tickets);

  const known = new Set((existingMaps ?? []).map((r: any) => String(r.external_ticket)));
  const newCount = tickets.filter((t) => !known.has(String(t))).length;

  try {
    await enforceFreePlanLimits(supabase, conn.user_id, newCount);
  } catch (e) {
    return { status: 403, body: { error: e instanceof Error ? e.message : "Forbidden" } };
  }

  const upsertTrades: any[] = [];
  const upsertMaps: any[] = [];

  for (const t of trades) {
    const ticket = toString(t.ticket);
    const symbolRaw = toString(t.symbol);
    const side = toString(t.side)?.toLowerCase();
    const volume = typeof t.volume === "number" && Number.isFinite(t.volume) ? t.volume : null;
    if (!ticket || !symbolRaw || (side !== "buy" && side !== "sell") || volume === null) continue;

    const entry = typeof t.open_price === "number" && Number.isFinite(t.open_price) ? t.open_price : 0;
    const exit =
      typeof t.close_price === "number" && Number.isFinite(t.close_price)
        ? t.close_price
        : typeof t.open_price === "number" && Number.isFinite(t.open_price)
          ? t.open_price
          : 0;

    const pnlBase =
      (typeof t.profit === "number" && Number.isFinite(t.profit) ? t.profit : 0) +
      (typeof t.commission === "number" && Number.isFinite(t.commission) ? t.commission : 0) +
      (typeof t.swap === "number" && Number.isFinite(t.swap) ? t.swap : 0);

    const date =
      parseIsoDate(t.close_time) ?? parseIsoDate(t.open_time) ?? new Date().toISOString().slice(0, 10);
    const type = side === "buy" ? "long" : "short";

    // Deterministic ID so upserts are idempotent even if mapping row is missing.
    const seed = `${conn.user_id}:${broker}:${accountLogin}:${ticket}`;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
    const bytes = new Uint8Array(digest).slice(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const tradeId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(
      20,
    )}`;

    upsertTrades.push({
      id: tradeId,
      user_id: conn.user_id,
      date,
      symbol: normalizeSymbol(symbolRaw),
      type,
      entry,
      exit,
      quantity: volume,
      outcome: outcomeFromPnL(pnlBase),
      pnl: pnlBase,
      pnl_percentage: pnlPercentage(entry, exit, type),
      notes: t.comment ?? null,
    });

    upsertMaps.push({
      user_id: conn.user_id,
      broker,
      account_login: accountLogin,
      external_ticket: ticket,
      trade_id: tradeId,
    });
  }

  if (upsertTrades.length === 0) return { status: 400, body: { error: "No valid trades found." } };

  const { error: tradeErr } = await supabase.from("trades").upsert(upsertTrades, { onConflict: "id" });
  if (tradeErr) return { status: 500, body: { error: tradeErr.message } };

  const { error: mapErr } = await supabase
    .from("trade_external_map")
    .upsert(upsertMaps, { onConflict: "user_id,broker,account_login,external_ticket" });
  if (mapErr) return { status: 500, body: { error: mapErr.message } };

  return { status: 200, body: { ok: true, count: upsertTrades.length } };
}

app.post("/", async (c) => {
  const result = await ingestTrades(c.req.raw);
  return c.json(result.body, result.status);
});

app.post("/sync", async (c) => {
  const result = await ingestTrades(c.req.raw);
  return c.json(result.body, result.status);
});

Deno.serve(app.fetch);

