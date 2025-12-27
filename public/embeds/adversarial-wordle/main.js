const GameState = {
  IN_PROGRESS: "in_progress",
  WON: "won",
  LOST: "lost",
};

const LetterState = {
  CORRECT: "correct",
  PRESENT: "present",
  ABSENT: "absent",
};

const WORD_LENGTH = 5;
const MAX_GUESSES = 6;

const getLetters = (guesses, currentGuess) => {
  const words = [...guesses, currentGuess];
  const letters = Array(MAX_GUESSES);

  for (let i = 0; i < MAX_GUESSES; i++) {
    const wordLetters = Array(WORD_LENGTH).fill(null);

    if (i < words.length) {
      for (let j = 0; j < words[i].length; j++) {
        wordLetters[j] = words[i][j];
      }
    }

    letters[i] = wordLetters;
  }

  return letters;
};

const getLetterStates = (answer, guesses, currentGuess) => {
  const letters = getLetters(guesses, currentGuess);

  const answerFreqs = {};
  for (const letter of answer) {
    answerFreqs[letter] = (answerFreqs[letter] || 0) + 1;
  }

  return letters.map((wordLetters, i) => {
    const usedFreqs = {};

    const firstPass = wordLetters.map((letter, j) => {
      if (letter === null) {
        return null;
      }

      if (i >= guesses.length) {
        return { letter, state: LetterState.ABSENT };
      }

      if (letter === answer[j]) {
        usedFreqs[letter] = (usedFreqs[letter] || 0) + 1;
        return { letter, state: LetterState.CORRECT };
      }

      return { letter, state: null };
    });

    return firstPass.map((letterState, j) => {
      if (letterState === null || letterState.state !== null) {
        return letterState;
      }

      const letter = letterState.letter;
      const usedCount = usedFreqs[letter] || 0;
      const answerCount = answerFreqs[letter] || 0;

      if (usedCount < answerCount) {
        usedFreqs[letter] = usedCount + 1;
        return { letter, state: LetterState.PRESENT };
      }

      return { letter, state: LetterState.ABSENT };
    });
  });
};

const wordSatisfiesLetterStates = (word, letterStates) => {
  const wordFreqs = {};
  for (const letter of word) {
    wordFreqs[letter] = (wordFreqs[letter] || 0) + 1;
  }

  const requiredFreqs = {};

  for (const wordLetterStates of letterStates) {
    for (let j = 0; j < WORD_LENGTH; j++) {
      const letterState = wordLetterStates[j];
      if (letterState === null) {
        continue;
      }

      const letter = letterState.letter;
      const state = letterState.state;

      if (state === LetterState.CORRECT) {
        if (word[j] !== letter) {
          return false;
        }
        requiredFreqs[letter] = (requiredFreqs[letter] || 0) + 1;
      } else if (state === LetterState.PRESENT) {
        if (word[j] === letter) {
          return false;
        }
        requiredFreqs[letter] = (requiredFreqs[letter] || 0) + 1;
      } else if (state === LetterState.ABSENT) {
        const requiredCount = requiredFreqs[letter] || 0;
        if (wordFreqs[letter] > requiredCount) {
          return false;
        }
      }
    }
  }

  return true;
};

class Game {
  answer = "";
  guesses = [];
  currentGuess = "";
  state = GameState.IN_PROGRESS;

  constructor(validAnswers, validGuesses) {
    this.validAnswers = validAnswers;
    this.validGuesses = validGuesses;
    this.answer = this._getAdversarialAnswer();
  }

  _getValidNextAnswers() {
    const letterStates = this.getLetterStates();
    return this.validAnswers.filter((word) => wordSatisfiesLetterStates(word, letterStates));
  }

  _getValidNextGuesses() {
    const letterStates = this.getLetterStates();
    return this.validGuesses.filter((word) => wordSatisfiesLetterStates(word, letterStates));
  }

  _getValidRemainingAnswers(answer, guess) {
    const letterStates = getLetterStates(answer, this.guesses.concat([guess]), "");
    return this.validAnswers.filter((word) => wordSatisfiesLetterStates(word, letterStates));
  }

  _getExpectedAnswerScore(answer, validNextGuesses) {
    let expectedScore = 0;
    let totalWeight = 0;

    for (const guess of validNextGuesses) {
      const S = this._getValidRemainingAnswers(answer, guess);
      // console.log("Answer:", answer, "Guess:", guess, "Remaining:", S.length);
      const score = 1 / (1 + Math.log2(1 + S.length));
      const weight = score ** 2;

      expectedScore += score * weight;
      totalWeight += weight;
    }

    return expectedScore / totalWeight;
  }

  /*
   * We use a heuristic approach to select the adversarial answer.
   *
   * The score of a guess G is `f(G) = 1 / log2(1 + |S|))` where S is the set of possible
   * answers remaining after the guess.
   *
   * Assume the player is more likely to guess words with a higher score, in proportion
   * to `f(G) ** 2`.
   *
   * The adversarial answer is the one that minimizes the expected score of the player's
   * next guess.
   */
  _getAdversarialAnswer() {
    const validNextAnswers = this._getValidNextAnswers();
    const validNextGuesses = this._getValidNextGuesses();

    let minAnswer = null;
    let minScore = Infinity;

    for (const answer of validNextAnswers) {
      const score = this._getExpectedAnswerScore(answer, validNextGuesses);
      console.log("Answer:", answer, "Score:", score.toFixed(4));
      if (score < minScore) {
        minAnswer = answer;
        minScore = score;
      }
    }

    return minAnswer;
  }

  isFinished() {
    return this.state !== GameState.IN_PROGRESS;
  }

  enterLetter(letter) {
    if (this.isFinished()) {
      return;
    }

    if (!/^[a-zA-Z]$/.test(letter)) {
      return;
    }

    if (this.currentGuess.length < WORD_LENGTH) {
      this.currentGuess += letter.toUpperCase();
    }
  }

  deleteLetter() {
    this.currentGuess = this.currentGuess.slice(0, -1);
  }

  submitCurrentGuess() {
    if (this.isFinished()) {
      return;
    }

    const guess = this.currentGuess;

    if (guess.length !== WORD_LENGTH) {
      return;
    }

    if (!this.validGuesses.includes(guess)) {
      // TODO: better error handling
      alert("Not a valid guess: " + guess);
      return;
    }

    this.currentGuess = "";

    this.guesses.push(guess);

    if (guess === this.answer) {
      this.state = GameState.WON;
    } else if (this.guesses.length >= MAX_GUESSES) {
      this.state = GameState.LOST;
    } else {
      this.answer = this._getAdversarialAnswer();
    }
  }

  getLetterStates() {
    return getLetterStates(this.answer, this.guesses, this.currentGuess);
  }

  absentLetters() {
    const absent = new Set();

    const letterStates = this.getLetterStates();
    letterStates.forEach((wordLetterStates, i) => {
      if (i >= this.guesses.length) {
        return;
      }

      for (const letterState of wordLetterStates) {
        if (letterState !== null && letterState.state === LetterState.ABSENT) {
          absent.add(letterState.letter);
        }
      }
    });

    return absent;
  }
}

class GameView {
  constructor(game, $container) {
    this.game = game;
    this.$container = $container;
  }

  _renderFinalScreen() {
    // TODO: actually implement this
    alert("Game Over! The answer was: " + this.game.answer.toUpperCase());
  }

  _renderBoard() {
    const letterStates = this.game.getLetterStates();
    const $board = this.$container.querySelector(".board");

    const $rows = $board.querySelectorAll(".row");
    for (let i = 0; i < MAX_GUESSES; i++) {
      const $row = $rows[i];
      const wordLetterStates = letterStates[i];

      const $tiles = $row.querySelectorAll(".tile");
      for (let j = 0; j < WORD_LENGTH; j++) {
        const $tile = $tiles[j];
        const letterState = wordLetterStates[j];
        if (letterState === null) {
          $tile.innerText = "";
          $tile.className = "tile";
        } else {
          $tile.innerText = letterState.letter.toUpperCase();
          $tile.className = `tile ${letterState.state}`;
        }
      }
    }
  }

  _renderKeyboard() {
    const absentLetters = this.game.absentLetters();

    const $keys = this.$container.querySelectorAll(".key");
    for (const $key of $keys) {
      const keyCode = $key.dataset.key;
      if (absentLetters.has(keyCode)) {
        $key.classList.add("absent");
      } else {
        $key.classList.remove("absent");
      }
    }
  }

  render() {
    this._renderBoard();
    this._renderKeyboard();

    if (this.game.isFinished()) {
      this._renderFinalScreen();
    }
  }
}

class GameController {
  gameView = null;

  constructor(validAnswers, validGuesses, $container) {
    this.validAnswers = validAnswers;
    this.validGuesses = validGuesses;
    this.$container = $container;

    this.onKeyClick = this._handleKeyClick.bind(this);
    this.onKeyDown = this._handleKeyDown.bind(this);

    this.newGame();
  }

  _handleKeyClick(evt) {
    const keyCode = evt.target.dataset.key;
    console.log("Key clicked:", keyCode);

    if (keyCode === "Enter") {
      this.submitCurrentGuess();
    } else if (keyCode === "Backspace") {
      this.deleteLetter();
    } else {
      this.enterLetter(keyCode);
    }
  }

  _handleKeyDown(evt) {
    const key = evt.key;
    console.log("Key pressed:", key);

    if (key === "Enter") {
      this.submitCurrentGuess();
    } else if (key === "Backspace") {
      this.deleteLetter();
    } else if (/^[a-zA-Z]$/.test(key)) {
      this.enterLetter(key);
    }
  }

  init() {
    document.addEventListener("keydown", this.onKeyDown);

    const $keys = this.$container.querySelectorAll(".key");
    for (const $key of $keys) {
      $key.addEventListener("click", this.onKeyClick);
    }
  }

  newGame() {
    this.game = new Game(this.validAnswers, this.validGuesses);
    this.gameView = new GameView(this.game, this.$container);
    this.gameView.render();
  }

  enterLetter(letter) {
    this.game.enterLetter(letter);
    this.gameView.render();
  }

  deleteLetter() {
    this.game.deleteLetter();
    this.gameView.render();
  }

  submitCurrentGuess() {
    this.game.submitCurrentGuess();
    this.gameView.render();
  }

  destroy() {
    const $keys = this.$container.querySelectorAll(".key");
    for (const $key of $keys) {
      $key.removeEventListener("click", this.onKeyClick);
    }

    document.removeEventListener("keydown", this.onKeyDown);
  }
}

async function getWordList(url) {
  const response = await fetch(url);
  const text = await response.text();
  return text
    .split("\n")
    .map((word) => word.trim().toUpperCase())
    .filter((word) => word.length > 0);
}

async function main() {
  const [validAnswers, validGuesses] = await Promise.all([
    getWordList("../../data/wordle-answers.csv"),
    getWordList("../../data/wordle-guesses.csv"),
  ]);

  console.log("Answers:", validAnswers);
  console.log("Guesses:", validGuesses);

  const $container = document.querySelector(".game");
  const gameController = new GameController(validAnswers, validGuesses, $container);
  gameController.init();
}

main();
