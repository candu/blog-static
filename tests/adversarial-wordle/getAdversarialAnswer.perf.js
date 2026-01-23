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

  const gameState1 = GameState.simulate("HAUTE", ["THEWS"], validAnswers, validGuesses);
  const gameState2 = GameState.simulate("HEFTY", ["THEWS", "ETHIC"], validAnswers, validGuesses);
  const gameState3 = GameState.simulate("EXTRA", ["TAXES"], validAnswers, validGuesses);

  const bench = new Bench({ time: 100 });

  bench
    .add("getAdversarialAnswer - HAUTE / THEWS", () => {
      getAdversarialAnswer(gameState1);
    })
    .add("getAdversarialAnswer - HEFTY / THEWS, ETHIC", () => {
      getAdversarialAnswer(gameState2);
    })
    .add("getAdversarialAnswer - EXTRA / TAXES", () => {
      getAdversarialAnswer(gameState3);
    });

  await bench.run();

  console.table(bench.table());
};

await main();
