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

/**
 * LRU cache for satisfiesLetterStates results.
 * Maintains a two-level Map structure with batch eviction for efficiency.
 */
class SatisfiesCache {
  constructor(maxEntries = 10000) {
    this.maxEntries = maxEntries;
    // Two-level Map: letterStatesHash -> Map<word, {result, lastUsed}>
    this.cache = new Map();
    this.accessCounter = 0; // Monotonic counter for LRU tracking
  }

  get(letterStatesHash, word) {
    const innerMap = this.cache.get(letterStatesHash);
    if (!innerMap) return undefined;

    const entry = innerMap.get(word);
    if (!entry) return undefined;

    // Mark as recently used
    entry.lastUsed = ++this.accessCounter;
    return entry.result;
  }

  set(letterStatesHash, word, result) {
    let innerMap = this.cache.get(letterStatesHash);
    if (!innerMap) {
      innerMap = new Map();
      this.cache.set(letterStatesHash, innerMap);
    }

    innerMap.set(word, {
      result,
      lastUsed: ++this.accessCounter,
    });

    // Batch eviction: only evict when significantly over capacity
    // This reduces eviction frequency and amortizes the O(n) scan cost
    const totalSize = this._getTotalSize();
    if (totalSize > this.maxEntries * 1.2) {
      // Evict 20% of entries
      this._evictOldest(Math.floor(this.maxEntries * 0.2));
    }
  }

  _getTotalSize() {
    let total = 0;
    for (const innerMap of this.cache.values()) {
      total += innerMap.size;
    }
    return total;
  }

  _evictOldest(count) {
    // Collect all entries with their access times
    const entries = [];
    for (const [hash, innerMap] of this.cache.entries()) {
      for (const [word, entry] of innerMap.entries()) {
        entries.push({ hash, word, lastUsed: entry.lastUsed });
      }
    }

    // Sort by lastUsed (oldest first)
    entries.sort((a, b) => a.lastUsed - b.lastUsed);

    // Evict the oldest `count` entries
    const toEvict = entries.slice(0, count);
    for (const { hash, word } of toEvict) {
      const innerMap = this.cache.get(hash);
      if (innerMap) {
        innerMap.delete(word);
        // Clean up empty inner maps
        if (innerMap.size === 0) {
          this.cache.delete(hash);
        }
      }
    }
  }

  clear() {
    this.cache.clear();
    this.accessCounter = 0;
  }

  getStats() {
    return {
      letterStatesCount: this.cache.size,
      totalEntries: this._getTotalSize(),
      maxEntries: this.maxEntries,
    };
  }
}

// Module-level cache instance
const satisfiesCache = new SatisfiesCache(10000);

/**
 * Generates a compact hash string for a letterStates array.
 */
function hashLetterStates(letterStates) {
  const parts = letterStates.map((ls) => (ls === null ? "__" : `${ls.letter}${ls.state[0]}`));
  return parts.join("");
}

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
    const hash = hashLetterStates(letterStates);

    // Check cache using new API
    const cached = satisfiesCache.get(hash, word);
    if (cached !== undefined) {
      return cached;
    }

    // Cache miss: compute result
    const result = this._satisfiesLetterStatesImpl(letterStates, word);

    // Store in cache (LRU eviction handled internally)
    satisfiesCache.set(hash, word, result);

    return result;
  }

  static _satisfiesLetterStatesImpl(letterStates, word) {
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

  static clearSatisfiesCache() {
    satisfiesCache.clear();
  }

  static getCacheStats() {
    return satisfiesCache.getStats();
  }
}

export class GameState {
  constructor(answer, guesses, validAnswers, validGuesses) {
    this.answer = answer;
    this.guesses = guesses;
    this.validAnswers = validAnswers;
    this.validGuesses = validGuesses;
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

    // Validate that answer is in validAnswers
    if (!this.validAnswers.some(({ word }) => word === answer)) {
      throw new Error(`invalid answer ${answer}: not in validAnswers`);
    }

    return new GameState(answer, [...this.guesses], this.validAnswers, this.validGuesses);
  }

  withGuess(guess) {
    if (this.guesses.length >= MAX_GUESSES) {
      throw new Error("max guesses reached");
    }

    if (guess.length !== WORD_LENGTH) {
      throw new Error(`invalid guess ${guess}: wrong length`);
    }

    // Get letter states for this guess only
    const newLetterStates = LetterStateUtils.getLetterStates(this.answer, guess);

    // Filter validAnswers and validGuesses based on NEW letter states only
    const filteredAnswers = this.validAnswers.filter(({ word }) =>
      LetterStateUtils.satisfiesLetterStates(newLetterStates, word),
    );

    const filteredGuesses = this.validGuesses.filter(({ word }) =>
      LetterStateUtils.satisfiesLetterStates(newLetterStates, word),
    );

    return new GameState(this.answer, [...this.guesses, guess], filteredAnswers, filteredGuesses);
  }

  static simulate(answer, guesses, validAnswers, validGuesses) {
    let gameState = new GameState(answer, [], validAnswers, validGuesses);

    for (const guess of guesses) {
      gameState = gameState.withGuess(guess);
    }

    return gameState;
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
    if (!this.validGuesses.some(({ word: validWord }) => validWord === word)) {
      return false;
    }

    const n = this.guesses.length;
    if (n === 0) {
      return true;
    }

    const lastGuess = this.guesses[n - 1];
    const lastLetterStates = LetterStateUtils.getLetterStates(this.answer, lastGuess);
    return LetterStateUtils.satisfiesLetterStates(lastLetterStates, word);
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

export const getAnswersToEvaluate = (gameState) => {
  const validAnswers = gameState.validAnswers.toSorted((a, b) => a.count - b.count);

  return normalizeDistribution(validAnswers);
};

const MAX_GUESS_FANOUT = 100;

export const getGuessesToEvaluate = (gameState) => {
  const validGuesses = gameState.validGuesses.filter(
    ({ word: guess }) => !gameState.guesses.includes(guess),
  );

  const probableGuesses = validGuesses
    .toSorted((a, b) => b.count - a.count)
    .slice(0, MAX_GUESS_FANOUT);

  return normalizeDistribution(probableGuesses);
};

// expectimax
// value is average number of remaining guesses
// tree: answer (max) -> guess (expect) -> ...
export const getAdversarialAnswer = (gameState) => {
  let statesConsidered = 0;

  const evaluateNode = (gameState, nodeType, alpha, beta) => {
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
      const nextAnswers = getAnswersToEvaluate(gameState);
      let bestAnswer = null;
      let bestScore = -Infinity;

      for (const nextAnswer of nextAnswers) {
        const { word: nextAnswerWord } = nextAnswer;

        const nextGameState = gameState.withAnswer(nextAnswerWord);
        const { score } = evaluateNode(nextGameState, NodeType.GUESS, alpha, beta);

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
    const nextGuesses = getGuessesToEvaluate(gameState);
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

      const { score } = evaluateNode(nextGameState, NodeType.ANSWER, alpha, beta);

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

  const { move, score } = evaluateNode(gameState, NodeType.ANSWER, -Infinity, Infinity);

  return { move, score, statesConsidered };
};

export class Game {
  constructor(validAnswers, validGuesses) {
    this.validAnswers = validAnswers;
    this.validGuesses = validGuesses;

    const answer = this._getRandomAnswer();
    this.state = new GameState(answer, [], validAnswers, validGuesses);
    this.currentGuess = "";
  }

  _getRandomAnswer() {
    const i = Math.floor(Math.random() * this.validAnswers.length);
    const { word, count } = this.validAnswers[i];

    console.log(`Random answer: ${word} (count: ${count})`);

    return word;
  }

  _getAdversarialAnswer() {
    const { move, score, statesConsidered } = getAdversarialAnswer(this.state);

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

export function parseWordList(text) {
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

export async function getWordListFromURL(url) {
  const response = await fetch(url);
  const text = await response.text();
  return parseWordList(text);
}
