export const GameStatus = {
  IN_PROGRESS: "in_progress",
  WON: "won",
  LOST: "lost",
};

export const LetterState = {
  CORRECT: "correct",
  PRESENT: "present",
  ABSENT: "absent",
};

export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;

export class LetterStateUtils {
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

  static satisfiesLetterStates(letterStates, word) {
    const requiredFreqs = {};
    const absent = new Set();

    // first pass: check CORRECT and PRESENT letters, collect PRESENT / ABSENT info and counts
    for (let j = 0; j < WORD_LENGTH; j++) {
      const letterState = letterStates[j];
      if (letterState === null) {
        continue;
      }

      const { letter, state } = letterState;

      if (state === LetterState.CORRECT) {
        requiredFreqs[letter] = (requiredFreqs[letter] || 0) + 1;
        if (word[j] !== letter) {
          return false;
        }
      } else if (state === LetterState.PRESENT) {
        requiredFreqs[letter] = (requiredFreqs[letter] || 0) + 1;
        if (word[j] === letter) {
          return false;
        }
      } else if (state === LetterState.ABSENT) {
        absent.add(letter);
      }
    }

    // second pass: check ABSENT letters
    for (const letter of word) {
      const requiredCount = requiredFreqs[letter] || 0;
      if (requiredCount > 0) {
        continue;
      }

      if (absent.has(letter)) {
        return false;
      }
    }

    // check frequencies
    const wordFreqs = {};
    for (const letter of word) {
      wordFreqs[letter] = (wordFreqs[letter] || 0) + 1;
    }
    for (const [letter, requiredCount] of Object.entries(requiredFreqs)) {
      const wordCount = wordFreqs[letter] || 0;
      if (absent.has(letter)) {
        if (wordCount !== requiredCount) {
          return false;
        }
      } else if (wordCount < requiredCount) {
        return false;
      }
    }

    return true;
  }
}

export class GameState {
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

  isTerminal() {
    const status = this.getStatus();
    return status !== GameStatus.IN_PROGRESS;
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

    return new GameState(this.answer, [...this.guesses, guess]);
  }

  getLetterStates() {
    const letterStates = this.guesses.map((word) =>
      LetterStateUtils.getLetterStates(this.answer, word),
    );

    while (letterStates.length < MAX_GUESSES) {
      letterStates.push(Array(WORD_LENGTH).fill(null));
    }

    return letterStates;
  }

  satisfiesLetterStates(word) {
    const letterStates = this.getLetterStates();

    return letterStates.every((wordLetterStates) =>
      LetterStateUtils.satisfiesLetterStates(wordLetterStates, word),
    );
  }
}

export const NodeType = {
  ANSWER: "answer",
  GUESS: "guess",
};

export const getAvailableAnswers = (validAnswers, gameState) => {
  return validAnswers.filter((answer) =>
    LetterStateUtils.satisfiesLetterStates(gameState.getLetterStates(), answer),
  );
};

export const getProbableGuesses = (validGuesses, gameState) => {
  return validGuesses.filter(
    (guess) =>
      !gameState.guesses.includes(guess) &&
      LetterStateUtils.satisfiesLetterStates(gameState.getLetterStates(), guess),
  );
};

// expectimax
// value is average number of remaining guesses
// tree: answer (max) -> guess (expect) -> ...
export const getAdversarialAnswer = (validAnswers, validGuesses, gameState) => {
  let statesConsidered = 0;

  const evaluateNode = (validAnswers, validGuesses, gameState, nodeType) => {
    statesConsidered += 1;

    const status = gameState.getStatus();

    if (status === GameStatus.WON) {
      return { move: null, score: 0 };
    }

    if (status === GameStatus.LOST) {
      return { move: null, score: 1 };
    }

    if (nodeType === NodeType.ANSWER) {
      // answer: max
      const nextAnswers = getAvailableAnswers(validAnswers, gameState);
      let bestAnswer = null;
      let bestScore = -Infinity;

      for (const nextAnswer of nextAnswers) {
        const nextGameState = gameState.withAnswer(nextAnswer);
        const { score } = evaluateNode(nextAnswers, validGuesses, nextGameState, NodeType.GUESS);
        if (bestAnswer === null || score > bestScore) {
          bestAnswer = nextAnswer;
          bestScore = score;
        }
      }

      const space = "  ".repeat(gameState.guesses.length);
      console.log(
        `${space}type=${nodeType}, guesses=${gameState.guesses.join(",")}, bestAnswer=${bestAnswer}, bestScore=${bestScore}`,
      );

      return { move: bestAnswer, score: bestScore };
    }

    // guess: expect
    const nextGuesses = getProbableGuesses(validGuesses, gameState);
    let totalScore = 0.0;
    let totalWeight = 0.0;
    for (const nextGuess of nextGuesses) {
      const nextGameState = gameState.withGuess(nextGuess);
      const { score } = evaluateNode(validAnswers, nextGuesses, nextGameState, NodeType.ANSWER);
      const weight = Math.pow(2, -score);
      totalScore += score * weight;
      totalWeight += weight;
    }

    return { move: null, score: 1 + totalScore / totalWeight };
  };

  const { move, score } = evaluateNode(validAnswers, validGuesses, gameState, NodeType.ANSWER);
  console.log(`move: ${move}, score: ${score}`);
  console.log(`states considered: ${statesConsidered}`);

  return move;
};

export class Game {
  constructor(validAnswers, validGuesses) {
    this.validAnswers = validAnswers;
    this.validGuesses = validGuesses;

    const answer = this._getRandomAnswer();
    this.state = new GameState(answer, []);
    this.currentGuess = "";
  }

  _getRandomAnswer() {
    const i = Math.floor(Math.random() * this.validAnswers.length);
    console.log(`Random answer: ${this.validAnswers[i]}`);
    return this.validAnswers[i];
  }

  _getAdversarialAnswer() {
    return getAdversarialAnswer(this.validAnswers, this.validGuesses, this.state);
  }

  isFinished() {
    return this.state.isTerminal();
  }

  enterLetter(letter) {
    if (this.state.isTerminal()) {
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

      this.currentGuess = "";
      this.state = this.state.withGuess(guess);

      if (!this.isFinished()) {
        const newAnswer = this._getAdversarialAnswer();
        this.state = this.state.withAnswer(newAnswer);
      }
    } catch (err) {
      alert(err.message);
    }
  }

  getLetterStates() {
    const letterStates = this.state.getLetterStates();

    letterStates[this.state.guesses.length] = LetterStateUtils.getLetterStates(
      "",
      this.currentGuess,
    );

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

export class GameView {
  constructor(game, $container) {
    this.game = game;
    this.$container = $container;
  }

  _renderFinalScreen() {
    // TODO: actually implement this
    alert("Game Over! The answer was: " + this.game.state.answer.toUpperCase());
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

export class GameController {
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
    const { key, metaKey } = evt;
    if (metaKey) {
      return;
    }

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

export async function getWordList(url) {
  const response = await fetch(url);
  const text = await response.text();
  return text
    .split("\n")
    .map((word) => word.trim().toUpperCase())
    .filter((word) => word.length > 0);
}
