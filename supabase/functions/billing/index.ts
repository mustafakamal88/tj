import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

type SubscriptionPlan = "free" | "pro" | "premium";
type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "incomplete";

const app = new Hono();

function ok(c: any, data: unknown) {
  return c.json({ ok: true, data });
}

function fail(c: any, status: number, error: string) {
  return c.json({ ok: false, error }, status);
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

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing ${name} env var.`);
  return v;
}

async function stripeRequest(path: string, params: URLSearchParams): Promise<any> {
  const secret = requireEnv("STRIPE_SECRET_KEY");
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message ?? `Stripe error (HTTP ${res.status}).`);
  return json;
}

async function stripeGet(path: string): Promise<any> {
  const secret = requireEnv("STRIPE_SECRET_KEY");
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${secret}` },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message ?? `Stripe error (HTTP ${res.status}).`);
  return json;
}

function mapPlanToStripePrice(plan: SubscriptionPlan): string {
  if (plan === "pro") return requireEnv("STRIPE_PRICE_PRO");
  if (plan === "premium") return requireEnv("STRIPE_PRICE_PREMIUM");
  throw new Error("Invalid plan for Stripe.");
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

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toHex(new Uint8Array(sig));
}

function parseStripeSignature(header: string | null): { timestamp: number; signatures: string[] } | null {
  if (!header) return null;
  const parts = header.split(",").map((p) => p.trim());
  let timestamp = 0;
  const signatures: string[] = [];
  for (const part of parts) {
    const [k, v] = part.split("=", 2);
    if (!k || !v) continue;
    if (k === "t") timestamp = Number(v);
    if (k === "v1") signatures.push(v);
  }
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  if (!signatures.length) return null;
  return { timestamp, signatures };
}

async function paypalGetAccessToken(): Promise<string> {
  const clientId = requireEnv("PAYPAL_CLIENT_ID");
  const secret = requireEnv("PAYPAL_CLIENT_SECRET");
  const base = requireEnv("PAYPAL_BASE_URL"); // e.g. https://api-m.sandbox.paypal.com
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error_description ?? `PayPal token error (HTTP ${res.status}).`);
  const token = json?.access_token;
  if (!token) throw new Error("PayPal token missing.");
  return token;
}

async function paypalGet(path: string): Promise<any> {
  const base = requireEnv("PAYPAL_BASE_URL");
  const token = await paypalGetAccessToken();
  const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.message ?? `PayPal error (HTTP ${res.status}).`);
  return json;
}

async function paypalPost(path: string, body: unknown): Promise<any> {
  const base = requireEnv("PAYPAL_BASE_URL");
  const token = await paypalGetAccessToken();
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.message ?? `PayPal error (HTTP ${res.status}).`);
  return json;
}

function mapPlanToPayPalPlanId(plan: SubscriptionPlan): string {
  if (plan === "pro") return requireEnv("PAYPAL_PLAN_ID_PRO");
  if (plan === "premium") return requireEnv("PAYPAL_PLAN_ID_PREMIUM");
  throw new Error("Invalid plan for PayPal.");
}

app.use("*", logger(console.log));
app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "Stripe-Signature"],
    allowMethods: ["POST", "OPTIONS"],
    maxAge: 600,
  }),
);

// Stripe Checkout (test mode) — creates a Checkout session for the logged-in user.
app.post("/create-checkout-session", async (c) => {
  try {
    const userId = await requireUserIdFromRequest(c);
    const body = await c.req.json().catch(() => null);
    const plan = body?.plan as SubscriptionPlan | undefined;
    if (plan !== "pro" && plan !== "premium") return c.json({ error: "Invalid plan." }, 400);

    const siteUrl = requireEnv("SITE_URL");
    const price = mapPlanToStripePrice(plan);
    const supabase = getSupabaseAdmin();

    // Create customer if missing
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("email,stripe_customer_id")
      .eq("id", userId)
      .maybeSingle();
    if (profErr) return c.json({ error: profErr.message }, 500);

    let customerId = prof?.stripe_customer_id as string | null;
    if (!customerId) {
      const created = await stripeRequest(
        "/customers",
        new URLSearchParams({
          email: String(prof?.email ?? ""),
          metadata: JSON.stringify({ user_id: userId }),
        }),
      );
      customerId = created.id;
      await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", userId);
    }

    const session = await stripeRequest(
      "/checkout/sessions",
      new URLSearchParams({
        mode: "subscription",
        customer: customerId,
        "line_items[0][price]": price,
        "line_items[0][quantity]": "1",
        success_url: `${siteUrl}/billing?success=1`,
        cancel_url: `${siteUrl}/billing?canceled=1`,
        "metadata[user_id]": userId,
        "metadata[plan]": plan,
        client_reference_id: userId,
      }),
    );

    return c.json({ url: session.url });
  } catch (error) {
    console.error("[billing] create-checkout-session error", error);
    return c.json({ error: error instanceof Error ? error.message : "Server error." }, 500);
  }
});

// Stripe webhook — verify signature and apply upgrades.
app.post("/stripe-webhook", async (c) => {
  try {
    const webhookSecret = requireEnv("STRIPE_WEBHOOK_SECRET");
    const sigHeader = c.req.header("stripe-signature") ?? c.req.header("Stripe-Signature");
    const parsed = parseStripeSignature(sigHeader);
    if (!parsed) return c.json({ error: "Invalid Stripe-Signature header." }, 400);

    const rawBytes = new Uint8Array(await c.req.raw.arrayBuffer());
    const rawText = new TextDecoder().decode(rawBytes);

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parsed.timestamp) > 5 * 60) {
      return c.json({ error: "Signature timestamp out of tolerance." }, 400);
    }

    const signedPayload = `${parsed.timestamp}.${rawText}`;
    const expected = await hmacSha256Hex(webhookSecret, signedPayload);
    const valid = parsed.signatures.some((sig) => timingSafeEqual(sig, expected));
    if (!valid) return c.json({ error: "Invalid signature." }, 400);

    let event: any;
    try {
      event = JSON.parse(rawText);
    } catch {
      return c.json({ error: "Invalid JSON." }, 400);
    }

    if (event?.type === "checkout.session.completed") {
      const session = event?.data?.object;
      const userId = session?.metadata?.user_id as string | undefined;
      const plan = session?.metadata?.plan as SubscriptionPlan | undefined;

      if (userId && (plan === "pro" || plan === "premium")) {
        const supabase = getSupabaseAdmin();
        const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await supabase
          .from("profiles")
          .update({
            subscription_plan: plan,
            subscription_status: "active",
            current_period_end: periodEnd,
          })
          .eq("id", userId);
      }
    }

    return c.json({ received: true });
  } catch (error) {
    console.error("[billing] stripe-webhook error", error);
    return c.json({ error: "Webhook error." }, 500);
  }
});

// Backwards compatible handler (legacy actions). Kept for PayPal/older clients.
app.post("/", async (c) => {
  try {
    const userId = await requireUserIdFromRequest(c);
    const body = await c.req.json().catch(() => null);
    const action = body?.action as string | undefined;
    if (!action) return fail(c, 400, "Missing action.");

    const supabase = getSupabaseAdmin();

    if (action === "stripe_create_checkout") {
      const plan = body?.plan as SubscriptionPlan | undefined;
      if (plan !== "pro" && plan !== "premium") return fail(c, 400, "Invalid plan.");

      const siteUrl = requireEnv("SITE_URL"); // e.g. https://your-vercel-domain
      const price = mapPlanToStripePrice(plan);

      // Create customer if missing
      const { data: prof } = await supabase
        .from("profiles")
        .select("email,stripe_customer_id")
        .eq("id", userId)
        .maybeSingle();

      let customerId = prof?.stripe_customer_id as string | null;
      if (!customerId) {
        const created = await stripeRequest(
          "/customers",
          new URLSearchParams({
            email: String(prof?.email ?? ""),
            metadata: JSON.stringify({ user_id: userId }),
          }),
        );
        customerId = created.id;
        await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", userId);
      }

      const session = await stripeRequest(
        "/checkout/sessions",
        new URLSearchParams({
          mode: "subscription",
          customer: customerId,
          "line_items[0][price]": price,
          "line_items[0][quantity]": "1",
          success_url: `${siteUrl}/billing?success=1`,
          cancel_url: `${siteUrl}/billing?canceled=1`,
          "metadata[user_id]": userId,
          "metadata[plan]": plan,
        }),
      );

      return ok(c, { url: session.url });
    }

    if (action === "stripe_verify_session") {
      const sessionId = String(body?.sessionId ?? "");
      if (!sessionId) return fail(c, 400, "Missing sessionId.");
      const session = await stripeGet(`/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription`);
      const plan = (session?.metadata?.plan as SubscriptionPlan | undefined) ?? "pro";
      const subscription = session?.subscription;
      if (!subscription?.id) return fail(c, 400, "Missing Stripe subscription.");

      const periodEndUnix = subscription.current_period_end as number | undefined;
      const currentPeriodEnd = periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null;
      const status = (subscription.status as SubscriptionStatus | undefined) ?? "active";

      await supabase
        .from("profiles")
        .update({
          subscription_plan: plan,
          subscription_status: status,
          stripe_subscription_id: subscription.id,
          current_period_end: currentPeriodEnd,
        })
        .eq("id", userId);

      return ok(c, { plan });
    }

    if (action === "paypal_create_subscription") {
      const plan = body?.plan as SubscriptionPlan | undefined;
      if (plan !== "pro" && plan !== "premium") return fail(c, 400, "Invalid plan.");
      const planId = mapPlanToPayPalPlanId(plan);
      const siteUrl = requireEnv("SITE_URL");

      const sub = await paypalPost("/v1/billing/subscriptions", {
        plan_id: planId,
        application_context: {
          brand_name: "TJ Trade Journal",
          user_action: "SUBSCRIBE_NOW",
          return_url: `${siteUrl}/?billing=1&paypal_plan=${plan}`,
          cancel_url: `${siteUrl}/?billing=1`,
        },
      });

      const approve = Array.isArray(sub?.links)
        ? sub.links.find((l: any) => l?.rel === "approve")?.href
        : null;
      if (!approve) return fail(c, 500, "Missing PayPal approval URL.");
      return ok(c, { url: approve });
    }

    if (action === "paypal_verify_subscription") {
      const subscriptionId = String(body?.subscriptionId ?? "");
      const plan = (body?.plan as SubscriptionPlan | undefined) ?? "pro";
      if (!subscriptionId) return fail(c, 400, "Missing subscriptionId.");

      const sub = await paypalGet(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`);
      const status = String(sub?.status ?? "ACTIVE").toLowerCase() as SubscriptionStatus;
      const end = sub?.billing_info?.next_billing_time ? String(sub.billing_info.next_billing_time) : null;

      await supabase
        .from("profiles")
        .update({
          subscription_plan: plan,
          subscription_status: status,
          paypal_subscription_id: subscriptionId,
          current_period_end: end,
        })
        .eq("id", userId);

      return ok(c, { plan });
    }

    return fail(c, 400, "Unknown action.");
  } catch (error) {
    console.error("[billing] error", error);
    return fail(c, 500, error instanceof Error ? error.message : "Server error.");
  }
});

Deno.serve(app.fetch);
