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

class Game {
  answer = null;
  guesses = [];
  currentGuess = "";

  state = GameState.IN_PROGRESS;

  constructor(validAnswers, validGuesses) {
    this.validAnswers = validAnswers;
    this.validGuesses = validGuesses;
  }

  _updateAdversarialAnswer() {
    // TODO: implement adversarial answer selection
    this.answer = "OUIJA";
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
      this._updateAdversarialAnswer();
    }
  }

  _getLetters() {
    const words = [...this.guesses, this.currentGuess];
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
  }

  getLetterStates() {
    const letters = this._getLetters();

    return letters.map((wordLetters) => {
      return wordLetters.map((letter, index) => {
        if (letter === null) {
          return null;
        } else if (this.answer === null) {
          return { letter, state: LetterState.ABSENT };
        } else if (letter === this.answer[index]) {
          return { letter, state: LetterState.CORRECT };
        } else if (this.answer.includes(letter)) {
          return { letter, state: LetterState.PRESENT };
        } else {
          return { letter, state: LetterState.ABSENT };
        }
      });
    });
  }

  absentLetters() {
    const absent = new Set();

    const letterStates = this.getLetterStates();
    for (const wordLetterStates of letterStates) {
      for (const letterState of wordLetterStates) {
        if (letterState !== null && letterState.state === LetterState.ABSENT) {
          absent.add(letterState.letter);
        }
      }
    }

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
      const letter = $key.dataset.letter;
      if (absentLetters.has(letter)) {
        $key.classList.add("absent");
      } else {
        $key.classList.remove("absent");
      }
    }
  }

  render() {
    if (this.game.isFinished()) {
      this._renderFinalScreen();
    } else {
      this._renderBoard();
      this._renderKeyboard();
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

  init() {
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
  }
}

async function getWordList(url) {
  const response = await fetch(url);
  const text = await response.text();
  return text
    .split("\n")
    .map((word) => word.trim())
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
