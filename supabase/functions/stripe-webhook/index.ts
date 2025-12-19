import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

type SubscriptionPlan = "free" | "pro" | "premium";
type StripeSubStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "unpaid"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "paused"
  | string;

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing ${name} env var.`);
  return v;
}

function requireStripePriceId(name: string): string {
  const value = requireEnv(name);
  if (!value.startsWith("price_")) {
    throw new Error(`${name} must be a Stripe price id starting with "price_".`);
  }
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

function getSupabaseAdmin() {
  const url = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceRoleKey);
}

function getStripeSecretKey(): string {
  const value = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!value || !value.startsWith("sk_")) throw new Error("STRIPE_SECRET_KEY missing or invalid.");
  return value;
}

async function stripeGet(path: string): Promise<any> {
  const secret = getStripeSecretKey();
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${secret}` },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message ?? `Stripe error (HTTP ${res.status}).`);
  return json;
}

async function stripePost(path: string, params: URLSearchParams): Promise<any> {
  const secret = getStripeSecretKey();
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

function planFromPriceId(priceId: string | null | undefined): SubscriptionPlan | null {
  if (!priceId) return null;
  const pro = requireStripePriceId("STRIPE_PRICE_PRO");
  const premium = requireStripePriceId("STRIPE_PRICE_PREMIUM");
  if (priceId === pro) return "pro";
  if (priceId === premium) return "premium";
  return null;
}

function toIsoFromUnixSeconds(value: unknown): string | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

async function updateProfileByCustomerId(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  customerId: string,
  updates: Record<string, unknown>,
) {
  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("stripe_customer_id", customerId)
    .select("id");
  if (error) throw new Error(error.message);
  return Array.isArray(data) && data.length > 0;
}

async function updateProfileByUserId(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  updates: Record<string, unknown>,
) {
  const { data, error } = await supabase.from("profiles").update(updates).eq("id", userId).select("id");
  if (error) throw new Error(error.message);
  if (!Array.isArray(data) || data.length !== 1) {
    console.error("[stripe-webhook] profile update did not affect exactly 1 row", { userId, updatedRows: data?.length });
    throw new Error("Profile update did not affect exactly 1 row.");
  }
}

async function resolveUserId(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  input: { metadataUserId?: unknown; clientReferenceId?: unknown; customerId?: string | null },
): Promise<string | null> {
  // Priority: metadata.user_id -> client_reference_id -> stripe_customer_id
  if (typeof input.metadataUserId === "string" && input.metadataUserId.trim()) return input.metadataUserId.trim();
  if (typeof input.clientReferenceId === "string" && input.clientReferenceId.trim()) return input.clientReferenceId.trim();
  const customerId = input.customerId;
  if (!customerId) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as any)?.id ?? null;
}

function buildProfileUpdates(base: Record<string, unknown>, extra?: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...base };
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined) continue;
      out[k] = v;
    }
  }
  return out;
}

function isDowngradeStatus(status: StripeSubStatus): boolean {
  const s = String(status).toLowerCase();
  return s === "canceled" || s === "unpaid" || s === "incomplete_expired";
}

function normalizeStripeStatus(status: StripeSubStatus): string {
  const s = String(status ?? "").toLowerCase();
  const allowed = new Set([
    "active",
    "trialing",
    "past_due",
    "canceled",
    "incomplete",
    "incomplete_expired",
    "unpaid",
    "paused",
  ]);
  if (allowed.has(s)) return s;
  return "inactive";
}

function planFromSubscription(subscription: any): SubscriptionPlan | null {
  const priceId = subscription?.items?.data?.[0]?.price?.id as string | undefined;
  const mapped = planFromPriceId(priceId);
  if (mapped) return mapped;
  const metaPlan = subscription?.metadata?.plan;
  if (typeof metaPlan === "string" && (metaPlan === "pro" || metaPlan === "premium")) return metaPlan as SubscriptionPlan;
  return null;
}

function subscriptionUserId(subscription: any): string | null {
  const v = subscription?.metadata?.user_id;
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

async function fetchSubscription(subscriptionId: string): Promise<any> {
  return await stripeGet(`/subscriptions/${encodeURIComponent(subscriptionId)}?expand[]=items.data.price`);
}

async function cancelOtherActiveSubscriptions(customerId: string, keepSubscriptionId: string) {
  // Enforce a single active/trialing subscription per user/customer.
  const list = await stripeGet(
    `/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=20`,
  );
  const subs: any[] = Array.isArray(list?.data) ? list.data : [];
  const active = subs.filter((s) =>
    s?.id && s.id !== keepSubscriptionId && (s.status === "active" || s.status === "trialing")
  );
  for (const s of active) {
    const id = String(s.id);
    console.log("[stripe-webhook] canceling duplicate subscription", { customerId, subscriptionId: id });
    await stripePost(`/subscriptions/${encodeURIComponent(id)}/cancel`, new URLSearchParams());
  }
}

async function resolveUserIdStrict(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  input: { subscription?: any; clientReferenceId?: unknown; customerId?: string | null },
): Promise<string> {
  const fromSubscription = subscriptionUserId(input.subscription);
  if (fromSubscription) return fromSubscription;

  if (typeof input.clientReferenceId === "string" && input.clientReferenceId.trim()) return input.clientReferenceId.trim();

  const fallback = await resolveUserId(supabase, {
    metadataUserId: undefined,
    clientReferenceId: undefined,
    customerId: input.customerId ?? null,
  });
  if (fallback) return fallback;

  throw new Error("Could not resolve user id from subscription metadata or customer id.");
}

Deno.serve(async (req) => {
  console.log("[stripe-webhook] incoming request", { method: req.method });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const webhookSecret = requireEnv("STRIPE_WEBHOOK_SECRET");
  const sigHeader = req.headers.get("stripe-signature") ?? req.headers.get("Stripe-Signature");
  const parsed = parseStripeSignature(sigHeader);
  if (!parsed) {
    console.warn("[stripe-webhook] missing/invalid Stripe-Signature header");
    return json(400, { error: "Invalid Stripe-Signature header." });
  }

  const rawText = await req.text();

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parsed.timestamp) > 5 * 60) {
    return json(400, { error: "Signature timestamp out of tolerance." });
  }

  const signedPayload = `${parsed.timestamp}.${rawText}`;
  const expected = await hmacSha256Hex(webhookSecret, signedPayload);
  const valid = parsed.signatures.some((sig) => timingSafeEqual(sig, expected));
  if (!valid) {
    console.warn("[stripe-webhook] signature verification failed");
    return json(400, { error: "Invalid signature." });
  }

  let event: any;
  try {
    event = JSON.parse(rawText);
  } catch {
    return json(400, { error: "Invalid JSON." });
  }

  const type = String(event?.type ?? "");
  const supabase = getSupabaseAdmin();

  try {
    console.log("[stripe-webhook] event", { type });
    // Stripe can send many event types; we ack unknown types.
    if (type === "checkout.session.completed") {
      const session = event?.data?.object ?? {};
      const customerId = typeof session.customer === "string" ? session.customer : null;
      if (!customerId) {
        console.error("[stripe-webhook] mapping failure: checkout session missing customer id", { sessionId: session?.id });
        return json(500, { error: "Checkout session missing customer id." });
      }

      const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;
      if (!subscriptionId) {
        console.error("[stripe-webhook] mapping failure: checkout session missing subscription id", {
          sessionId: session?.id,
          customerId,
        });
        return json(500, { error: "Missing subscription id on checkout session." });
      }

      // Always fetch the subscription and map using subscription.metadata.user_id (authoritative).
      const sub = await fetchSubscription(subscriptionId);
      const subCustomerId = typeof sub?.customer === "string" ? sub.customer : customerId;
      const userId = await resolveUserIdStrict(supabase, {
        subscription: sub,
        clientReferenceId: session?.client_reference_id,
        customerId: subCustomerId,
      });

      const status = normalizeStripeStatus(String(sub?.status ?? "active") as StripeSubStatus);
      const periodEnd = toIsoFromUnixSeconds(sub?.current_period_end);

      if (subscriptionId && (status === "active" || status === "trialing")) {
        await cancelOtherActiveSubscriptions(subCustomerId, subscriptionId);
      }

      if (isDowngradeStatus(status)) {
        await updateProfileByUserId(
          supabase,
          userId,
          buildProfileUpdates(
            { stripe_customer_id: subCustomerId },
            {
              subscription_plan: "free",
              subscription_status: "canceled",
              stripe_subscription_id: null,
              current_period_end: null,
            },
          ),
        );
        console.log("[stripe-webhook] applied", { type, userId, plan: "free", status: "canceled", subscriptionId });
        return ok({ received: true });
      }

      const plan = planFromSubscription(sub);
      if (!plan) {
        console.error("[stripe-webhook] mapping failure: could not map plan from subscription price id", {
          type,
          subscriptionId,
          customerId: subCustomerId,
        });
        return json(500, { error: "Could not map plan for subscription." });
      }

      await updateProfileByUserId(
        supabase,
        userId,
        buildProfileUpdates(
          { stripe_customer_id: subCustomerId },
          {
            stripe_subscription_id: subscriptionId,
            subscription_plan: plan,
            subscription_status: status,
            current_period_end: periodEnd ?? null,
          },
        ),
      );

      console.log("[stripe-webhook] applied", { type, userId, plan, status, subscriptionId });

      return ok({ received: true });
    }

    if (
      type === "customer.subscription.created" ||
      type === "customer.subscription.updated" ||
      type === "customer.subscription.deleted"
    ) {
      const payload = event?.data?.object ?? {};
      const customerId = typeof payload.customer === "string" ? payload.customer : null;
      const subscriptionId = typeof payload.id === "string" ? payload.id : null;
      if (!customerId) {
        console.error("[stripe-webhook] mapping failure: subscription event missing customer id", { type, subscriptionId });
        return json(500, { error: "Subscription event missing customer id." });
      }
      if (!subscriptionId) {
        console.error("[stripe-webhook] mapping failure: subscription event missing id", { type, customerId });
        return json(500, { error: "Subscription event missing id." });
      }

      // Always fetch the subscription and map using subscription.metadata.user_id (authoritative).
      const sub = await fetchSubscription(subscriptionId);
      const subCustomerId = typeof sub?.customer === "string" ? sub.customer : customerId;
      const userId = await resolveUserIdStrict(supabase, { subscription: sub, customerId: subCustomerId });

      const status = normalizeStripeStatus(String(sub?.status ?? "active") as StripeSubStatus);
      const periodEnd = toIsoFromUnixSeconds(sub?.current_period_end);

      if (subscriptionId && (status === "active" || status === "trialing")) {
        await cancelOtherActiveSubscriptions(subCustomerId, subscriptionId);
      }

      if (type === "customer.subscription.deleted" || isDowngradeStatus(status)) {
        await updateProfileByUserId(
          supabase,
          userId,
          buildProfileUpdates(
            { stripe_customer_id: subCustomerId },
            {
              subscription_plan: "free",
              subscription_status: "canceled",
              stripe_subscription_id: null,
              current_period_end: null,
            },
          ),
        );
        console.log("[stripe-webhook] applied", { type, userId, plan: "free", status: "canceled", subscriptionId });
        return ok({ received: true });
      }

      const plan = planFromSubscription(sub);
      if (!plan) {
        console.error("[stripe-webhook] mapping failure: could not map plan from subscription price id", {
          subscriptionId,
          customerId: subCustomerId,
        });
        return json(500, { error: "Could not map plan for subscription." });
      }

      await updateProfileByUserId(
        supabase,
        userId,
        buildProfileUpdates(
          { stripe_customer_id: subCustomerId },
          {
            stripe_subscription_id: subscriptionId,
            subscription_plan: plan,
            subscription_status: status,
            current_period_end: periodEnd ?? null,
          },
        ),
      );

      console.log("[stripe-webhook] applied", { type, userId, plan, status, subscriptionId });

      return ok({ received: true });
    }

    if (type === "invoice.payment_succeeded" || type === "invoice.payment_failed") {
      const invoice = event?.data?.object ?? {};
      const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
      if (!customerId) {
        console.error("[stripe-webhook] mapping failure: invoice missing customer id", { type, invoiceId: invoice?.id });
        return json(500, { error: "Invoice missing customer id." });
      }

      const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : null;
      if (!subscriptionId) {
        console.error("[stripe-webhook] mapping failure: invoice missing subscription id", {
          type,
          invoiceId: invoice?.id,
          customerId,
        });
        return json(500, { error: "Invoice missing subscription id." });
      }

      // Fetch the subscription so we can map using subscription.metadata.user_id (authoritative).
      const sub = await fetchSubscription(subscriptionId);
      const subCustomerId = typeof sub?.customer === "string" ? sub.customer : customerId;
      const userId = await resolveUserIdStrict(supabase, { subscription: sub, customerId: subCustomerId });

      let status = normalizeStripeStatus(String(sub?.status ?? "active") as StripeSubStatus);
      if (type === "invoice.payment_failed" && (status === "active" || status === "trialing")) status = "past_due";

      const periodEnd = toIsoFromUnixSeconds(sub?.current_period_end);

      if (isDowngradeStatus(status)) {
        await updateProfileByUserId(
          supabase,
          userId,
          buildProfileUpdates(
            { stripe_customer_id: subCustomerId },
            {
              subscription_plan: "free",
              subscription_status: "canceled",
              stripe_subscription_id: null,
              current_period_end: null,
            },
          ),
        );
        console.log("[stripe-webhook] applied", { type, userId, plan: "free", status: "canceled", subscriptionId });
        return ok({ received: true });
      }

      const plan = planFromSubscription(sub);
      if (!plan) {
        console.error("[stripe-webhook] mapping failure: could not map plan from subscription price id (invoice event)", {
          subscriptionId,
          customerId: subCustomerId,
        });
        return json(500, { error: "Could not map plan for subscription." });
      }

      await updateProfileByUserId(
        supabase,
        userId,
        buildProfileUpdates(
          { stripe_customer_id: subCustomerId },
          {
            stripe_subscription_id: subscriptionId,
            subscription_plan: plan,
            subscription_status: status,
            current_period_end: periodEnd ?? null,
          },
        ),
      );

      console.log("[stripe-webhook] applied", { type, userId, plan, status, subscriptionId });

      return ok({ received: true });
    }

    return ok({ received: true });
  } catch (e) {
    console.error("[stripe-webhook] handler error", e, { type });
    return json(500, { error: "Webhook handler failed" });
  }
});
