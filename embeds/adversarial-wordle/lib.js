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
  constructor(answer, guesses = []) {
    this.answer = answer;
    this.guesses = guesses;
  }

  getStatus() {
    const n = this.guesses.length;

    if (n > 0 && n <= MAX_GUESSES && this.guesses[n - 1] === this.answer) {
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

export const normalizeDistribution = (wordCounts) => {
  const totalCount = wordCounts.reduce((sum, { count }) => sum + count, 0);
  return wordCounts.map(({ word, count }) => ({ word, count: count / totalCount }));
};

export const getAvailableAnswers = (validAnswers, gameState) => {
  const availableAnswers = validAnswers.filter(({ word: answer }) =>
    gameState.satisfiesLetterStates(answer),
  );

  return normalizeDistribution(availableAnswers);
};

export const getProbableGuesses = (validGuesses, gameState) => {
  const probableGuesses = validGuesses.filter(
    ({ word: guess }) =>
      !gameState.guesses.includes(guess) && gameState.satisfiesLetterStates(guess),
  );

  return normalizeDistribution(probableGuesses);
};

// expectimax
// value is average number of remaining guesses
// tree: answer (max) -> guess (expect) -> ...
export const getAdversarialAnswer = (validAnswers, validGuesses, gameState) => {
  let statesConsidered = 0;

  const evaluateNode = (validAnswers, validGuesses, gameState, nodeType, alpha, beta) => {
    statesConsidered += 1;
    if (statesConsidered % 10000 === 0) {
      console.log(`states considered: ${statesConsidered}`);
    }

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
        const { word: nextAnswerWord } = nextAnswer;

        const nextGameState = gameState.withAnswer(nextAnswerWord);
        const { score } = evaluateNode(
          nextAnswers,
          validGuesses,
          nextGameState,
          NodeType.GUESS,
          alpha,
          beta,
        );

        if (bestAnswer === null || score > bestScore) {
          bestAnswer = nextAnswerWord;
          bestScore = score;
        }

        if (bestScore >= beta) {
          // Beta cutoff
          break;
        }

        // Update alpha
        alpha = Math.max(alpha, bestScore);
      }

      return { move: bestAnswer, score: bestScore };
    }

    // guess: expect
    const nextGuesses = getProbableGuesses(validGuesses, gameState);
    const n = nextGuesses.length;

    // Score bounds for children (ANSWER nodes after this guess)
    const numGuessesAlreadyMade = gameState.guesses.length;
    const minChildScore = 0; // best case: WON immediately
    const maxChildScore = MAX_GUESSES - numGuessesAlreadyMade; // worst case: all remaining guesses

    let partialSum = 0.0;
    let partialProb = 0.0;

    for (const nextGuess of nextGuesses) {
      const { word: nextGuessWord, count: prob } = nextGuess;
      const nextGameState = gameState.withGuess(nextGuessWord);

      const { score } = evaluateNode(
        validAnswers,
        nextGuesses,
        nextGameState,
        NodeType.ANSWER,
        alpha,
        beta,
      );

      partialSum += prob * score;
      partialProb += prob;

      const optimisticAvg = partialSum + (1 - partialProb) * maxChildScore;
      const optimisticFinalScore = 1 + optimisticAvg;

      const pessimisticAvg = partialSum + (1 - partialProb) * minChildScore;
      const pessimisticFinalScore = 1 + pessimisticAvg;

      // Alpha cutoff: even best case can't improve alpha
      if (optimisticFinalScore <= alpha) {
        return { move: null, score: optimisticFinalScore };
      }

      // Beta cutoff: even worst case exceeds beta
      if (pessimisticFinalScore >= beta) {
        return { move: null, score: pessimisticFinalScore };
      }
    }

    return { move: null, score: 1 + partialSum };
  };

  const { move, score } = evaluateNode(
    validAnswers,
    validGuesses,
    gameState,
    NodeType.ANSWER,
    -Infinity,
    Infinity,
  );

  return { move, score, statesConsidered };
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
    const { word, count } = this.validAnswers[i];

    console.log(`Random answer: ${word} (count: ${count})`);

    return word;
  }

  _getAdversarialAnswer() {
    const { move, score, statesConsidered } = getAdversarialAnswer(
      this.validAnswers,
      this.validGuesses,
      this.state,
    );

    console.log(`move: ${move}, score: ${score}`);
    console.log(`states considered: ${statesConsidered}`);

    return move;
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

    if (guess.length !== WORD_LENGTH) {
      return;
    }

    try {
      if (!this.validGuesses.some(({ word }) => word === guess)) {
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

export class StatsManager {
  constructor(storageKey = "adversarial-wordle-stats") {
    this.storageKey = storageKey;
  }

  getDefaultStats() {
    return {
      totalGames: 0,
      totalWins: 0,
      totalGuesses: 0,
      histogram: [0, 0, 0, 0, 0, 0], // index 0 = 1 guess, index 5 = 6 guesses
    };
  }

  loadStats() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) {
        return this.getDefaultStats();
      }
      const stats = JSON.parse(stored);
      // Validate structure
      if (!stats.histogram || stats.histogram.length !== 6) {
        return this.getDefaultStats();
      }
      return stats;
    } catch (err) {
      console.error("Error loading stats:", err);
      return this.getDefaultStats();
    }
  }

  saveStats(stats) {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(stats));
    } catch (err) {
      console.error("Error saving stats:", err);
    }
  }

  recordGame(gameState) {
    const status = gameState.getStatus();

    if (status === GameStatus.IN_PROGRESS) {
      throw new Error("Cannot record stats for game in progress");
    }

    const stats = this.loadStats();
    stats.totalGames += 1;

    if (status === GameStatus.WON) {
      const guessCount = gameState.guesses.length;
      stats.totalWins += 1;
      stats.totalGuesses += guessCount;
      // guessCount is 1-6, array index is 0-5
      stats.histogram[guessCount - 1] += 1;
    }

    this.saveStats(stats);
    return stats;
  }

  clearStats() {
    const stats = this.getDefaultStats();
    this.saveStats(stats);
    return stats;
  }

  getComputedStats() {
    const stats = this.loadStats();
    const winRate =
      stats.totalGames > 0 ? Math.round((stats.totalWins / stats.totalGames) * 100) : 0;
    const avgGuesses =
      stats.totalWins > 0 ? (stats.totalGuesses / stats.totalWins).toFixed(1) : "0.0";

    return {
      ...stats,
      winRate,
      avgGuesses,
    };
  }
}

export class GameView {
  constructor(game, statsManager, $container) {
    this.game = game;
    this.statsManager = statsManager;
    this.$container = $container;
  }

  _renderFinalScreen() {
    const status = this.game.state.getStatus();
    const guessCount = this.game.state.guesses.length;

    // Record the game result
    this.statsManager.recordGame(this.game.state);
    const computedStats = this.statsManager.getComputedStats();

    // Hide board and keyboard
    this.$container.querySelector(".board").classList.add("hidden");
    this.$container.querySelector(".keyboard").classList.add("hidden");

    // Show and populate stats screen
    const $statsScreen = this.$container.querySelector(".stats-screen");
    $statsScreen.classList.add("visible");

    this._populateStatsScreen(computedStats, guessCount, status === GameStatus.WON);
  }

  _populateStatsScreen(stats, currentGuessCount, won) {
    const $statsScreen = this.$container.querySelector(".stats-screen");

    // Update summary stats
    $statsScreen.querySelector('[data-stat="totalGames"]').textContent = stats.totalGames;
    $statsScreen.querySelector('[data-stat="winRate"]').textContent = stats.winRate;
    $statsScreen.querySelector('[data-stat="avgGuesses"]').textContent = stats.avgGuesses;

    // Update histogram
    const maxCount = Math.max(...stats.histogram, 1); // avoid division by zero

    for (let i = 0; i < 6; i++) {
      const guessNum = i + 1;
      const count = stats.histogram[i];
      const percentage = (count / maxCount) * 100;

      const $bar = $statsScreen.querySelector(`[data-bar="${guessNum}"]`);
      const $count = $bar.querySelector(".histogram-count");

      $count.textContent = count;
      $bar.style.width = `${Math.max(percentage, 7)}%`; // minimum 7% for visibility

      // Highlight the current game's guess count if won
      if (won && guessNum === currentGuessCount) {
        $bar.classList.add("highlight");
      } else {
        $bar.classList.remove("highlight");
      }
    }
  }

  _hideStatsScreen() {
    const $statsScreen = this.$container.querySelector(".stats-screen");
    $statsScreen.classList.remove("visible");

    this.$container.querySelector(".board").classList.remove("hidden");
    this.$container.querySelector(".keyboard").classList.remove("hidden");
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
    this.statsManager = new StatsManager();

    this.onKeyClick = this._handleKeyClick.bind(this);
    this.onKeyDown = this._handleKeyDown.bind(this);
    this.onStatsAction = this._handleStatsAction.bind(this);

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

  _handleStatsAction(evt) {
    const action = evt.target.dataset.action;

    if (action === "play-again") {
      this.newGame();
    } else if (action === "clear-stats") {
      if (confirm("Are you sure you want to clear all statistics?")) {
        this.statsManager.clearStats();
        // Refresh the stats display
        const stats = this.statsManager.getComputedStats();
        const status = this.game.state.getStatus();
        const won = status === GameStatus.WON;
        this.gameView._populateStatsScreen(stats, 0, won);
      }
    }
  }

  init() {
    document.addEventListener("keydown", this.onKeyDown);

    const $keys = this.$container.querySelectorAll(".key");
    for (const $key of $keys) {
      $key.addEventListener("click", this.onKeyClick);
    }

    // Add stats button listeners
    const $statsButtons = this.$container.querySelectorAll(".stats-actions .btn");
    for (const $button of $statsButtons) {
      $button.addEventListener("click", this.onStatsAction);
    }
  }

  newGame() {
    // Hide stats screen if visible
    if (this.gameView) {
      this.gameView._hideStatsScreen();
    }

    this.game = new Game(this.validAnswers, this.validGuesses);
    this.gameView = new GameView(this.game, this.statsManager, this.$container);
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

    const $statsButtons = this.$container.querySelectorAll(".stats-actions .btn");
    for (const $button of $statsButtons) {
      $button.removeEventListener("click", this.onStatsAction);
    }

    document.removeEventListener("keydown", this.onKeyDown);
  }
}

export async function getWordList(url) {
  const response = await fetch(url);
  const text = await response.text();
  return text
    .split("\n")
    .slice(1)
    .map((line) => {
      const [wordRaw, countStr] = line.split(",");

      const word = wordRaw.trim().toUpperCase();
      const count = parseInt(countStr, 10);

      return { word, count };
    })
    .filter(({ word, count }) => word.length > 0 && !isNaN(count) && count > 0);
}
