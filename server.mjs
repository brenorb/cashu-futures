import { createServer as createHttpServer } from 'node:http';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const MINT_URL = `http://localhost:${PORT}`;
const BLOSSOM_SERVER_URL = process.env.BLOSSOM_SERVER_URL || 'http://localhost:3000';
const MINT_SECRET = 'testnut-only-secret-do-not-use-for-real-cashu';
const WALLET_ID = 'demo-wallet';
const UNIT = 'future:btc-usd:20260901T000000Z';
const MATURITY = new Date('2026-09-01T00:00:00Z');

const TERMS = {
  unit: UNIT,
  strike_usd: '100000',
  contract_size_btc: '0.001',
  contract_size_sat: 100000,
  leverage: 5,
  initial_margin_sat: 20000,
  remaining_margin_sat: 80000,
  settlement_unit: 'sat',
  settlement_method: 'physical',
  price_source: 'testnut-fixed-btc-usd',
  maturity: '2026-09-01T00:00:00Z',
};

const state = {
  now: new Date('2026-08-27T12:00:00Z'),
  wallets: new Map(),
  tokens: new Map(),
  termsBlob: null,
  termsUri: null,
  reserveTokenId: null,
  activity: [],
  lifecycle: { minted: false, swapped: false, funded: false, matured: false, settled: false },
};

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sign(value) {
  return createHmac('sha256', MINT_SECRET).update(value).digest('hex');
}

function futureTermsBlob() {
  const signed = { mint: MINT_URL, terms: TERMS };
  return { ...signed, signature: sign(canonical(signed)) };
}

function futureTerms() {
  if (!state.termsBlob) {
    state.termsBlob = `${canonical(futureTermsBlob())}\n`;
    state.termsUri = `${BLOSSOM_SERVER_URL}/${sha256(state.termsBlob)}`;
  }
  return { blob: state.termsBlob, uri: state.termsUri };
}

function futureSecret(termsUri) {
  return JSON.stringify([
    'P2PK',
    {
      nonce: randomUUID().replaceAll('-', ''),
      data: 'testnut-demo-wallet',
      tags: [['future', '1', termsUri]],
    },
  ]);
}

function proofSignature(unit, amount, secret) {
  return sign(`${unit}|${amount}|${secret}`);
}

function makeToken(unit, amount, options = {}) {
  const termsUri = options.termsUri;
  const secret = termsUri ? futureSecret(termsUri) : randomUUID();
  const proof = {
    amount,
    secret,
    C: proofSignature(unit, amount, secret),
  };
  return {
    mint: MINT_URL,
    unit,
    amount,
    proofs: [proof],
    memo: options.memo || undefined,
  };
}

function addToken(owner, token, extra = {}) {
  const id = randomUUID();
  const record = { id, owner, token, ...extra };
  state.tokens.set(id, record);
  state.wallets.get(owner).tokenIds.push(id);
  return record;
}

function wallet() {
  return state.wallets.get(WALLET_ID);
}

function addActivity(message, tone = 'neutral') {
  state.activity.unshift({ at: state.now.toISOString(), message, tone });
  state.activity = state.activity.slice(0, 8);
}

function resetDemo() {
  state.now = new Date('2026-08-27T12:00:00Z');
  state.wallets = new Map([[WALLET_ID, { id: WALLET_ID, satBalance: 250000, tokenIds: [] }]]);
  state.tokens = new Map();
  state.termsBlob = null;
  state.termsUri = null;
  state.reserveTokenId = null;
  state.activity = [];
  state.lifecycle = { minted: false, swapped: false, funded: false, matured: false, settled: false };
  const ordinary = makeToken('sat', 250000, { memo: 'testnut BTC reserve' });
  state.reserveTokenId = addToken(WALLET_ID, ordinary, { kind: 'btc' }).id;
  addActivity('Wallet loaded with 250,000 sat testnut reserve', 'positive');
  futureTerms();
}

function syncReserveToken() {
  const reserve = state.tokens.get(state.reserveTokenId);
  if (reserve) {
    reserve.token.amount = wallet().satBalance;
    reserve.token.proofs[0].amount = wallet().satBalance;
    reserve.token.proofs[0].C = proofSignature('sat', wallet().satBalance, reserve.token.proofs[0].secret);
  }
}

function findToken(id) {
  const record = state.tokens.get(id);
  if (!record || record.owner !== WALLET_ID) throw new Error('Token is not owned by this wallet');
  return record;
}

function tokenSummary(record) {
  const future = record.token.unit.startsWith('future:');
  const termsUri = future ? record.token.proofs[0].secret.match(/https?:[^"\\]+/)?.[0] : null;
  return {
    id: record.id,
    kind: record.kind || (future ? 'future' : 'btc'),
    unit: record.token.unit,
    amount: record.token.amount,
    termsUri,
    leveragePaid: Boolean(record.leveragePaid),
    settledFrom: record.settledFrom || null,
  };
}

function publicState() {
  const records = wallet().tokenIds.map((id) => state.tokens.get(id)).filter(Boolean);
  const futureRecords = records.filter((record) => record.token.unit.startsWith('future:'));
  const locked = futureRecords.reduce(
    (sum, record) => sum + (record.leveragePaid ? 100000 : 20000) * record.token.amount,
    0,
  );
  return {
    mint: { name: 'testnut / cashu-futures', url: MINT_URL, network: 'testnet simulation' },
    wallet: {
      id: WALLET_ID,
      satBalance: wallet().satBalance,
      lockedMarginSat: locked,
      tokens: records.map(tokenSummary),
    },
    future: {
      unit: UNIT,
      termsUri: futureTerms().uri,
      terms: TERMS,
      maturity: TERMS.maturity,
      matured: state.now >= MATURITY,
      now: state.now.toISOString(),
    },
    lifecycle: state.lifecycle,
    activity: state.activity,
  };
}

function jsonResponse(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(data);
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  if (body.length > 100_000) throw new Error('Request body too large');
  return body ? JSON.parse(body) : {};
}

function errorResponse(res, error) {
  const message = error instanceof Error ? error.message : String(error);
  const status = /matur|margin|owned|unknown|not found|already/i.test(message) ? 409 : 400;
  jsonResponse(res, status, { error: message });
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/state') {
    return jsonResponse(res, 200, publicState());
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/terms/')) {
    const hash = url.pathname.split('/').pop();
    const terms = futureTerms();
    if (hash !== terms.uri.split('/').pop()) return jsonResponse(res, 404, { error: 'Terms not found' });
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'public, max-age=31536000, immutable' });
    return res.end(terms.blob);
  }
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });

  const body = await readJson(req);
  if (url.pathname === '/api/future/mint') {
    const amount = Number(body.amount || 1);
    if (!Number.isSafeInteger(amount) || amount < 1) throw new Error('Amount must be a positive integer');
    const required = TERMS.initial_margin_sat * amount;
    if (wallet().satBalance < required) throw new Error(`Insufficient sat balance for ${required} sat initial margin`);
    wallet().satBalance -= required;
    syncReserveToken();
    const record = addToken(WALLET_ID, makeToken(UNIT, amount, { termsUri: futureTerms().uri, memo: 'testnut BTC/USD future' }), {
      kind: 'future',
      leveragePaid: false,
    });
    state.lifecycle.minted = true;
    addActivity(`Minted ${amount} future unit${amount === 1 ? '' : 's'}; locked ${required.toLocaleString()} sat initial margin`, 'positive');
    return jsonResponse(res, 201, { token: tokenSummary(record), state: publicState() });
  }
  if (url.pathname === '/api/swap') {
    const old = findToken(body.tokenId);
    const isFuture = old.token.unit.startsWith('future:');
    if (isFuture) {
      const tag = old.token.proofs[0].secret.match(/\[\["future","1","([^"]+)"\]\]/);
      if (!tag || tag[1] !== futureTerms().uri) throw new Error('Future metadata is missing or has changed');
    }
    state.tokens.delete(old.id);
    wallet().tokenIds = wallet().tokenIds.filter((id) => id !== old.id);
    const replacement = addToken(WALLET_ID, makeToken(old.token.unit, old.token.amount, {
      termsUri: isFuture ? futureTerms().uri : undefined,
      memo: old.token.memo,
    }), { kind: old.kind, leveragePaid: old.leveragePaid });
    state.lifecycle.swapped = isFuture;
    addActivity(`Swapped ${old.token.unit}; future terms URI preserved`, 'positive');
    return jsonResponse(res, 200, {
      metadataPreserved: isFuture,
      before: tokenSummary(old),
      after: tokenSummary(replacement),
      state: publicState(),
    });
  }
  if (url.pathname === '/api/future/leverage') {
    const record = findToken(body.tokenId);
    if (!record.token.unit.startsWith('future:')) throw new Error('Token is not a future');
    if (record.leveragePaid) throw new Error('Remaining leverage is already paid');
    const required = TERMS.remaining_margin_sat * record.token.amount;
    if (wallet().satBalance < required) throw new Error(`Insufficient sat balance for ${required} sat remaining margin`);
    wallet().satBalance -= required;
    syncReserveToken();
    record.leveragePaid = true;
    state.lifecycle.funded = true;
    addActivity(`Paid ${required.toLocaleString()} sat remaining margin`, 'positive');
    return jsonResponse(res, 200, { token: tokenSummary(record), state: publicState() });
  }
  if (url.pathname === '/api/time/advance') {
    state.now = new Date(MATURITY);
    state.lifecycle.matured = true;
    addActivity('Testnut clock advanced to maturity', 'warning');
    return jsonResponse(res, 200, { state: publicState() });
  }
  if (url.pathname === '/api/future/settle') {
    const old = findToken(body.tokenId);
    if (!old.token.unit.startsWith('future:')) throw new Error('Token is not a future');
    if (state.now < MATURITY) throw new Error('Future has not reached maturity');
    if (!old.leveragePaid) throw new Error('Pay the remaining leverage before settlement');
    state.tokens.delete(old.id);
    wallet().tokenIds = wallet().tokenIds.filter((id) => id !== old.id);
    const amount = TERMS.contract_size_sat * old.token.amount;
    wallet().satBalance += amount;
    syncReserveToken();
    const settled = addToken(WALLET_ID, makeToken('sat', amount, { memo: 'physical BTC delivery from future' }), {
      kind: 'btc',
      settledFrom: old.token.unit,
    });
    state.lifecycle.settled = true;
    addActivity(`Settled ${old.token.amount} future unit into ${amount.toLocaleString()} sat BTC token`, 'positive');
    return jsonResponse(res, 200, { token: tokenSummary(settled), state: publicState() });
  }
  return jsonResponse(res, 404, { error: 'Endpoint not found' });
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

async function handleStatic(req, res, url) {
  const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (file.includes('..') || file.includes('/') && file.split('/').some((part) => part === '..')) {
    return jsonResponse(res, 400, { error: 'Invalid path' });
  }
  try {
    const data = await readFile(join(ROOT, 'public', file));
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  }
}

export function createServer() {
  return createHttpServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
      else await handleStatic(req, res, url);
    } catch (error) {
      errorResponse(res, error);
    }
  });
}

resetDemo();

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer().listen(PORT, () => {
    console.log(`cashu-futures testnut listening at http://localhost:${PORT}`);
  });
}
