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

// Stamped at deploy time via Supabase secret `BUILD_ID` (see `scripts/deploy-functions.sh`).
const BUILD_ID = Deno.env.get("BUILD_ID") ?? "dev";

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
  console.log("[stripe-webhook] profile updated", { userId, profileId: (data as any[])[0]?.id, updatedRows: data.length });
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
  // Default to a DB-safe, conservative status (does not grant access).
  return "incomplete";
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

function isStripeSubscriptionId(value: string): boolean {
  return value.startsWith("sub_");
}

type InvoiceSubscriptionCandidate = { id: string; source: string };

function findInvoiceSubscriptionCandidate(invoice: any): InvoiceSubscriptionCandidate | null {
  const direct = invoice?.subscription;
  if (typeof direct === "string" && isStripeSubscriptionId(direct)) {
    return { id: direct, source: "invoice.subscription" };
  }

  const parentSub = invoice?.parent?.subscription_details?.subscription;
  if (typeof parentSub === "string" && isStripeSubscriptionId(parentSub)) {
    return { id: parentSub, source: "invoice.parent.subscription_details.subscription" };
  }

  const lines: any[] = Array.isArray(invoice?.lines?.data) ? invoice.lines.data : [];
  for (const line of lines) {
    const lineSub = line?.subscription;
    if (typeof lineSub === "string" && isStripeSubscriptionId(lineSub)) {
      return { id: lineSub, source: "invoice.lines[].subscription" };
    }

    const fromLineParent = line?.parent?.subscription_item_details?.subscription;
    if (typeof fromLineParent === "string" && isStripeSubscriptionId(fromLineParent)) {
      return { id: fromLineParent, source: "invoice.lines[].parent.subscription_item_details.subscription" };
    }
  }

  return null;
}

function getInvoiceSubscriptionId(invoice: any): string | null {
  return findInvoiceSubscriptionCandidate(invoice)?.id ?? null;
}

type InvoiceSubscriptionItemCandidate = { id: string; source: string };

function findInvoiceSubscriptionItemCandidate(invoice: any): InvoiceSubscriptionItemCandidate | null {
  const lines: any[] = Array.isArray(invoice?.lines?.data) ? invoice.lines.data : [];
  for (const line of lines) {
    const direct = line?.subscription_item;
    if (typeof direct === "string" && direct.trim()) {
      return { id: direct.trim(), source: "invoice.lines[].subscription_item" };
    }

    const nested = line?.parent?.subscription_item_details?.subscription_item;
    if (typeof nested === "string" && nested.trim()) {
      return { id: nested.trim(), source: "invoice.lines[].parent.subscription_item_details.subscription_item" };
    }
  }
  return null;
}

function getInvoiceMetadataUserId(invoice: any): unknown {
  if (invoice?.metadata?.user_id != null) return invoice.metadata.user_id;

  const parentUserId = invoice?.parent?.subscription_details?.metadata?.user_id;
  if (parentUserId != null) return parentUserId;

  const lines: any[] = Array.isArray(invoice?.lines?.data) ? invoice.lines.data : [];
  for (const line of lines) {
    const lineUserId = line?.metadata?.user_id;
    if (lineUserId != null) return lineUserId;
  }

  return null;
}

function invoiceLooksPaid(invoice: any): boolean {
  if (invoice?.paid === true) return true;
  if (typeof invoice?.status === "string" && invoice.status.toLowerCase() === "paid") return true;
  if (invoice?.status_transitions?.paid_at != null) return true;
  if (typeof invoice?.amount_paid === "number" && typeof invoice?.amount_remaining === "number") {
    return invoice.amount_paid > 0 && invoice.amount_remaining === 0;
  }
  return false;
}

async function fetchSubscription(subscriptionId: string): Promise<any> {
  return await stripeGet(`/subscriptions/${encodeURIComponent(subscriptionId)}?expand[]=items.data.price`);
}

async function fetchSubscriptionItem(subscriptionItemId: string): Promise<any> {
  return await stripeGet(`/subscription_items/${encodeURIComponent(subscriptionItemId)}`);
}

async function findMostRelevantSubscriptionIdForCustomer(customerId: string): Promise<string | null> {
  const list = await stripeGet(
    `/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=20`,
  );
  const subs: any[] = Array.isArray(list?.data) ? list.data : [];
  let firstPastDue: string | null = null;

  // Stripe lists are sorted by created desc by default.
  for (const sub of subs) {
    const id = typeof sub?.id === "string" ? sub.id : null;
    if (!id || !isStripeSubscriptionId(id)) continue;
    const status = String(sub?.status ?? "").toLowerCase();

    if (status === "active" || status === "trialing") return id;
    if (status === "past_due" && !firstPastDue) firstPastDue = id;
  }

  return firstPastDue;
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
  input: { subscription?: any; metadataUserId?: unknown; clientReferenceId?: unknown; customerId?: string | null },
): Promise<string> {
  const fromSubscription = subscriptionUserId(input.subscription);
  if (fromSubscription) return fromSubscription;

  if (typeof input.metadataUserId === "string" && input.metadataUserId.trim()) return input.metadataUserId.trim();

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
  console.log("[stripe-webhook] build", { BUILD_ID });
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

  const rawType = event?.type;
  const type = typeof rawType === "string" ? rawType : String(rawType ?? "");
  const eventId = typeof event?.id === "string" ? event.id : null;
  const objGuess = event?.data?.object ?? {};
  const customerIdGuess = typeof objGuess?.customer === "string" ? objGuess.customer : null;
  const subscriptionIdGuess = type.startsWith("invoice.")
    ? getInvoiceSubscriptionId(objGuess)
    : typeof objGuess?.subscription === "string"
      ? objGuess.subscription
      : typeof objGuess?.id === "string" && String(objGuess.id).startsWith("sub_")
        ? String(objGuess.id)
        : null;

  try {
    console.log("[stripe-webhook] event", {
      BUILD_ID,
      eventId,
      type,
      typeOf: typeof rawType,
      typeJson: JSON.stringify(type),
      customerIdGuess,
      subscriptionIdGuess,
    });
    const supabase = getSupabaseAdmin();
    // Stripe can send many event types; we ack unknown types.
    if (type === "checkout.session.completed") {
      const session = event?.data?.object ?? {};
      const customerId = typeof session.customer === "string" ? session.customer : null;
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;
      const clientReferenceId = session?.client_reference_id ?? null;
      console.log("[stripe-webhook] checkout.session.completed", {
        eventId,
        sessionId: session?.id ?? null,
        customerId,
        subscriptionId,
        clientReferenceId,
      });
      if (!customerId) {
        console.error("[stripe-webhook] mapping failure: checkout session missing customer id", { eventId, sessionId: session?.id });
        return json(500, { error: "Checkout session missing customer id." });
      }

      if (!subscriptionId) {
        console.error("[stripe-webhook] mapping failure: checkout session missing subscription id", {
          eventId,
          sessionId: session?.id,
          customerId,
        });
        return json(500, { error: "Missing subscription id on checkout session." });
      }
      if (!isStripeSubscriptionId(subscriptionId)) {
        console.error("[stripe-webhook] mapping failure: invalid subscription id on checkout session", {
          eventId,
          sessionId: session?.id,
          customerId,
          subscriptionId,
        });
        return json(500, { error: "Invalid subscription id on checkout session." });
      }

      // Always fetch the subscription and map using subscription.metadata.user_id (authoritative).
      const sub = await fetchSubscription(subscriptionId);
      const subCustomerId = typeof sub?.customer === "string" ? sub.customer : customerId;
      const priceId = sub?.items?.data?.[0]?.price?.id as string | undefined;
      const subMetaUserId = subscriptionUserId(sub);
      const userId = await resolveUserIdStrict(supabase, {
        subscription: sub,
        clientReferenceId,
        customerId: subCustomerId,
      });

      const status = normalizeStripeStatus(String(sub?.status ?? "active") as StripeSubStatus);
      const periodEnd = toIsoFromUnixSeconds(sub?.current_period_end);
      const plan = planFromSubscription(sub);
      console.log("[stripe-webhook] checkout.subscription", {
        eventId,
        customerId: subCustomerId,
        subscriptionId,
        status,
        metadataUserId: subMetaUserId,
        resolvedUserId: userId,
        priceId: priceId ?? null,
        mappedPlan: plan ?? null,
      });

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

      if (!plan) {
        console.error("[stripe-webhook] mapping failure: could not map plan from subscription price id", {
          eventId,
          type,
          subscriptionId,
          customerId: subCustomerId,
          priceId: priceId ?? null,
          metadataPlan: sub?.metadata?.plan ?? null,
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
      console.log("[stripe-webhook] customer.subscription.*", {
        eventId,
        type,
        customerId,
        subscriptionId,
        payloadStatus: payload?.status ?? null,
      });
      if (!customerId) {
        console.error("[stripe-webhook] mapping failure: subscription event missing customer id", { type, subscriptionId });
        return json(500, { error: "Subscription event missing customer id." });
      }
      if (!subscriptionId) {
        console.error("[stripe-webhook] mapping failure: subscription event missing id", { type, customerId });
        return json(500, { error: "Subscription event missing id." });
      }
      if (!isStripeSubscriptionId(subscriptionId)) {
        console.error("[stripe-webhook] mapping failure: invalid subscription id on subscription event", {
          eventId,
          type,
          customerId,
          subscriptionId,
        });
        return json(500, { error: "Invalid subscription id on subscription event." });
      }

      // Always fetch the subscription and map using subscription.metadata.user_id (authoritative).
      const sub = await fetchSubscription(subscriptionId);
      const subCustomerId = typeof sub?.customer === "string" ? sub.customer : customerId;
      const priceId = sub?.items?.data?.[0]?.price?.id as string | undefined;
      const subMetaUserId = subscriptionUserId(sub);
      const userId = await resolveUserIdStrict(supabase, { subscription: sub, customerId: subCustomerId });

      const status = normalizeStripeStatus(String(sub?.status ?? "active") as StripeSubStatus);
      const periodEnd = toIsoFromUnixSeconds(sub?.current_period_end);
      const plan = planFromSubscription(sub);
      console.log("[stripe-webhook] subscription.snapshot", {
        eventId,
        type,
        customerId: subCustomerId,
        subscriptionId,
        status,
        metadataUserId: subMetaUserId,
        resolvedUserId: userId,
        priceId: priceId ?? null,
        mappedPlan: plan ?? null,
      });

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

      if (!plan) {
        console.error("[stripe-webhook] mapping failure: could not map plan from subscription price id", {
          eventId,
          subscriptionId,
          customerId: subCustomerId,
          priceId: priceId ?? null,
          metadataPlan: sub?.metadata?.plan ?? null,
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
      type === "invoice.payment_succeeded" ||
      type === "invoice.payment_failed" ||
      type === "invoice.paid" ||
      type === "invoice.created" ||
      type === "invoice.finalized"
    ) {
      const invoice = event?.data?.object ?? {};
      const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
      const invoiceCandidate = findInvoiceSubscriptionCandidate(invoice);
      let subscriptionId = invoiceCandidate?.id ?? null;
      let subscriptionIdSource = invoiceCandidate?.source ?? null;
      const invoiceMetaUserId = getInvoiceMetadataUserId(invoice);
      const invoiceStatus = typeof invoice?.status === "string" ? invoice.status : null;
      const invoiceBillingReason = typeof invoice?.billing_reason === "string" ? invoice.billing_reason : null;
      const shouldSkip = (type === "invoice.created" || type === "invoice.finalized") && !invoiceLooksPaid(invoice);
      console.log("[stripe-webhook] invoice.payment_*", {
        eventId,
        type,
        invoiceId: invoice?.id ?? null,
        customerId,
        subscriptionId,
        invoiceMetaUserId,
        invoiceStatus,
        invoiceBillingReason,
        shouldSkip,
      });
      if (shouldSkip) return ok({ received: true });
      if (!customerId) {
        console.error("[stripe-webhook] mapping failure: invoice missing customer id", { type, invoiceId: invoice?.id });
        return json(500, { error: "Invoice missing customer id." });
      }

      if (!subscriptionId) {
        const itemCandidate = findInvoiceSubscriptionItemCandidate(invoice);
        if (itemCandidate) {
          try {
            const subItem = await fetchSubscriptionItem(itemCandidate.id);
            const subId = typeof subItem?.subscription === "string"
              ? subItem.subscription
              : typeof subItem?.subscription?.id === "string"
                ? subItem.subscription.id
                : null;
            if (typeof subId === "string" && isStripeSubscriptionId(subId)) {
              subscriptionId = subId;
              subscriptionIdSource = "subscription_item.lookup";
              console.log("[stripe-webhook] recovered subscriptionId via subscription_item lookup", {
                eventId,
                type,
                invoiceId: invoice?.id ?? null,
                customerId,
                subscriptionId,
                subscriptionItemId: itemCandidate.id,
                subscriptionItemSource: itemCandidate.source,
              });
            }
          } catch (e) {
            console.error("[stripe-webhook] subscription_item lookup failed", {
              eventId,
              type,
              invoiceId: invoice?.id ?? null,
              customerId,
              subscriptionItemId: itemCandidate.id,
              subscriptionItemSource: itemCandidate.source,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
      }

      if (!subscriptionId) {
        const recovered = await findMostRelevantSubscriptionIdForCustomer(customerId);
        if (recovered) {
          subscriptionId = recovered;
          subscriptionIdSource = "customer.lookup";
          console.log("[stripe-webhook] recovered subscriptionId from customer lookup", {
            eventId,
            type,
            invoiceId: invoice?.id ?? null,
            customerId,
            subscriptionId,
            billingReason: invoiceBillingReason,
            linesCount: Array.isArray(invoice?.lines?.data) ? invoice.lines.data.length : 0,
          });
        }
      } else if (invoiceCandidate && invoiceCandidate.source !== "invoice.subscription") {
        console.log("[stripe-webhook] recovered subscriptionId from invoice fields", {
          eventId,
          type,
          invoiceId: invoice?.id ?? null,
          customerId,
          subscriptionId,
          source: invoiceCandidate.source,
        });
      }

      if (!subscriptionId) {
        // Some Stripe configurations deliver invoice.* events for non-subscription invoices. Only fail loudly if it
        // looks like a subscription invoice; otherwise ACK 200 to avoid noisy retries.
        const looksLikeSubscriptionInvoice = invoiceBillingReason?.toLowerCase().startsWith("subscription") ||
          invoice?.parent?.subscription_details?.subscription != null;
        if (!looksLikeSubscriptionInvoice) {
          return ok({ received: true });
        }
        console.error("[stripe-webhook] mapping failure: invoice missing subscription id", {
          eventId,
          type,
          invoiceId: invoice?.id ?? null,
          customerId,
          billingReason: invoiceBillingReason,
          linesCount: Array.isArray(invoice?.lines?.data) ? invoice.lines.data.length : 0,
        });
        return json(500, { error: "Invoice missing subscription id." });
      }
      if (!isStripeSubscriptionId(subscriptionId)) {
        console.error("[stripe-webhook] mapping failure: invalid subscription id on invoice", {
          eventId,
          type,
          invoiceId: invoice?.id ?? null,
          customerId,
          subscriptionId,
        });
        return json(500, { error: "Invalid subscription id on invoice." });
      }

      console.log("[stripe-webhook] invoice subscriptionId resolved", {
        eventId,
        type,
        invoiceId: invoice?.id ?? null,
        customerId,
        subscriptionId,
        source: subscriptionIdSource ?? "unknown",
      });

      // Fetch the subscription so we can map using subscription.metadata.user_id (authoritative).
      const sub = await fetchSubscription(subscriptionId);
      const subCustomerId = typeof sub?.customer === "string" ? sub.customer : customerId;
      const priceId = sub?.items?.data?.[0]?.price?.id as string | undefined;
      const subMetaUserId = subscriptionUserId(sub);
      const userId = await resolveUserIdStrict(supabase, {
        subscription: sub,
        metadataUserId: invoiceMetaUserId,
        customerId: subCustomerId,
      });

      let status = normalizeStripeStatus(String(sub?.status ?? "active") as StripeSubStatus);
      if (type === "invoice.payment_failed" && (status === "active" || status === "trialing")) status = "past_due";

      const periodEnd = toIsoFromUnixSeconds(sub?.current_period_end);
      const plan = planFromSubscription(sub);
      console.log("[stripe-webhook] invoice.subscription", {
        eventId,
        type,
        customerId: subCustomerId,
        subscriptionId,
        status,
        metadataUserId: subMetaUserId,
        invoiceMetaUserId,
        resolvedUserId: userId,
        priceId: priceId ?? null,
        mappedPlan: plan ?? null,
      });

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

      if (!plan) {
        console.error("[stripe-webhook] mapping failure: could not map plan from subscription price id (invoice event)", {
          eventId,
          subscriptionId,
          customerId: subCustomerId,
          priceId: priceId ?? null,
          metadataPlan: sub?.metadata?.plan ?? null,
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

    // Unknown/unhandled events: log minimal context so mismatches are obvious, but always ACK 200.
    console.log("[stripe-webhook] unhandled", {
      BUILD_ID,
      eventId,
      type,
      customerIdGuess,
      subscriptionIdGuess,
    });
    return ok({ received: true });
  } catch (e) {
    console.error("[stripe-webhook] handler error", e, { eventId, type });
    const message = e instanceof Error ? e.message : "Webhook handler failed";
    return json(500, { error: message });
  }
});
