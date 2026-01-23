import path from "node:path";
import { Bench } from "tinybench";
import { GameState, getAdversarialAnswer } from "../../public/embeds/adversarial-wordle/lib.js";
import { getWordListFromFile } from "./helpers.js";

const __dirname = new URL(".", import.meta.url).pathname;

const main = async () => {
  const [validAnswers, validGuesses] = await Promise.all([
    getWordListFromFile(path.join(__dirname, "../../public/data/wordle-answers.csv")),
    getWordListFromFile(path.join(__dirname, "../../public/data/wordle-guesses.csv")),
  ]);

  const gameState = GameState.simulate(
    "HAUTE",
    ["THEWS"],
    validAnswers,
    validGuesses,
  );

  const bench = new Bench({ time: 100 });

  bench
    .add("getAdversarialAnswer - HAUTE after THEWS", () => {
      getAdversarialAnswer(gameState);
    });

  await bench.run();

  console.table(bench.table());
};

await main();
