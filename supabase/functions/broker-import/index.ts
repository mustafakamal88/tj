import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

type MtPlatform = "mt4" | "mt5";
type BrokerEnvironment = "demo" | "live";
type BrokerStatus = "created" | "deploying" | "connected" | "error";

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

const PROVIDER: BrokerConnectionRow["provider"] = "metaapi";

const app = new Hono();

app.use("*", logger(console.log));
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

function fail(c: any, status: number, error: string, code?: string, details?: Record<string, unknown>) {
  return c.json({ ok: false, error, code: code ?? "error", ...(details ? { details } : {}) }, status);
}

function getBearerToken(authHeader: string | undefined | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function getSupabaseAdmin() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));
}

async function requireUserId(req: Request): Promise<string> {
  const token = getBearerToken(req.headers.get("Authorization"));
  if (!token) throw new Error("Missing Authorization bearer token.");
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) throw new Error("Invalid Authorization token.");
  return data.user.id;
}

function metaApiClientBaseUrl(): string {
  const base = requireEnv("METAAPI_BASE_URL").replace(/\\/+$/, "");
  if (!base.includes("mt-client-api-v1")) {
    throw new Error(
      'METAAPI_BASE_URL must point to "mt-client-api-v1" (e.g. https://mt-client-api-v1.london.agiliumtrade.ai).',
    );
  }
  return base;
}

function metaApiProvisioningBaseUrl(): string {
  const base = (Deno.env.get("METAAPI_PROVISIONING_URL") ??
    "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai").replace(/\\/+$/, "");
  if (!base.includes("mt-provisioning-api-v1")) {
    throw new Error(
      'METAAPI_PROVISIONING_URL must point to "mt-provisioning-api-v1" (e.g. https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai).',
    );
  }
  return base;
}

function metaApiAuthHeaders(): Record<string, string> {
  // MetaApi REST APIs use `auth-token`, not Authorization: Bearer.
  return { "auth-token": requireEnv("METAAPI_TOKEN"), Accept: "application/json" };
}

async function metaApiJson(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = json?.message ?? json?.error?.message ?? `MetaApi error (HTTP ${res.status}).`;
    throw new Error(message);
  }
  return json;
}

async function metaApiCreateAccount(input: {
  login: string;
  password: string;
  server: string;
  platform: MtPlatform;
  cloudType: string;
  name: string;
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
    const state = toString(account?.state)?.toUpperCase();
    if (state === "DEPLOYED") return { status: "connected" };
    if (state === "DEPLOY_FAILED") return { status: "error" };
    // wait a bit
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { status: "deploying" };
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

function normalizeSymbol(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function isClosingDeal(entryType: string): boolean {
  // Opening deals in MT5 usually have entryType DEAL_ENTRY_IN.
  return entryType.toUpperCase() !== "DEAL_ENTRY_IN";
}

function mapDealDirection(entryDealType: string): TradeType | null {
  const t = entryDealType.toUpperCase();
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
  // MetaApi examples use `YYYY-MM-DD HH:mm:ss.SSS` (UTC). Keep it deterministic.
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

async function metaApiFetchDealsByTimeRange(accountId: string, fromIso: string, toIso: string): Promise<MetaApiDeal[]> {
  const base = metaApiClientBaseUrl();
  const url =
    `${base}/users/current/accounts/${encodeURIComponent(accountId)}/history-deals/time/${encodeURIComponent(fromIso)}/${encodeURIComponent(toIso)}`;
  const json = await metaApiJson(url, { method: "GET", headers: metaApiAuthHeaders() });
  return Array.isArray(json) ? (json as MetaApiDeal[]) : [];
}

async function fetchDealsChunked(accountId: string, from: Date, to: Date): Promise<MetaApiDeal[]> {
  const out: MetaApiDeal[] = [];
  // Fetch in 90-day windows to avoid huge responses/timeouts.
  for (let cursor = new Date(from.getTime()); cursor < to; cursor = addDays(cursor, 90)) {
    const windowEnd = addDays(cursor, 90);
    const end = windowEnd < to ? windowEnd : to;
    const fromIso = toMetaApiTimeString(cursor);
    const toIso = toMetaApiTimeString(end);
    const deals = await metaApiFetchDealsByTimeRange(accountId, fromIso, toIso);
    out.push(...deals);
  }
  return out;
}

function dealKey(deal: { positionId: string; id: string }): string {
  return `${deal.positionId}:${deal.id}`;
}

type ConnectInput = {
  platform: MtPlatform;
  environment: BrokerEnvironment;
  server: string;
  login: string;
  password: string;
};

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

async function handleConnect(c: any, body: Record<string, unknown>): Promise<Response> {
  try {
    const userId = await requireUserId(c.req.raw);

    const server = toString(body.server);
    const login = toString(body.login);
    const password = toString(body.password);
    const platform = normalizePlatform(toString(body.platform) ?? "");
    const environment = normalizeEnvironment(toString(body.environment) ?? toString(body.accountType) ?? "");
    const cloudType = toString(body.type) ?? "cloud-g2";

    if (!server || !login || !password || !platform || !environment) {
      return fail(c, 400, "Missing platform, account type, server, login, or password.", "bad_request");
    }

    // Ensure required secrets are present early (never log them).
    metaApiClientBaseUrl();
    metaApiProvisioningBaseUrl();
    requireEnv("METAAPI_TOKEN");

    const supabase = getSupabaseAdmin();

    // Reuse an existing connection for this user+login+server if present.
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

    // Create and deploy a MetaApi account. Credentials are stored in MetaApi, not our DB.
    const name = `TJ ${userId} ${platform.toUpperCase()} ${environment.toUpperCase()} ${login}@${server}`;
    const metaapiAccountId = await metaApiCreateAccount({
      login,
      password,
      server,
      platform,
      cloudType,
      name,
    });

    // Write connection row immediately, then deploy and update status.
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
        status: "created",
      })
      .select(
        "id,provider,metaapi_account_id,platform,environment,server,login,status,last_import_at,created_at,updated_at",
      )
      .single();

    if (insertError || !inserted) return fail(c, 500, insertError?.message ?? "Failed to save connection.");

    // Deploy + wait best-effort.
    await supabase.from("broker_connections").update({ status: "deploying" }).eq("id", inserted.id);
    await metaApiDeployAccount(metaapiAccountId);
    const deployed = await metaApiWaitForDeployed(metaapiAccountId);
    await supabase.from("broker_connections").update({ status: deployed.status }).eq("id", inserted.id);

    const { data: fresh } = await supabase
      .from("broker_connections")
      .select(
        "id,provider,metaapi_account_id,platform,environment,server,login,status,last_import_at,created_at,updated_at",
      )
      .eq("id", inserted.id)
      .single();

    return ok(c, { connection: fresh ?? inserted });
  } catch (e) {
    console.error("[broker-import] connect error", e);
    const message = e instanceof Error ? e.message : "Server error.";
    if (message.toLowerCase().includes("authorization")) return fail(c, 401, "Unauthorized.", "unauthorized");
    return fail(c, 500, message);
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

    const accountId = toString(connection.metaapi_account_id);
    const accountLogin = toString(connection.login);
    if (!accountId || !accountLogin) return fail(c, 500, "Connection missing MetaApi account id/login.");

    const from = fromRaw ? new Date(fromRaw) : new Date("2000-01-01T00:00:00.000Z");
    const to = toRaw ? new Date(toRaw) : new Date();
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      return fail(c, 400, "Invalid from/to range.", "bad_request");
    }

    console.log("[broker-import] import start", {
      userId,
      connectionId,
      accountId,
      from: from.toISOString(),
      to: to.toISOString(),
    });

    // Fetch deals (history). For MVP, we convert closing deals into TJ trades.
    const deals = await fetchDealsChunked(accountId, from, to);
    const dealsByPosition = new Map<string, MetaApiDeal[]>();
    for (const d of deals) {
      const positionId = toString(d.positionId) ?? toString(d.orderId) ?? toString(d.id);
      if (!positionId) continue;
      const list = dealsByPosition.get(positionId) ?? [];
      list.push(d);
      dealsByPosition.set(positionId, list);
    }

    const rows: any[] = [];
    const seen = new Set<string>();

    for (const [positionId, list] of dealsByPosition) {
      // Find the opening deal to infer entry price + direction.
      const sorted = [...list].sort((a, b) => {
        const at = Date.parse(toString(a.time) ?? "");
        const bt = Date.parse(toString(b.time) ?? "");
        return (Number.isFinite(at) ? at : 0) - (Number.isFinite(bt) ? bt : 0);
      });

      const entryDeal = sorted.find((d) => toString(d.entryType)?.toUpperCase() === "DEAL_ENTRY_IN") ?? sorted[0];
      const entryPrice = toNumber(entryDeal?.price) ?? 0;
      const entryTime = toString(entryDeal?.time);
      const entryType = toString(entryDeal?.type) ?? "";
      const tradeType = mapDealDirection(entryType) ?? "long";

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

        const key = dealKey({ positionId, id: ticket });
        if (seen.has(key)) continue;
        seen.add(key);

        rows.push({
          user_id: userId,
          broker_provider: PROVIDER,
          account_login: accountLogin,
          ticket,
          position_id: positionId,
          open_time: entryTime ?? null,
          close_time: closeTime,
          commission: commission || null,
          swap: swap || null,
          date: toIsoDate(closeTime),
          symbol: normalizeSymbol(symbolRaw),
          type: tradeType,
          entry: entryPrice,
          exit: closePrice,
          quantity: volume,
          outcome: outcomeFromPnL(pnl),
          pnl,
          pnl_percentage: pnlPercentage(entryPrice, closePrice, tradeType),
          notes: `Imported via MetaApi (deal ${ticket}, position ${positionId})`,
        });
      }
    }

    if (rows.length === 0) {
      return ok(c, { imported: 0, upserted: 0, totalFetched: deals.length });
    }

    let upserted = 0;
    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error: upsertError } = await supabase.from("trades").upsert(chunk, {
        onConflict: "user_id,broker_provider,account_login,position_id,ticket",
      });
      if (upsertError) throw new Error(upsertError.message);
      upserted += chunk.length;
    }

    const now = new Date().toISOString();
    await supabase
      .from("broker_connections")
      .update({ last_import_at: now, status: "connected" })
      .eq("id", connectionId)
      .eq("user_id", userId);

    console.log("[broker-import] import complete", { userId, connectionId, totalFetched: deals.length, upserted });

    return ok(c, { imported: rows.length, upserted, totalFetched: deals.length });
  } catch (e) {
    console.error("[broker-import] import error", e);
    const message = e instanceof Error ? e.message : "Server error.";
    if (message.toLowerCase().includes("authorization")) return fail(c, 401, "Unauthorized.", "unauthorized");
    return fail(c, 500, message);
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

Deno.serve(app.fetch);
