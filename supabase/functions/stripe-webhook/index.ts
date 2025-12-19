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
  const { error } = await supabase.from("profiles").update(updates).eq("id", userId);
  if (error) throw new Error(error.message);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const webhookSecret = requireEnv("STRIPE_WEBHOOK_SECRET");
  const sigHeader = req.headers.get("stripe-signature") ?? req.headers.get("Stripe-Signature");
  const parsed = parseStripeSignature(sigHeader);
  if (!parsed) return json(400, { error: "Invalid Stripe-Signature header." });

  const rawText = await req.text();

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
    // Stripe can send many event types; we ack unknown types.
    if (type === "checkout.session.completed") {
      const session = event?.data?.object ?? {};
      const customerId = typeof session.customer === "string" ? session.customer : null;
      if (!customerId) return ok({ received: true });

      const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;
      const plan =
        (typeof session.metadata?.plan === "string" && (session.metadata.plan as SubscriptionPlan)) || null;
      const fallbackUserId =
        (typeof session.metadata?.user_id === "string" && session.metadata.user_id) ||
        (typeof session.client_reference_id === "string" && session.client_reference_id) ||
        null;

      const updated = await updateProfileByCustomerId(supabase, customerId, {
        stripe_subscription_id: subscriptionId,
        subscription_plan: plan ?? undefined,
        subscription_status: "active",
      });
      if (!updated && fallbackUserId) {
        await updateProfileByUserId(supabase, fallbackUserId, {
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          subscription_plan: plan ?? undefined,
          subscription_status: "active",
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
      if (!customerId) return ok({ received: true });

      const subscriptionId = typeof sub.id === "string" ? sub.id : null;
      const status = String(sub?.status ?? "active");
      const periodEnd = toIsoFromUnixSeconds(sub?.current_period_end);
      const priceId = sub?.items?.data?.[0]?.price?.id as string | undefined;
      const plan = planFromPriceId(priceId) ?? (sub?.metadata?.plan as SubscriptionPlan | undefined) ?? null;

      const updated = await updateProfileByCustomerId(supabase, customerId, {
        stripe_subscription_id: subscriptionId,
        subscription_plan: plan ?? undefined,
        subscription_status: status,
        current_period_end: periodEnd ?? undefined,
      });
      if (!updated && typeof sub?.metadata?.user_id === "string") {
        await updateProfileByUserId(supabase, String(sub.metadata.user_id), {
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          subscription_plan: plan ?? undefined,
          subscription_status: status,
          current_period_end: periodEnd ?? undefined,
        });
      }

      return ok({ received: true });
    }

    if (type === "invoice.payment_succeeded" || type === "invoice.payment_failed") {
      const invoice = event?.data?.object ?? {};
      const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
      if (!customerId) return ok({ received: true });

      const status = type === "invoice.payment_failed" ? "past_due" : "active";
      const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : null;

      const line = Array.isArray(invoice?.lines?.data) ? invoice.lines.data[0] : null;
      const priceId = line?.price?.id as string | undefined;
      const plan = planFromPriceId(priceId) ?? null;
      const periodEnd = toIsoFromUnixSeconds(line?.period?.end ?? invoice?.period_end);

      const updated = await updateProfileByCustomerId(supabase, customerId, {
        stripe_subscription_id: subscriptionId,
        subscription_plan: plan ?? undefined,
        subscription_status: status,
        current_period_end: periodEnd ?? undefined,
      });
      if (!updated && typeof invoice?.metadata?.user_id === "string") {
        await updateProfileByUserId(supabase, String(invoice.metadata.user_id), {
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          subscription_plan: plan ?? undefined,
          subscription_status: status,
          current_period_end: periodEnd ?? undefined,
        });
      }

      return ok({ received: true });
    }

    return ok({ received: true });
  } catch (e) {
    console.error("[stripe-webhook] handler error", e, { type });
    return json(500, { error: "Webhook handler failed" });
  }
});
