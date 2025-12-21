import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

type SubscriptionPlan = "free" | "pro" | "premium";
type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "incomplete";

const app = new Hono();

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
  if (!token) throw new Error("AUTH_MISSING");
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) throw new Error("AUTH_INVALID");
  return data.user.id;
}

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing ${name} env var.`);
  return v;
}

function requireStripeSecretKey(): string {
  const value = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!value) throw new Error("STRIPE_SECRET_KEY missing or invalid.");
  if (!value.startsWith("sk_")) {
    console.error("[billing] invalid STRIPE_SECRET_KEY prefix", { prefix: value.slice(0, 3) });
    throw new Error("STRIPE_SECRET_KEY missing or invalid.");
  }
  return value;
}

function requireStripePriceId(name: string): string {
  const value = requireEnv(name);
  if (!value.startsWith("price_")) {
    console.error(`[billing] invalid Stripe price id for ${name}`, { value });
    throw new Error(`${name} must be a Stripe price id starting with "price_".`);
  }
  return value;
}

async function stripeGet(path: string): Promise<any> {
  const secret = requireStripeSecretKey();
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${secret}` },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message ?? `Stripe error (HTTP ${res.status}).`);
  return json;
}

async function stripeRequest(
  path: string,
  params: URLSearchParams,
  options?: { idempotencyKey?: string },
): Promise<any> {
  const secret = requireStripeSecretKey();
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(options?.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    },
    body: params.toString(),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message ?? `Stripe error (HTTP ${res.status}).`);
  return json;
}

function mapPlanToStripePrice(plan: SubscriptionPlan): string {
  if (plan === "pro") return requireStripePriceId("STRIPE_PRICE_PRO");
  if (plan === "premium") return requireStripePriceId("STRIPE_PRICE_PREMIUM");
  throw new Error("Invalid plan for Stripe.");
}

async function ensurePortalConfigurationId(): Promise<string | null> {
  const fromEnv = (Deno.env.get("STRIPE_PORTAL_CONFIGURATION_ID") ?? "").trim();
  if (fromEnv) return fromEnv;

  // Try to reuse an existing configuration (avoid creating duplicates).
  try {
    const list = await stripeGet("/billing_portal/configurations?limit=20");
    const configs: any[] = Array.isArray(list?.data) ? list.data : [];

    const proPrice = mapPlanToStripePrice("pro");
    const premiumPrice = mapPlanToStripePrice("premium");
    const required = new Set([proPrice, premiumPrice]);

    const hasAllPrices = (cfg: any) => {
      const products = cfg?.features?.subscription_update?.products;
      const prices: string[] = [];
      if (Array.isArray(products)) {
        for (const p of products) {
          const ps = p?.prices;
          if (Array.isArray(ps)) {
            for (const v of ps) {
              if (typeof v === "string") prices.push(v);
            }
          }
        }
      }
      for (const need of required) if (!prices.includes(need)) return false;
      return true;
    };

    const cfg = configs.find((c: any) => c?.features?.subscription_update?.enabled === true && hasAllPrices(c));
    if (cfg?.id) return String(cfg.id);
  } catch (e) {
    console.warn("[billing] failed to list portal configurations; will create one", e);
  }

  // Create a configuration enabling subscription updates between Pro/Premium.
  // NOTE: Stripe requires payment method update to be enabled when subscription updates are enabled.
  try {
    const proPrice = mapPlanToStripePrice("pro");
    const premiumPrice = mapPlanToStripePrice("premium");
    const proObj = await stripeGet(`/prices/${encodeURIComponent(proPrice)}`);
    const premiumObj = await stripeGet(`/prices/${encodeURIComponent(premiumPrice)}`);

    const groups = new Map<string, string[]>();
    const add = (productId: unknown, priceId: string) => {
      if (typeof productId !== "string" || !productId.trim()) return;
      const arr = groups.get(productId) ?? [];
      if (!arr.includes(priceId)) arr.push(priceId);
      groups.set(productId, arr);
    };
    add(proObj?.product, proPrice);
    add(premiumObj?.product, premiumPrice);

    const params = new URLSearchParams();
    params.set("business_profile[headline]", "Manage your TJ Trade Journal subscription");
    params.set("features[payment_method_update][enabled]", "true");
    params.set("features[subscription_cancel][enabled]", "true");
    params.set("features[subscription_update][enabled]", "true");
    params.set("features[subscription_update][proration_behavior]", "create_prorations");
    params.set("features[subscription_update][default_allowed_updates][0]", "price");

    let i = 0;
    for (const [productId, priceIds] of groups.entries()) {
      params.set(`features[subscription_update][products][${i}][product]`, productId);
      for (let j = 0; j < priceIds.length; j++) {
        params.set(`features[subscription_update][products][${i}][prices][${j}]`, priceIds[j]);
      }
      i += 1;
    }

    const created = await stripeRequest("/billing_portal/configurations", params, {
      idempotencyKey: "tj_portal_cfg_v2",
    });
    if (created?.id) return String(created.id);
    return null;
  } catch (e) {
    // Safety fallback: do not break portal opening if config creation fails.
    console.warn("[billing] failed to create portal configuration; falling back to default portal", e);
    return null;
  }
}

async function ensureStripeCustomer(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  profile: { email: string | null; stripe_customer_id: string | null },
): Promise<string> {
  let customerId = profile.stripe_customer_id;
  if (customerId) return customerId;

  const created = await stripeRequest(
    "/customers",
    new URLSearchParams({
      email: profile.email ?? "",
      "metadata[user_id]": userId,
    }),
    { idempotencyKey: `tj_customer_${userId}` },
  );
  customerId = created.id;
  await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", userId);
  return customerId;
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

app.use(
  "*",
  cors({
    origin: "*",
    // supabase-js sends `apikey`, `authorization`, and `x-client-info` headers from the browser.
    allowHeaders: ["Content-Type", "Authorization", "apikey", "x-client-info", "Stripe-Signature"],
    allowMethods: ["POST", "OPTIONS"],
    maxAge: 600,
  }),
);

app.options("*", (c) => c.text("", 204));

const billingHandler = async (c: any) => {
  try {
    const body = await c.req.json().catch(() => null);
    const action = body?.action as string | undefined;
    if (!action) return c.json({ error: "Missing action." }, 400);

    if (action === "health") {
      return c.json({ ok: true, ts: new Date().toISOString() });
    }

    const userId = await requireUserIdFromRequest(c);
    const supabase = getSupabaseAdmin();

    if (action === "create_checkout_session") {
      const plan = body?.plan as SubscriptionPlan | undefined;
      if (plan !== "pro" && plan !== "premium") return c.json({ error: "Invalid plan." }, 400);

      console.log("[billing] action=create_checkout_session", {
        hasSiteUrl: !!Deno.env.get("SITE_URL"),
        hasStripeSecret: !!Deno.env.get("STRIPE_SECRET_KEY"),
        hasProPrice: !!Deno.env.get("STRIPE_PRICE_PRO"),
        hasPremiumPrice: !!Deno.env.get("STRIPE_PRICE_PREMIUM"),
      });

      const siteUrl = requireEnv("SITE_URL");
      let price: string;
      try {
        requireStripeSecretKey();
        price = mapPlanToStripePrice(plan);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Stripe is not configured.";
        return c.json({ error: message }, 500);
      }
      // Prevent duplicate active subscriptions (single active subscription per user).
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("email,stripe_customer_id,stripe_subscription_id,subscription_plan,subscription_status")
        .eq("id", userId)
        .maybeSingle();
      if (profErr) return c.json({ error: profErr.message }, 500);

      const existingPlan = String((prof as any)?.subscription_plan ?? "free").toLowerCase();
      const existingStatus = String((prof as any)?.subscription_status ?? "").toLowerCase();
      const existingSubId = (prof as any)?.stripe_subscription_id as string | null | undefined;
      const isSubscribed = (existingPlan === "pro" || existingPlan === "premium") &&
        (existingStatus === "active" || existingStatus === "trialing") &&
        typeof existingSubId === "string" &&
        existingSubId.length > 0;
      if (isSubscribed) {
        // Allow upgrades Free->Paid and Pro->Premium via checkout.
        // Prevent "easy downgrades" from Premium->Pro in the app UI.
        if (existingPlan === "premium" && plan === "pro") {
          return c.json({ error: "Downgrades must be done in the Stripe customer portal." }, 409);
        }
        if (existingPlan === plan) {
          return c.json(
            { error: "You already have an active subscription. Use Manage subscription to make changes." },
            409,
          );
        }
      }

      const customerId = await ensureStripeCustomer(supabase, userId, {
        email: (prof as any)?.email ?? null,
        stripe_customer_id: (prof as any)?.stripe_customer_id ?? null,
      });

      const session = await stripeRequest(
        "/checkout/sessions",
        new URLSearchParams({
          mode: "subscription",
          customer: customerId,
          "line_items[0][price]": price,
          "line_items[0][quantity]": "1",
          success_url: `${siteUrl}/dashboard?checkout=success`,
          cancel_url: `${siteUrl}/billing?checkout=cancel`,
          "metadata[user_id]": userId,
          "metadata[plan]": plan,
          "subscription_data[metadata][user_id]": userId,
          "subscription_data[metadata][plan]": plan,
          client_reference_id: userId,
        }),
        // Avoid creating duplicate sessions on double-click.
        { idempotencyKey: `tj_checkout_${userId}_${plan}` },
      );

      return c.json({ url: session.url });
    }

    if (action === "create_portal_session") {
      const siteUrl = requireEnv("SITE_URL");
      console.log("[billing] action=create_portal_session", {
        hasSiteUrl: !!Deno.env.get("SITE_URL"),
        hasStripeSecret: !!Deno.env.get("STRIPE_SECRET_KEY"),
      });
      try {
        requireStripeSecretKey();
      } catch (e) {
        const message = e instanceof Error ? e.message : "Stripe is not configured.";
        return c.json({ error: message }, 500);
      }
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("stripe_customer_id")
        .eq("id", userId)
        .maybeSingle();
      if (profErr) return c.json({ error: profErr.message }, 500);
      const customerId = (prof as any)?.stripe_customer_id as string | null;
      if (!customerId) return c.json({ error: "No Stripe customer found for this user." }, 400);

      let configuration: string | null = null;
      try {
        configuration = await ensurePortalConfigurationId();
      } catch (e) {
        console.warn("[billing] portal config resolution failed; continuing without configuration", e);
        configuration = null;
      }
      const portal = await stripeRequest(
        "/billing_portal/sessions",
        new URLSearchParams({
          customer: customerId,
          ...(configuration ? { configuration } : {}),
          return_url: `${siteUrl}/dashboard?portal=1`,
        }),
      );

      return c.json({ url: portal.url });
    }

    if (action === "paypal_create_subscription") {
      const plan = body?.plan as SubscriptionPlan | undefined;
      if (plan !== "pro" && plan !== "premium") return c.json({ error: "Invalid plan." }, 400);
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
      if (!approve) return c.json({ error: "Missing PayPal approval URL." }, 500);
      return c.json({ url: approve });
    }

    if (action === "paypal_verify_subscription") {
      const subscriptionId = String(body?.subscriptionId ?? "");
      const plan = (body?.plan as SubscriptionPlan | undefined) ?? "pro";
      if (!subscriptionId) return c.json({ error: "Missing subscriptionId." }, 400);

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

      return c.json({ plan });
    }

    return c.json({ error: "Unknown action." }, 400);
  } catch (error) {
    console.error("[billing] error", error);
    if (error instanceof Error && error.message === "AUTH_MISSING") {
      return c.json({ error: "Please login to continue." }, 401);
    }
    if (error instanceof Error && error.message === "AUTH_INVALID") {
      return c.json({ error: "Invalid session. Please login again." }, 401);
    }
    return c.json({ error: error instanceof Error ? error.message : "Server error." }, 500);
  }
};

// Action-based router (used by supabase.functions.invoke("billing", { body })).
app.post("/", billingHandler);
app.post("/billing", billingHandler);

Deno.serve(app.fetch);
