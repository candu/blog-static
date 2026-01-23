import path from "node:path";
import { Bench } from "tinybench";
import { GameState } from "../../public/embeds/adversarial-wordle/lib.js";
import { getWordListFromFile } from "./helpers.js";

const __dirname = new URL(".", import.meta.url).pathname;

const main = async () => {
  const [validAnswers, validGuesses] = await Promise.all([
    getWordListFromFile(path.join(__dirname, "../../public/data/wordle-answers.csv")),
    getWordListFromFile(path.join(__dirname, "../../public/data/wordle-guesses.csv")),
  ]);

  const gameState = GameState.simulate(
    "CAIRN",
    ["ABASE", "CADDY", "CALIF", "CAPUT", "CANON"],
    validAnswers,
    validGuesses,
  );

  const bench = new Bench({ time: 100 });

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
};

await main();
