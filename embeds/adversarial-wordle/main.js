async function getWordList(url) {
  const response = await fetch(url);
  const text = await response.text();
  return text
    .split("\n")
    .map((word) => word.trim())
    .filter((word) => word.length > 0);
}

async function main() {
  const [answers, guesses] = await Promise.all([
    getWordList("../../data/wordle-answers.csv"),
    getWordList("../../data/wordle-guesses.csv"),
  ]);

  console.log("Answers:", answers);
  console.log("Guesses:", guesses);
}

main();
