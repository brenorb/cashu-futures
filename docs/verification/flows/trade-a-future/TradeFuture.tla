---------------------------- MODULE TradeFuture ----------------------------
\* Holding one MB/BTC future in the testnut demo page, as the user sees it.
VARIABLES step, clock

vars == <<step, clock>>

Init == step = "browse" /\ clock = "before"

YouMint == step = "browse" /\ step' = "holding" /\ UNCHANGED clock
NotEnough == step = "browse" /\ step' = "refused" /\ UNCHANGED clock
YouSwap == step \in {"holding", "funded"} /\ UNCHANGED vars
YouPayMargin == step = "holding" /\ step' = "funded" /\ UNCHANGED clock
ClockMoves == clock = "before" /\ clock' = "matured" /\ UNCHANGED step
SettleEarly == step \in {"holding", "funded"} /\ clock = "before" /\ UNCHANGED vars
YouSettle == step = "funded" /\ clock = "matured" /\ step' = "delivered" /\ UNCHANGED clock

Done == step \in {"delivered", "refused"} /\ UNCHANGED vars

Next == YouMint \/ NotEnough \/ YouSwap \/ YouPayMargin \/ ClockMoves
        \/ SettleEarly \/ YouSettle \/ Done

Spec == Init /\ [][Next]_vars

\* Settlement happens only at maturity and only once margin is fully paid.
SettledOnlyWhenDue == step = "delivered" => clock = "matured"
=============================================================================
