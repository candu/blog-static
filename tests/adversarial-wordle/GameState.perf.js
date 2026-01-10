import { Bench } from "tinybench";
import { GameState } from "../../public/embeds/adversarial-wordle/lib.js";

const bench = new Bench({ time: 100 });

// Create GameState with 5 guesses (from actual test case)
const gameState = new GameState("CAIRN", ["ABASE", "CADDY", "CALIF", "CAPUT", "CANON"]);

bench
  .add("satisfiesLetterStates - matching answer", () => {
    gameState.satisfiesLetterStates("CAIRN");
  })
  .add("satisfiesLetterStates - non-matching word", () => {
    gameState.satisfiesLetterStates("STARE");
  })
  .add("satisfiesLetterStates - partially matching word", () => {
    gameState.satisfiesLetterStates("CARRY");
  });

await bench.run();

console.table(bench.table());
