---
name: verify-futures-lifecycle
description: Check that the testnut Cashu futures demo conserves sat through mint, margin, maturity and physical settlement, lets every series mature, and keeps the reserve token in step with the balance. Use when changing handleApi in server.mjs (mint, swap, leverage, time/advance, settle), syncReserveToken, the SERIES terms, or the clock and settle buttons in public/app.js.
---

# Verify the futures demo lifecycle

**Properties.**

- `ValueConserved`: reserve balance, delivered sat tokens and margin locked in open futures always add up to the starting balance. Margins equal the contract size at the demo's fixed price, so settling at the strike creates no sat.
- `ClockReachesEveryMaturity`: a funded future of any series can always reach its maturity.
- `ReserveShowsBalance`: the reserve token always shows `satBalance`.

**Harm if broken.** The demo shows money appearing at settlement, a series whose margin can never be released, or a reserve token that no longer matches the wallet. Readers of the NUT-32 draft would take those as the protocol's behavior.

## Run

```sh
export TLA2TOOLS=/absolute/path/to/tla2tools.jar   # TLC 1.7.4 release
export JAVA=/path/to/java                          # Java 11 or later
bash scripts/verification/check-model.sh .claude/skills/verify-futures-lifecycle/model/Lifecycle.tla
bash scripts/verification/check-model.sh .claude/skills/verify-futures-lifecycle/model/Lifecycle.tla --mutant
npm test
```

The model must pass (37 distinct states). The `--mutant` run replays the code before commits a31e2b6, 0adb016 and 8990166 and must report a violation. With one rule per config it reports each rule: double settlement credit, the clock stuck at September, and the reserve swap. `test/lifecycle.test.mjs` replays those paths against `server.mjs`; adding back `wallet().satBalance += amount` in settle makes it fail. Read every TLC result with the pstack `/statechart` skill.

## Coverage

Synced with the code at commit `07b0748`. Move this forward only after you confirm that the model still describes the code at the new commit.

| Model step | Code (`server.mjs` `handleApi`) |
| --- | --- |
| `Mint` | `/api/future/mint` |
| `Leverage` | `/api/future/leverage` |
| `Advance` | `/api/time/advance` |
| `Settle` | `/api/future/settle` |
| `SwapReserve` | `/api/swap` on `state.reserveTokenId` |

## Not covered

More than one unit per series, swaps of future tokens (their terms URI check is tested in `test/demo.test.mjs`), prices other than the strike, `resetDemo`, and the NUT-32 terms signature, which the demo signs with an HMAC.
