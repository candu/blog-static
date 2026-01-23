import { GameController, getWordListFromURL } from "./lib.js";

async function main() {
  const [validAnswers, validGuesses] = await Promise.all([
    getWordListFromURL("../../data/wordle-answers.csv"),
    getWordListFromURL("../../data/wordle-guesses.csv"),
  ]);

  console.log("Answers:", validAnswers);
  console.log("Guesses:", validGuesses);

  const $container = document.querySelector(".game");
  const gameController = new GameController(validAnswers, validGuesses, $container);
  gameController.init();
}

main();
