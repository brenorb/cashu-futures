------------------------------ MODULE Lifecycle ------------------------------
\* The testnut futures demo (server.mjs handleApi) with both series and one
\* future unit of each. Steps map to the endpoints:
\*   Mint(s)      -> /api/future/mint: satBalance -= initial margin
\*   Leverage(s)  -> /api/future/leverage: satBalance -= remaining margin
\*   Advance      -> /api/time/advance
\*   Settle(s)    -> /api/future/settle: delete the future, deliver sat
\*   SwapReserve  -> /api/swap on the reserve token
\* Margins equal the contract size at the fixed demo price, so settling at
\* the strike neither creates nor destroys value.
\* Broken = TRUE is the code before the fix.
EXTENDS Naturals

CONSTANT Broken

Series == {"sep", "oct"}
Maturity == [s \in Series |-> IF s = "sep" THEN 1 ELSE 2]
Initial == [s \in Series |-> IF s = "sep" THEN 2 ELSE 2]   \* in 1,000 sat
Remaining == [s \in Series |-> IF s = "sep" THEN 8 ELSE 9]
Size == [s \in Series |-> Initial[s] + Remaining[s]]
Start == 30

VARIABLES now, balance, future, delivered, reserveSynced

vars == <<now, balance, future, delivered, reserveSynced>>

Init ==
  /\ now = 0
  /\ balance = Start
  /\ future = [s \in Series |-> "none"]     \* none, open, funded, settled
  /\ delivered = 0                          \* sat delivered as separate tokens
  /\ reserveSynced = TRUE                   \* the reserve token shows balance

Mint(s) ==
  /\ future[s] = "none" /\ balance >= Initial[s]
  /\ balance' = balance - Initial[s] /\ future' = [future EXCEPT ![s] = "open"]
  /\ UNCHANGED <<now, delivered, reserveSynced>>

Leverage(s) ==
  /\ future[s] = "open" /\ balance >= Remaining[s]
  /\ balance' = balance - Remaining[s] /\ future' = [future EXCEPT ![s] = "funded"]
  /\ UNCHANGED <<now, delivered, reserveSynced>>

\* The old clock always jumped to the September maturity.
Advance ==
  /\ now < 2
  /\ now' = IF Broken THEN Maturity["sep"] ELSE now + 1
  /\ now' # now
  /\ UNCHANGED <<balance, future, delivered, reserveSynced>>

Settle(s) ==
  /\ future[s] = "funded" /\ now >= Maturity[s]
  /\ future' = [future EXCEPT ![s] = "settled"]
  /\ delivered' = delivered + Size[s]
  /\ balance' = IF Broken THEN balance + Size[s] ELSE balance
  /\ UNCHANGED <<now, reserveSynced>>

\* The old swap gave the reserve a new id without updating reserveTokenId.
SwapReserve ==
  /\ reserveSynced' = ~Broken /\ reserveSynced
  /\ UNCHANGED <<now, balance, future, delivered>>

Next == Advance \/ SwapReserve \/ \E s \in Series : Mint(s) \/ Leverage(s) \/ Settle(s)

Spec == Init /\ [][Next]_vars

Locked == (IF future["sep"] = "open" THEN Initial["sep"] ELSE 0)
        + (IF future["sep"] = "funded" THEN Size["sep"] ELSE 0)
        + (IF future["oct"] = "open" THEN Initial["oct"] ELSE 0)
        + (IF future["oct"] = "funded" THEN Size["oct"] ELSE 0)

\* The wallet's tokens add up to what it started with: reserve, delivered
\* sat, and margin locked in open futures.
ValueConserved == balance + delivered + Locked = Start

\* Once the clock is past every maturity, no funded future is stuck.
ClockReachesEveryMaturity == \A s \in Series : future[s] = "funded" => ENABLED Advance \/ now >= Maturity[s]

\* The reserve token always shows the wallet's sat balance.
ReserveShowsBalance == reserveSynced
=============================================================================
