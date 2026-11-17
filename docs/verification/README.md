# Cashu futures verification

| Skill | What it checks | Tool |
| --- | --- | --- |
| [verify-futures-lifecycle](../../.claude/skills/verify-futures-lifecycle/SKILL.md) | The demo conserves sat through settlement, every series can mature, and the reserve token matches the balance | TLA+ / TLC, 37 states, plus `test/lifecycle.test.mjs` |

The model found three bugs in the testnut demo, now fixed:

1. Settlement credited the payout to the balance and also delivered it as a token, so the wallet showed it twice (a31e2b6).
2. The clock only ever reached the September maturity, so October futures could not settle (0adb016).
3. Swapping the reserve token unlinked it from the balance (8990166).

## Hold a future to settlement

Generated with pstack `/statechart` from [TradeFuture.tla](flows/trade-a-future/TradeFuture.tla) ([TLC report](flows/trade-a-future/report.md)). The contract and the clock are parallel regions. The chart hides swaps and early settle attempts, which leave the state unchanged.

```mermaid
---
title: "Hold a future to settlement"
---
stateDiagram-v2
  direction LR
  state "At the same time" as all {
    state "Contract" as r0 {
      s0: Choose a series
      s1: Holding, initial margin locked
      s2: Not enough sat for margin
      s3: Holding, fully margined
      s4: BTC delivered as a sat token
      [*] --> s0
      s0 --> s1: you mint a future
      s0 --> s2: your balance is below the margin
      s1 --> s3: you pay the remaining margin
      s3 --> s4: you settle [when Matured]
    }
    --
    state "Clock" as r1 {
      s5: Before maturity
      s6: Matured
      [*] --> s5
      s5 --> s6: the testnut clock reaches maturity
    }
  }
```
