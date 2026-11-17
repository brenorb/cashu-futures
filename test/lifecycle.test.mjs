import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from '../server.mjs';

// Replays of the Lifecycle.tla rules on the real demo mint. Each test file
// runs in its own process, so this file starts from a fresh demo state.
let server;
let base;

before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}`;
});

after(() => server.close());

async function post(path, body = {}) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

const total = (state) => state.wallet.tokens
  .filter((token) => token.unit === 'sat')
  .reduce((sum, token) => sum + token.amount, 0) + state.wallet.lockedMarginSat;

test('the reserve token keeps showing the balance after it is swapped', async () => {
  const state = (await (await fetch(`${base}/api/state`)).json());
  const reserve = state.wallet.tokens.find((token) => token.kind === 'btc');
  assert.equal((await post('/api/swap', { tokenId: reserve.id })).status, 200);
  const minted = await post('/api/future/mint', { amount: 1 });
  const shown = minted.body.state.wallet.tokens.find((token) => token.kind === 'btc' && !token.settledFrom);
  assert.equal(shown.amount, minted.body.state.wallet.satBalance);
});

test('settling at the strike delivers the contract once and every series can mature', async () => {
  let state = (await post('/api/future/mint', { amount: 1, series: 'oct-2026' })).body.state;
  const before = total(state);
  for (const token of state.wallet.tokens.filter((item) => item.kind === 'future')) {
    state = (await post('/api/future/leverage', { tokenId: token.id })).body.state;
  }
  assert.equal(total(state), before);

  state = (await post('/api/time/advance')).body.state;
  state = (await post('/api/time/advance')).body.state;
  assert.ok(state.series.every((series) => series.matured), 'the clock reaches every maturity');

  for (const token of state.wallet.tokens.filter((item) => item.kind === 'future')) {
    const settled = await post('/api/future/settle', { tokenId: token.id });
    assert.equal(settled.status, 200, settled.body.error);
    state = settled.body.state;
  }
  assert.equal(total(state), before, 'settlement neither creates nor destroys sat');
});
