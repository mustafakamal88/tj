import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

type SubscriptionPlan = "free" | "pro" | "premium";

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
      "Access-Control-Allow-Origin": "*",
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

async function resolveUserIdByCustomerId(supabase: ReturnType<typeof getSupabaseAdmin>, customerId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as any)?.id as string | null;
}

async function updateProfile(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  updates: Record<string, unknown>,
) {
  const { error } = await supabase.from("profiles").update(updates).eq("id", userId);
  if (error) throw new Error(error.message);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "content-type, stripe-signature",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const webhookSecret = requireEnv("STRIPE_WEBHOOK_SECRET");
  const sigHeader = req.headers.get("stripe-signature") ?? req.headers.get("Stripe-Signature");
  const parsed = parseStripeSignature(sigHeader);
  if (!parsed) return json(400, { error: "Invalid Stripe-Signature header." });

  const rawBytes = new Uint8Array(await req.arrayBuffer());
  const rawText = new TextDecoder().decode(rawBytes);

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parsed.timestamp) > 5 * 60) {
    return json(400, { error: "Signature timestamp out of tolerance." });
  }

  const signedPayload = `${parsed.timestamp}.${rawText}`;
  const expected = await hmacSha256Hex(webhookSecret, signedPayload);
  const valid = parsed.signatures.some((sig) => timingSafeEqual(sig, expected));
  if (!valid) return json(400, { error: "Invalid signature." });

  let event: any;
  try {
    event = JSON.parse(rawText);
  } catch {
    return json(400, { error: "Invalid JSON." });
  }

  const type = String(event?.type ?? "");
  const supabase = getSupabaseAdmin();

  try {
    if (type === "checkout.session.completed") {
      const session = event?.data?.object ?? {};
      const customerId = typeof session.customer === "string" ? session.customer : null;
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;
      const userId =
        (typeof session.client_reference_id === "string" && session.client_reference_id) ||
        (typeof session.metadata?.user_id === "string" && session.metadata.user_id) ||
        (customerId ? await resolveUserIdByCustomerId(supabase, customerId) : null);

      if (!userId) {
        console.warn("[stripe-webhook] checkout.session.completed: user not resolved");
        return ok({ received: true });
      }

      if (subscriptionId) {
        const sub = await stripeGet(`/subscriptions/${encodeURIComponent(subscriptionId)}?expand[]=items.data.price`);
        const status = String(sub?.status ?? "active");
        const periodEnd = toIsoFromUnixSeconds(sub?.current_period_end);
        const priceId = sub?.items?.data?.[0]?.price?.id as string | undefined;
        const plan = planFromPriceId(priceId) ?? (sub?.metadata?.plan as SubscriptionPlan | undefined) ?? "pro";

        await updateProfile(supabase, userId, {
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          subscription_plan: plan,
          subscription_status: status,
          current_period_end: periodEnd,
        });
      } else {
        const plan =
          (typeof session.metadata?.plan === "string" && (session.metadata.plan as SubscriptionPlan)) || "pro";
        const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await updateProfile(supabase, userId, {
          stripe_customer_id: customerId,
          subscription_plan: plan,
          subscription_status: "active",
          current_period_end: periodEnd,
        });
      }
      return ok({ received: true });
    }

    if (
      type === "customer.subscription.created" ||
      type === "customer.subscription.updated" ||
      type === "customer.subscription.deleted"
    ) {
      const sub = event?.data?.object ?? {};
      const customerId = typeof sub.customer === "string" ? sub.customer : null;
      const subscriptionId = typeof sub.id === "string" ? sub.id : null;
      const status = String(sub?.status ?? "active");
      const periodEnd = toIsoFromUnixSeconds(sub?.current_period_end);
      const priceId = sub?.items?.data?.[0]?.price?.id as string | undefined;
      const plan = planFromPriceId(priceId) ?? (sub?.metadata?.plan as SubscriptionPlan | undefined) ?? null;
      const userId =
        (typeof sub?.metadata?.user_id === "string" && sub.metadata.user_id) ||
        (customerId ? await resolveUserIdByCustomerId(supabase, customerId) : null);

      if (!userId) {
        console.warn("[stripe-webhook] subscription event: user not resolved");
        return ok({ received: true });
      }

      const planToSet: SubscriptionPlan =
        status === "canceled" || type === "customer.subscription.deleted" ? "free" : plan ?? "free";

      await updateProfile(supabase, userId, {
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        subscription_plan: planToSet,
        subscription_status: status,
        current_period_end: periodEnd,
      });

      return ok({ received: true });
    }

    return ok({ received: true });
  } catch (e) {
    console.error("[stripe-webhook] handler error", e, { type });
    return json(500, { error: "Webhook handler failed" });
  }
});

