const $ = (id) => document.getElementById(id);
let snapshot;

function formatNumber(value) {
  return Number(value).toLocaleString('en-US');
}

function shortUri(uri) {
  if (!uri) return '—';
  return `${uri.slice(0, 30)}…${uri.slice(-12)}`;
}

function futureToken() {
  return snapshot.wallet.tokens.find((token) => token.kind === 'future');
}

function setFeedback(message, tone = 'neutral') {
  const el = $('feedback');
  el.textContent = message;
  el.dataset.tone = tone;
}

function render() {
  const { wallet, future, mint, lifecycle } = snapshot;
  const token = futureToken();
  $('mint-address').textContent = mint.url;
  $('future-unit').textContent = future.unit;
  $('terms-uri').textContent = shortUri(future.termsUri);
  $('strike').textContent = `${future.terms.strike_btc_per_mb} BTC`;
  $('contract-size').textContent = future.terms.contract_size_mb;
  $('leverage').textContent = `${future.terms.leverage}×`;
  $('maturity').textContent = new Date(future.maturity).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  $('clock').textContent = `clock ${new Date(future.now).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}`;
  $('maturity-chip').textContent = future.matured ? 'MATURED' : 'PRE-MATURITY';
  $('maturity-chip').classList.toggle('matured', future.matured);
  $('sat-balance').textContent = formatNumber(wallet.satBalance);
  $('locked-margin').textContent = formatNumber(wallet.lockedMarginSat);
  $('future-balance').textContent = formatNumber(token?.amount || 0);
  $('leverage-caption').textContent = token?.leveragePaid ? 'fully funded' : `${formatNumber(future.terms.remaining_margin_sat)} sat due at delivery`;

  $('mint-btn').disabled = Boolean(token);
  $('swap-btn').disabled = !token;
  $('leverage-btn').disabled = !token || token.leveragePaid;
  $('settle-btn').disabled = !token || !future.matured || !token.leveragePaid;
  $('advance-btn').disabled = future.matured;
  const steps = ['mint', 'swap', 'fund', 'mature', 'settle'];
  const keys = { mint: 'minted', swap: 'swapped', fund: 'funded', mature: 'matured', settle: 'settled' };
  const firstPending = steps.findIndex((step) => !lifecycle[keys[step]]);
  document.querySelectorAll('.lifecycle-step').forEach((step) => {
    const complete = lifecycle[keys[step.dataset.step]];
    step.classList.toggle('complete', complete);
    step.classList.toggle('current', steps.indexOf(step.dataset.step) === firstPending);
  });
  $('lifecycle-state').textContent = lifecycle.settled ? 'DELIVERED' : (steps[firstPending] || 'settled').toUpperCase();

  $('token-list').innerHTML = wallet.tokens.map((item) => {
    const isFuture = item.kind === 'future';
    const label = isFuture ? 'FUTURE PROOF' : 'BTC TOKEN';
    const badge = isFuture ? (item.leveragePaid ? 'FUNDED' : 'MARGIN LOCKED') : 'SPENDABLE';
    return `<div class="token-row ${isFuture ? 'future-row' : ''}">
      <div class="token-icon">${isFuture ? 'F' : '₿'}</div>
      <div class="token-main"><span>${label} <em>${badge}</em></span><strong>${formatNumber(item.amount)} <small>${isFuture ? 'units' : 'sat'}</small></strong><code>${isFuture ? shortUri(item.termsUri) : (item.settledFrom ? `delivered from ${item.settledFrom}` : 'testnut reserve')}</code></div>
      <div class="token-check">${isFuture ? 'TAG<br />OK' : 'UNIT<br />SAT'}</div>
    </div>`;
  }).join('');

  $('activity').innerHTML = snapshot.activity.map((event) => `<div class="activity-row"><span class="activity-dot ${event.tone}"></span><div><p>${event.message}</p><time>${new Date(event.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</time></div></div>`).join('');
}

async function request(path, options = {}) {
  const response = await fetch(path, { headers: { 'content-type': 'application/json' }, ...options });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Request failed');
  return body;
}

async function refresh() {
  snapshot = await request('/api/state');
  render();
}

async function runAction(path, message, body) {
  setFeedback(message);
  try {
    const result = await request(path, { method: 'POST', body: JSON.stringify(body || {}) });
    snapshot = result.state;
    render();
    setFeedback(snapshot.activity[0]?.message || 'Done.', 'positive');
  } catch (error) {
    setFeedback(error.message, 'error');
  }
}

$('mint-btn').addEventListener('click', () => runAction('/api/future/mint', 'Creating a signed future proof…', { amount: 1 }));
$('swap-btn').addEventListener('click', () => runAction('/api/swap', 'Swapping proof; checking metadata continuity…', { tokenId: futureToken()?.id }));
$('leverage-btn').addEventListener('click', () => runAction('/api/future/leverage', 'Paying the remaining delivery margin…', { tokenId: futureToken()?.id }));
$('advance-btn').addEventListener('click', () => runAction('/api/time/advance', 'Advancing the deterministic testnut clock…'));
$('settle-btn').addEventListener('click', () => runAction('/api/future/settle', 'Settling future into physical BTC token…', { tokenId: futureToken()?.id }));
$('copy-terms').addEventListener('click', async () => {
  await navigator.clipboard.writeText(snapshot.future.termsUri);
  setFeedback('Terms URI copied.', 'positive');
});

refresh().catch((error) => setFeedback(error.message, 'error'));
