import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from '../server.mjs';

let server;
let base;

before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}`;
});

after(() => server.close());

async function api(path, options) {
  const response = await fetch(`${base}${path}`, {
    headers: { 'content-type': 'application/json' },
    ...options,
  });
  const body = await response.json();
  return { response, body };
}

test('mints, swaps without losing metadata, then physically settles at maturity', async () => {
  let result = await api('/api/state');
  assert.equal(result.body.wallet.satBalance, 250000);
  assert.equal(result.body.future.matured, false);
  assert.equal(result.body.lifecycle.minted, false);

  result = await api('/api/future/mint', { method: 'POST', body: JSON.stringify({ amount: 1 }) });
  assert.equal(result.response.status, 201);
  const minted = result.body.token;
  assert.equal(minted.unit, 'future:btc-usd:20260901T000000Z');
  assert.match(minted.termsUri, /\/api\/terms\/[0-9a-f]{64}$/);
  assert.equal(result.body.state.lifecycle.minted, true);

  result = await api('/api/swap', { method: 'POST', body: JSON.stringify({ tokenId: minted.id }) });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.metadataPreserved, true);
  assert.equal(result.body.before.termsUri, result.body.after.termsUri);
  assert.equal(result.body.before.unit, result.body.after.unit);
  assert.equal(result.body.state.lifecycle.swapped, true);
  const swapped = result.body.after;

  result = await api('/api/future/settle', { method: 'POST', body: JSON.stringify({ tokenId: swapped.id }) });
  assert.equal(result.response.status, 409);
  assert.match(result.body.error, /maturity|leverage/i);

  result = await api('/api/future/leverage', { method: 'POST', body: JSON.stringify({ tokenId: swapped.id }) });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.token.leveragePaid, true);
  assert.equal(result.body.state.lifecycle.funded, true);

  result = await api('/api/time/advance', { method: 'POST' });
  assert.equal(result.body.state.future.matured, true);
  assert.equal(result.body.state.lifecycle.matured, true);

  result = await api('/api/future/settle', { method: 'POST', body: JSON.stringify({ tokenId: swapped.id }) });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.token.unit, 'sat');
  assert.equal(result.body.token.amount, 100000);
  assert.equal(result.body.token.settledFrom, 'future:btc-usd:20260901T000000Z');
  assert.equal(result.body.state.lifecycle.settled, true);
});
