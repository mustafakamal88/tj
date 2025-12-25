import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

type BrokerLiveStatus = "live" | "syncing" | "error" | "stale";

type Payload = {
  user_id: unknown;
  broker: unknown;
  account_id: unknown;
  status?: unknown;
  metrics?: unknown;
  exposure?: unknown;
  meta?: unknown;
};

type Metrics = {
  equity?: unknown;
  balance?: unknown;
  floating_pnl?: unknown;
  open_positions_count?: unknown;
  margin_used?: unknown;
  free_margin?: unknown;
};

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name} env var.`);
  return value;
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function ok(body: Record<string, unknown>) {
  return json(200, body);
}

function badRequest(error: string, details?: Record<string, unknown>) {
  return json(400, { ok: false, error, ...(details ? { details } : {}) });
}

function unauthorized(error = "UNAUTHORIZED") {
  return json(401, { ok: false, error });
}

function methodNotAllowed() {
  return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  return s ? s : null;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toIntOrNull(value: unknown): number | null {
  const n = toNumberOrNull(value);
  if (n === null) return null;
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(new Uint8Array(digest));
}

async function requireInternalKey(req: Request): Promise<boolean> {
  const expected = (Deno.env.get("TJ_INTERNAL_KEY") ?? "").trim();
  if (!expected) {
    console.error("[broker-live-upsert] TJ_INTERNAL_KEY missing");
    return false;
  }

  const provided = (req.headers.get("x-tj-internal-key") ?? "").trim();
  if (!provided) return false;

  // Compare hashes so timingSafeEqual can be used on fixed-length strings.
  const [a, b] = await Promise.all([sha256Hex(expected), sha256Hex(provided)]);
  return timingSafeEqual(a, b);
}

function getSupabaseAdmin() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));
}

function asStatus(value: unknown): BrokerLiveStatus | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (s === "live" || s === "syncing" || s === "error" || s === "stale") return s;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("", { status: 204 });
  if (req.method !== "POST") return methodNotAllowed();

  const authed = await requireInternalKey(req);
  if (!authed) return unauthorized();

  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return badRequest("INVALID_JSON");
  }

  const userId = toNonEmptyString(body.user_id);
  const broker = toNonEmptyString(body.broker);
  const accountId = toNonEmptyString(body.account_id);

  if (!userId || !broker || !accountId) {
    return badRequest("MISSING_FIELDS", {
      required: ["user_id", "broker", "account_id"],
    });
  }

  const status = asStatus(body.status) ?? "syncing";

  const metricsRaw = body.metrics;
  const metrics: Metrics = isRecord(metricsRaw) ? (metricsRaw as Metrics) : {};

  const row = {
    user_id: userId,
    broker,
    account_id: accountId,
    status,
    last_sync_at: new Date().toISOString(),
    equity: toNumberOrNull(metrics.equity),
    balance: toNumberOrNull(metrics.balance),
    floating_pnl: toNumberOrNull(metrics.floating_pnl),
    open_positions_count: toIntOrNull(metrics.open_positions_count),
    margin_used: toNumberOrNull(metrics.margin_used),
    free_margin: toNumberOrNull(metrics.free_margin),
    exposure: isRecord(body.exposure) ? body.exposure : {},
    meta: isRecord(body.meta) ? body.meta : {},
    updated_at: new Date().toISOString(),
  };

  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from("broker_live_state")
    .upsert(row, { onConflict: "user_id,broker,account_id" });

  if (error) {
    console.error("[broker-live-upsert] upsert failed", { message: error.message, userId, broker, accountId });
    return json(500, { ok: false, error: "UPSERT_FAILED" });
  }

  return ok({ ok: true });
});
