import 'dotenv/config';

import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import MetaApi from 'metaapi.cloud-sdk/esm-node';

const PORT = Number(process.env.PORT ?? 8787);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const METAAPI_TOKEN = process.env.METAAPI_TOKEN;

const KV_TABLE = process.env.SUPABASE_KV_TABLE ?? 'kv_store_a46fa5d6';
const LOOKBACK_DAYS = Number(process.env.MT_SYNC_LOOKBACK_DAYS ?? 365);
const METAAPI_ACCOUNT_TYPE = process.env.METAAPI_ACCOUNT_TYPE ?? 'cloud';
const METAAPI_RELIABILITY = process.env.METAAPI_RELIABILITY ?? 'high';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}
if (!METAAPI_TOKEN) {
  throw new Error('Missing METAAPI_TOKEN');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const metaapi = new MetaApi(METAAPI_TOKEN);

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));

const CONNECTION_KEY_PREFIX = 'mt_metaapi_user:';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function ok(res, data) {
  res.json({ ok: true, data });
}

function fail(res, status, error) {
  res.status(status).json({ ok: false, error });
}

function getBearerToken(req) {
  const auth = req.header('authorization') ?? '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

async function requireUserId(req) {
  const token = getBearerToken(req);
  if (!token) throw new HttpError(401, 'Missing Authorization bearer token');
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) throw new HttpError(401, 'Invalid Authorization token');
  return data.user.id;
}

async function kvGet(key) {
  const { data, error } = await supabase.from(KV_TABLE).select('value').eq('key', key).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.value ?? null;
}

async function kvSet(key, value) {
  const { error } = await supabase.from(KV_TABLE).upsert({ key, value });
  if (error) throw new Error(error.message);
}

async function kvDel(key) {
  const { error } = await supabase.from(KV_TABLE).delete().eq('key', key);
  if (error) throw new Error(error.message);
}

function deterministicUuid(seed) {
  const hash = crypto.createHash('sha256').update(seed).digest();
  const bytes = Uint8Array.from(hash.subarray(0, 16));

  // RFC4122-ish formatting (v4 style, deterministic input)
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Buffer.from(bytes).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function outcomeFromPnL(pnl) {
  if (pnl > 0) return 'win';
  if (pnl < 0) return 'loss';
  return 'breakeven';
}

function pnlPercentage(entry, exit, type) {
  if (!Number.isFinite(entry) || entry === 0) return 0;
  const raw = ((exit - entry) / entry) * 100;
  return type === 'short' ? -raw : raw;
}

function normalizeSymbol(value) {
  return String(value ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

function weightedAverage(items) {
  let total = 0;
  let weight = 0;
  for (const { price, volume } of items) {
    if (!Number.isFinite(price) || !Number.isFinite(volume) || volume <= 0) continue;
    total += price * volume;
    weight += volume;
  }
  if (weight === 0) return null;
  return total / weight;
}

function parseDealTypeToTradeType(dealType) {
  const type = String(dealType ?? '').toUpperCase();
  if (type.includes('BUY')) return 'long';
  if (type.includes('SELL')) return 'short';
  return null;
}

function isEntryDeal(entryType) {
  const t = String(entryType ?? '').toUpperCase();
  return t === 'DEAL_ENTRY_IN' || t === 'DEAL_ENTRY_INOUT';
}

function isExitDeal(entryType) {
  const t = String(entryType ?? '').toUpperCase();
  return t === 'DEAL_ENTRY_OUT' || t === 'DEAL_ENTRY_OUT_BY' || t === 'DEAL_ENTRY_INOUT';
}

async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('subscription_plan,trial_start_at')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

async function getMyTradeCount(userId) {
  const { count } = await supabase
    .from('trades')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  return count ?? 0;
}

async function enforceFreePlanLimits(userId, tradeIdsToUpsert) {
  const profile = await getProfile(userId);
  if (!profile) throw new HttpError(404, 'Profile not found');
  if (profile.subscription_plan !== 'free') return;

  const trialStart = new Date(profile.trial_start_at);
  const expired = Number.isNaN(trialStart.getTime())
    ? false
    : Date.now() - trialStart.getTime() > 14 * 24 * 60 * 60 * 1000;
  if (expired) throw new HttpError(403, 'Your 14-day free trial has ended. Upgrade to keep syncing trades.');

  const existingCount = await getMyTradeCount(userId);

  // Only count IDs that do not exist yet.
  const chunks = [];
  for (let i = 0; i < tradeIdsToUpsert.length; i += 500) {
    chunks.push(tradeIdsToUpsert.slice(i, i + 500));
  }

  const existing = new Set();
  for (const ids of chunks) {
    const { data, error } = await supabase.from('trades').select('id').in('id', ids);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) existing.add(row.id);
  }

  const newInserts = tradeIdsToUpsert.filter((id) => !existing.has(id)).length;
  if (existingCount + newInserts > 15) {
    throw new HttpError(403, 'Free plan is limited to 15 trades. Upgrade to sync unlimited trades.');
  }
}

async function ensureAccount({ existingAccountId, platform, server, login, password }) {
  const desiredPlatform = platform === 'MT4' ? 'mt4' : 'mt5';
  const name = `TJ ${login}`;

  if (existingAccountId) {
    try {
      const account = await metaapi.metatraderAccountApi.getAccount(existingAccountId);
      // Cannot update login/platform; if user changed login we re-create.
      await account.update({ name, password, server, magic: 0 });
      await account.redeploy();
      return account;
    } catch {
      // fallback to creating new
    }
  }

  const account = await metaapi.metatraderAccountApi.createAccount({
    name,
    type: METAAPI_ACCOUNT_TYPE,
    login,
    platform: desiredPlatform,
    password,
    server,
    magic: 0,
    reliability: METAAPI_RELIABILITY,
  });

  await account.deploy();
  return account;
}

let cachedMetaStats = null;
async function getMetaStatsClient() {
  if (cachedMetaStats) return cachedMetaStats;
  const mod = await import('metaapi.cloud-sdk/esm-node');
  const MetaStatsCtor = mod?.MetaStats ?? mod?.default?.MetaStats;
  if (!MetaStatsCtor) {
    throw new Error('MetaStats is not available in the installed metaapi.cloud-sdk package.');
  }
  cachedMetaStats = new MetaStatsCtor(METAAPI_TOKEN);
  return cachedMetaStats;
}

async function fetchDeals(connection, startTime, endTime) {
  const limit = 1000;
  let offset = 0;
  const all = [];

  while (true) {
    const result = await connection.getDealsByTimeRange(startTime, endTime, offset, limit);
    const page = Array.isArray(result?.deals) ? result.deals : [];
    all.push(...page);

    if (page.length < limit) break;
    offset += limit;
    if (offset > 50000) break;
  }

  return all;
}

function buildTradesFromDeals({ userId, accountLogin, deals }) {
  const byPosition = new Map();

  for (const deal of deals) {
    if (!deal) continue;
    const key = deal.positionId ?? deal.orderId;
    if (!key) continue;

    const symbol = normalizeSymbol(deal.symbol);
    const price = typeof deal.price === 'number' ? deal.price : null;
    const volume = typeof deal.volume === 'number' ? deal.volume : null;
    const profit = typeof deal.profit === 'number' ? deal.profit : null;
    if (!symbol || price === null || volume === null || profit === null) continue;

    if (!byPosition.has(key)) byPosition.set(key, []);
    byPosition.get(key).push({ ...deal, symbol, price, volume, profit });
  }

  const trades = [];
  for (const [key, group] of byPosition.entries()) {
    group.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    const entryDeals = group.filter((d) => isEntryDeal(d.entryType));
    const exitDeals = group.filter((d) => isExitDeal(d.entryType));
    if (entryDeals.length === 0 || exitDeals.length === 0) continue;

    const type = parseDealTypeToTradeType(entryDeals[0]?.type);
    if (!type) continue;

    const entry = weightedAverage(entryDeals.map((d) => ({ price: d.price, volume: d.volume })));
    const exit = weightedAverage(exitDeals.map((d) => ({ price: d.price, volume: d.volume })));
    if (entry === null || exit === null) continue;

    const quantity = entryDeals.reduce((sum, d) => sum + d.volume, 0);
    const pnl = group.reduce((sum, d) => sum + d.profit, 0);

    const lastExitTime = new Date(exitDeals[exitDeals.length - 1].time);
    const date = Number.isNaN(lastExitTime.getTime())
      ? new Date().toISOString().split('T')[0]
      : lastExitTime.toISOString().split('T')[0];

    const id = deterministicUuid(`${userId}:${accountLogin}:${key}`);

    trades.push({
      id,
      user_id: userId,
      date,
      symbol: entryDeals[0].symbol,
      type,
      entry,
      exit,
      quantity,
      outcome: outcomeFromPnL(pnl),
      pnl,
      pnl_percentage: pnlPercentage(entry, exit, type),
      notes: `Imported from MetaApi - Position: ${key}`,
    });
  }

  return trades;
}

async function syncUser(userId, record, { lookbackDays }) {
  const account = await metaapi.metatraderAccountApi.getAccount(record.metaapiAccountId);
  if (account.state !== 'DEPLOYED') {
    await account.deploy();
  }
  await account.waitConnected(120, 1000);

  const connection = account.getRPCConnection();
  await connection.connect();
  await connection.waitSynchronized(120);

  const end = new Date();
  const from = record.lastSyncAt
    ? new Date(record.lastSyncAt)
    : new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  // add overlap
  from.setDate(from.getDate() - 2);

  const deals = await fetchDeals(connection, from, end);
  const trades = buildTradesFromDeals({ userId, accountLogin: record.account, deals });

  await connection.close();

  const nowIso = new Date().toISOString();

  if (trades.length > 0) {
    await enforceFreePlanLimits(userId, trades.map((t) => t.id));

    const { error } = await supabase.from('trades').upsert(trades, { onConflict: 'id' });
    if (error) throw new Error(error.message);
  }

  await kvSet(`${CONNECTION_KEY_PREFIX}${userId}`, { ...record, lastSyncAt: nowIso });

  return { upserted: trades.length, lastSyncAt: nowIso };
}

app.get('/health', (_req, res) => ok(res, { status: 'ok' }));

app.get('/status', async (req, res) => {
  try {
    const userId = await requireUserId(req);
    const record = await kvGet(`${CONNECTION_KEY_PREFIX}${userId}`);
    ok(res, { connected: !!record, record: record ?? null });
  } catch (err) {
    const status = err?.status ?? 500;
    fail(res, status, err?.message ?? 'Server error');
  }
});

app.get('/metrics', async (req, res) => {
  try {
    const userId = await requireUserId(req);
    const record = await kvGet(`${CONNECTION_KEY_PREFIX}${userId}`);
    if (!record?.metaapiAccountId) throw new HttpError(404, 'No connected MT account');

    const includeOpen = String(req.query?.includeOpen ?? '').toLowerCase() === 'true';
    const metaStats = await getMetaStatsClient();
    const metrics = await metaStats.getMetrics(record.metaapiAccountId, includeOpen);
    ok(res, { metrics });
  } catch (err) {
    const status = err?.status ?? 500;
    fail(res, status, err?.message ?? 'Server error');
  }
});

app.post('/connect', async (req, res) => {
  try {
    const userId = await requireUserId(req);
    const { platform, server, account, investorPassword, autoSync, accountType } = req.body ?? {};

    if (platform !== 'MT4' && platform !== 'MT5') throw new HttpError(400, 'Invalid platform');
    if (!server || !account || !investorPassword) throw new HttpError(400, 'Missing server, account, or password');

    const existing = (await kvGet(`${CONNECTION_KEY_PREFIX}${userId}`)) ?? null;
    const existingAccountId = existing?.metaapiAccountId && existing?.account === account ? existing.metaapiAccountId : null;

    const metaapiAccount = await ensureAccount({
      existingAccountId,
      platform,
      server: String(server),
      login: String(account),
      password: String(investorPassword),
    });

    await metaapiAccount.waitDeployed(120, 1000);
    await metaapiAccount.waitConnected(120, 1000);

    const connectedAt = new Date().toISOString();
    const record = {
      metaapiAccountId: metaapiAccount.id,
      platform,
      server: String(server),
      account: String(account),
      accountType: accountType === 'live' || accountType === 'demo' ? accountType : 'live',
      autoSync: Boolean(autoSync),
      connectedAt,
      lastSyncAt: existing?.lastSyncAt,
    };

    await kvSet(`${CONNECTION_KEY_PREFIX}${userId}`, record);

    // Initial sync
    const syncResult = await syncUser(userId, record, { lookbackDays: LOOKBACK_DAYS });

    ok(res, { connectedAt, ...syncResult });
  } catch (err) {
    const status = err?.status ?? 500;
    fail(res, status, err?.message ?? 'Server error');
  }
});

app.post('/sync', async (req, res) => {
  try {
    const userId = await requireUserId(req);
    const record = await kvGet(`${CONNECTION_KEY_PREFIX}${userId}`);
    if (!record?.metaapiAccountId) throw new HttpError(404, 'No connected MT account');

    const syncResult = await syncUser(userId, record, { lookbackDays: LOOKBACK_DAYS });
    ok(res, syncResult);
  } catch (err) {
    const status = err?.status ?? 500;
    fail(res, status, err?.message ?? 'Server error');
  }
});

app.post('/disconnect', async (req, res) => {
  try {
    const userId = await requireUserId(req);
    const record = await kvGet(`${CONNECTION_KEY_PREFIX}${userId}`);
    if (record?.metaapiAccountId) {
      try {
        const account = await metaapi.metatraderAccountApi.getAccount(record.metaapiAccountId);
        await account.undeploy().catch(() => null);
        await account.remove().catch(() => null);
      } catch {
        // ignore
      }
    }

    await kvDel(`${CONNECTION_KEY_PREFIX}${userId}`);
    ok(res, { disconnected: true });
  } catch (err) {
    const status = err?.status ?? 500;
    fail(res, status, err?.message ?? 'Server error');
  }
});

app.listen(PORT, () => {
  console.log(`TJ MT bridge listening on :${PORT}`);
});
