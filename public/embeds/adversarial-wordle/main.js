import {
  GameState,
  GameStatus,
  LetterState,
  LetterStateUtils,
  MAX_GUESSES,
  WORD_LENGTH,
  getWordListFromURL,
} from "./lib.js";

class WorkerManager {
  constructor(workerURL) {
    this.nextId = 1;
    this.pendingRequests = new Map();

    try {
      this.worker = new Worker(workerURL, { type: "module" });
      this.worker.onmessage = this._handleMessage.bind(this);
      this.worker.onerror = this._handleError.bind(this);
    } catch (err) {
      console.error("Failed to create worker:", err);
      this.worker = null; // Fallback to main thread
    }
  }

  _handleMessage(event) {
    const { type, id, result, error } = event.data;
    const request = this.pendingRequests.get(id);

    if (!request) return;

    clearTimeout(request.timer);
    this.pendingRequests.delete(id);

    if (type === "result") {
      request.resolve(result);
    } else if (type === "error") {
      request.reject(new Error(error));
    }
  }

  _handleError(err) {
    console.error("Worker error:", err);
    for (const [id, request] of this.pendingRequests.entries()) {
      clearTimeout(request.timer);
      request.reject(new Error("Worker error"));
    }
    this.pendingRequests.clear();
  }

  async computeAdversarialAnswer(gameState, timeout = 30000) {
    if (!this.worker) {
      // Fallback: import and compute on main thread
      const { getAdversarialAnswer } = await import("./worker.js");
      return getAdversarialAnswer(gameState);
    }

    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error("Worker timeout after 30 seconds"));
      }, timeout);

      this.pendingRequests.set(id, { resolve, reject, timer });
      this.worker.postMessage({
        type: "compute",
        id,
        gameState: gameState.serialize(),
      });
    });
  }
}

// Create worker at module level
const workerManager = new WorkerManager("./worker.js");

export class Game extends EventTarget {
  constructor(validAnswers, validGuesses) {
    super();
    this.validAnswers = validAnswers;
    this.validGuesses = validGuesses;

    const answer = this._getRandomAnswer();
    this.state = new GameState(answer, [], validAnswers, validGuesses);
    this.currentGuess = "";
    this.isComputing = false;
  }

  _getRandomAnswer() {
    const i = Math.floor(Math.random() * this.validAnswers.length);
    const { word } = this.validAnswers[i];

    return word;
  }

  async _getAdversarialAnswer() {
    const startTime = performance.now();

    this.dispatchEvent(
      new CustomEvent("loadingstart", {
        detail: {
          guessCount: this.state.guesses.length,
          validAnswersCount: this.state.validAnswers.length,
        },
      }),
    );

    try {
      const { move, score, statesConsidered } = await workerManager.computeAdversarialAnswer(
        this.state,
      );

      const duration = performance.now() - startTime;
      console.log(`states considered: ${statesConsidered}`);
      console.log(`duration: ${duration.toFixed(0)}ms`);

      this.dispatchEvent(
        new CustomEvent("loadingend", {
          detail: { answer: move, score, statesConsidered, duration },
        }),
      );

      return move;
    } catch (err) {
      console.error("Error computing adversarial answer:", err);
      this.dispatchEvent(
        new CustomEvent("loadingerror", {
          detail: { error: err },
        }),
      );
      throw err;
    }
  }

  isFinished() {
    return this.state.isTerminal();
  }

  enterLetter(letter) {
    if (this.state.isTerminal() || this.isComputing) {
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
    if (this.isComputing) {
      return;
    }
    this.currentGuess = this.currentGuess.slice(0, -1);
  }

  async submitCurrentGuess() {
    if (this.isFinished() || this.isComputing) {
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
        this.isComputing = true;
        try {
          const newAnswer = await this._getAdversarialAnswer();
          this.state = this.state.withAnswer(newAnswer);
        } finally {
          this.isComputing = false;
        }
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
    const present = new Set();

    const letterStates = this.getLetterStates();
    letterStates.forEach((wordLetterStates, i) => {
      if (i >= this.state.guesses.length) {
        return;
      }

      for (const letterState of wordLetterStates) {
        if (letterState === null) {
          continue;
        }

        if (letterState.state === LetterState.ABSENT) {
          absent.add(letterState.letter);
        } else if (
          letterState.state === LetterState.PRESENT ||
          letterState.state === LetterState.CORRECT
        ) {
          present.add(letterState.letter);
        }
      }
    });

    for (const letter of present) {
      absent.delete(letter);
    }

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

    // Bind event handlers
    this._handleLoadingStart = this._handleLoadingStart.bind(this);
    this._handleLoadingEnd = this._handleLoadingEnd.bind(this);
    this._handleLoadingError = this._handleLoadingError.bind(this);

    // Listen to game events
    this.game.addEventListener("loadingstart", this._handleLoadingStart);
    this.game.addEventListener("loadingend", this._handleLoadingEnd);
    this.game.addEventListener("loadingerror", this._handleLoadingError);
  }

  _handleLoadingStart(event) {
    const $overlay = this.$container.parentElement.querySelector(".loading-overlay");
    const $game = this.$container;
    if ($overlay) $overlay.classList.add("visible");
    if ($game) $game.classList.add("disabled");
  }

  _handleLoadingEnd(event) {
    const $overlay = this.$container.parentElement.querySelector(".loading-overlay");
    const $game = this.$container;
    if ($overlay) $overlay.classList.remove("visible");
    if ($game) $game.classList.remove("disabled");
  }

  _handleLoadingError(event) {
    this._handleLoadingEnd(event);
  }

  destroy() {
    this.game.removeEventListener("loadingstart", this._handleLoadingStart);
    this.game.removeEventListener("loadingend", this._handleLoadingEnd);
    this.game.removeEventListener("loadingerror", this._handleLoadingError);
  }

  _renderFinalScreen() {
    const status = this.game.state.getStatus();
    const guessCount = this.game.state.guesses.length;
    const won = status === GameStatus.WON;

    // Record the game result
    this.statsManager.recordGame(this.game.state);
    const computedStats = this.statsManager.getComputedStats();

    // Hide board and keyboard
    this.$container.querySelector(".board").classList.add("hidden");
    this.$container.querySelector(".keyboard").classList.add("hidden");

    // Show and populate stats screen
    const $statsScreen = this.$container.querySelector(".stats-screen");
    $statsScreen.classList.add("visible");

    // Populate game result
    const $resultTitle = $statsScreen.querySelector(".game-result-title");
    const $secretWord = $statsScreen.querySelector(".secret-word");

    $resultTitle.textContent = won ? "You got it!" : "Game over.";
    $secretWord.textContent = this.game.state.answer;

    this._populateStatsScreen(computedStats, guessCount, won);
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

  async _handleKey(keyCode) {
    if (this.isThinking) {
      return;
    }

    console.log("Key input:", keyCode);

    const isTerminal = this.game.state.isTerminal();

    if (keyCode === "Enter") {
      if (isTerminal) {
        this.newGame();
      } else {
        await this.submitCurrentGuess();
      }
    }

    if (isTerminal) {
      return;
    }

    if (keyCode === "Backspace") {
      this.deleteLetter();
    } else if (/^[a-zA-Z]$/.test(keyCode)) {
      this.enterLetter(keyCode.toUpperCase());
    }
  }

  async _handleKeyClick(evt) {
    const keyCode = evt.target.dataset.key;
    await this._handleKey(keyCode);
  }

  async _handleKeyDown(evt) {
    const { key, metaKey } = evt;
    if (metaKey) {
      return;
    }

    await this._handleKey(key);
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
      this.gameView.destroy();
    }

    // Clean up old game listeners if they exist
    if (this.game) {
      this.game.removeEventListener("loadingstart", this.onLoadingStart);
      this.game.removeEventListener("loadingend", this.onLoadingEnd);
    }

    this.game = new Game(this.validAnswers, this.validGuesses);
    this.isThinking = false;

    // Listen to loading events to block input
    this.onLoadingStart = () => {
      this.isThinking = true;
    };
    this.onLoadingEnd = () => {
      this.isThinking = false;
    };
    this.game.addEventListener("loadingstart", this.onLoadingStart);
    this.game.addEventListener("loadingend", this.onLoadingEnd);
    this.game.addEventListener("loadingerror", this.onLoadingEnd);

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

  async submitCurrentGuess() {
    await this.game.submitCurrentGuess();
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

    if (this.game) {
      this.game.removeEventListener("loadingstart", this.onLoadingStart);
      this.game.removeEventListener("loadingend", this.onLoadingEnd);
      this.game.removeEventListener("loadingerror", this.onLoadingEnd);
    }

    if (this.gameView) {
      this.gameView.destroy();
    }
  }
}

async function main() {
  const [validAnswers, validGuesses] = await Promise.all([
    getWordListFromURL("../../data/wordle-answers.csv"),
    getWordListFromURL("../../data/wordle-guesses.csv"),
  ]);

  const $container = document.querySelector(".game");
  const gameController = new GameController(validAnswers, validGuesses, $container);
  gameController.init();
}

main();
