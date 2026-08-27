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
  assert.deepEqual(result.body.series.map((series) => series.unit), [
    'future:mb-btc:20260901T000000Z',
    'future:mb-btc:20261001T000000Z',
  ]);
  assert.match(result.body.series[0].termsUri, /^https:\/\/blossom\.primal\.net\/[0-9a-f]{64}\.json$/);
  assert.match(result.body.series[1].termsUri, /^https:\/\/blossom\.primal\.net\/[0-9a-f]{64}\.json$/);
  assert.notEqual(result.body.series[0].termsUri, result.body.series[1].termsUri);
  const localTerms = await fetch(`${base}/api/terms/${new URL(result.body.series[0].termsUri).pathname.split('/').pop()}`);
  assert.equal(localTerms.status, 200);
  assert.equal((await localTerms.json()).terms.unit, 'future:mb-btc:20260901T000000Z');

  result = await api('/api/future/mint', { method: 'POST', body: JSON.stringify({ amount: 1, series: 'oct-2026' }) });
  assert.equal(result.response.status, 201);
  assert.equal(result.body.token.unit, 'future:mb-btc:20261001T000000Z');

  result = await api('/api/future/mint', { method: 'POST', body: JSON.stringify({ amount: 1 }) });
  assert.equal(result.response.status, 201);
  const minted = result.body.token;
  assert.equal(minted.unit, 'future:mb-btc:20260901T000000Z');
  assert.match(minted.termsUri, /\/[0-9a-f]{64}\.json$/);
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
  assert.equal(result.body.token.amount, 10000);
  assert.equal(result.body.token.settledFrom, 'future:mb-btc:20260901T000000Z');
  assert.equal(result.body.state.lifecycle.settled, true);
});
