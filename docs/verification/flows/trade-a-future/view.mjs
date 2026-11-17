export const title = "Hold a future to settlement";
export const state = (v) => ({
  Contract: {
    browse: "Choose a series",
    refused: "Not enough sat for margin",
    holding: "Holding, initial margin locked",
    funded: "Holding, fully margined",
    delivered: "BTC delivered as a sat token",
  }[v.step],
  Clock: v.clock === "before" ? "Before maturity" : "Matured",
});
const steps = {
  YouMint: "you mint a future",
  NotEnough: "your balance is below the margin",
  YouPayMargin: "you pay the remaining margin",
  ClockMoves: "the testnut clock reaches maturity",
  YouSettle: "you settle",
};
export const step = (action) => steps[action] ?? null;
