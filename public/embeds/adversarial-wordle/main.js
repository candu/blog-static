const GameStatus = {
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

class LetterStateUtils {
  static getLetterStates(answer, word) {
    const letterStates = Array(WORD_LENGTH).fill(null);

    const answerFreqs = {};
    for (const letter of answer) {
      answerFreqs[letter] = (answerFreqs[letter] || 0) + 1;
    }

    const n = Math.min(WORD_LENGTH, word.length);
    const usedFreqs = {};

    // first pass: correct
    for (let j = 0; j < n; j++) {
      const letter = word[j];
      if (letter === answer[j]) {
        usedFreqs[letter] = (usedFreqs[letter] || 0) + 1;
        letterStates[j] = { letter, state: LetterState.CORRECT };
      } else {
        letterStates[j] = { letter, state: null };
      }
    }

    // second pass: present / absent
    for (let j = 0; j < n; j++) {
      const { letter, state } = letterStates[j];
      if (state !== null) {
        continue;
      }

      const usedCount = usedFreqs[letter] || 0;
      const answerCount = answerFreqs[letter] || 0;

      if (usedCount < answerCount) {
        usedFreqs[letter] = usedCount + 1;
        letterStates[j].state = LetterState.PRESENT;
      } else {
        letterStates[j].state = LetterState.ABSENT;
      }
    }

    return letterStates;
  }

  satisfiesLetterStates(letterStates, word) {
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
  }
}

// TODO: add valid answers / guesses in here
class GameState {
  constructor(answer, guesses) {
    this.answer = answer;
    this.guesses = guesses;
  }

  getStatus() {
    const n = this.guesses.length;

    if (this.guesses[n - 1] === this.answer) {
      return GameStatus.WON;
    }

    if (n >= MAX_GUESSES) {
      return GameStatus.LOST;
    }

    return GameStatus.IN_PROGRESS;
  }

  withAnswer(answer) {
    if (answer.length !== WORD_LENGTH) {
      throw new Error(`invalid answer ${answer}: wrong length`);
    }

    return new GameState(answer, [...this.guesses]);
  }

  withGuess(guess) {
    if (this.guesses.length >= MAX_GUESSES) {
      throw new Error("max guesses reached");
    }

    if (guess.length !== WORD_LENGTH) {
      throw new Error(`invalid guess ${guess}: wrong length`);
    }

    // TODO: validate against valid guesses

    return new GameState(this.answer, [...this.guesses, guess]);
  }
}

class AdversarialAnswer {
  static get() {}
}

class Game {
  constructor(validAnswers, validGuesses) {
    this.validAnswers = validAnswers;
    this.validGuesses = validGuesses;

    this.answer = this._getAdversarialAnswer();
    this.state = new GameState(this.answer, []);
    this.currentGuess = "";
  }

  _getAdversarialAnswer() {
    return "ABATE";
  }

  isFinished() {
    const status = this.state.getStatus();
    return status !== GameStatus.IN_PROGRESS;
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

    try {
      if (!this.validGuesses.includes(guess)) {
        throw new Error(`invalid guess ${guess}: not in word list`);
      }

      this.state = this.state.withGuess(guess);

      if (!this.isFinished()) {
        const newAnswer = this._getAdversarialAnswer();
        this.state = this.state.withAnswer(newAnswer);
      }
    } catch (err) {
      alert(err.message);
    }

    this.currentGuess = "";
  }

  getLetterStates() {
    const letterStates = this.state.guesses.map((word) =>
      LetterStateUtils.getLetterStates(this.state.answer, word),
    );

    letterStates.push(LetterStateUtils.getLetterStates("", this.currentGuess));

    while (letterStates.length < MAX_GUESSES) {
      letterStates.push(Array(WORD_LENGTH).fill(null));
    }

    return letterStates;
  }

  absentLetters() {
    const absent = new Set();

    const letterStates = this.getLetterStates();
    letterStates.forEach((wordLetterStates, i) => {
      if (i >= this.state.guesses.length) {
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
