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
 * Max-heap for finding k smallest lastUsed values (oldest entries).
 * Maintains heap property: parent.lastUsed >= children.lastUsed
 *
 * Used to efficiently find the k oldest cache entries without sorting all entries.
 * Space: O(k), Time: O(n log k) to find k oldest from n entries.
 */
export class MaxHeap {
  constructor(maxSize) {
    this.heap = [];
    this.maxSize = maxSize;
  }

  push(item) {
    if (this.heap.length < this.maxSize) {
      // Heap not full yet, add item and bubble up
      this.heap.push(item);
      this._bubbleUp(this.heap.length - 1);
    } else if (item.lastUsed < this.heap[0].lastUsed) {
      // Item is older than current max, replace root and bubble down
      this.heap[0] = item;
      this._bubbleDown(0);
    }
    // Else: item is newer than all k oldest, ignore it
  }

  getAll() {
    return this.heap;
  }

  _bubbleUp(index) {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[index].lastUsed <= this.heap[parentIndex].lastUsed) break;

      [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
      index = parentIndex;
    }
  }

  _bubbleDown(index) {
    while (true) {
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      let largest = index;

      if (
        leftChild < this.heap.length &&
        this.heap[leftChild].lastUsed > this.heap[largest].lastUsed
      ) {
        largest = leftChild;
      }

      if (
        rightChild < this.heap.length &&
        this.heap[rightChild].lastUsed > this.heap[largest].lastUsed
      ) {
        largest = rightChild;
      }

      if (largest === index) break;

      [this.heap[index], this.heap[largest]] = [this.heap[largest], this.heap[index]];
      index = largest;
    }
  }
}

/**
 * LRU cache for satisfiesLetterStates results.
 * Maintains a two-level Map structure with batch eviction for efficiency.
 */
export class SatisfiesCache {
  constructor(maxEntries = 10000, overheadFactor = 0.2) {
    this.maxEntries = maxEntries;
    this.overheadFactor = overheadFactor;
    // Two-level Map: letterStatesHash -> Map<word, {result, lastUsed}>
    this.cache = new Map();
    this.accessCounter = 0; // Monotonic counter for LRU tracking
    this.totalEntries = 0;
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
    this.totalEntries++;
    if (this.totalEntries > this.maxEntries * (1 + this.overheadFactor)) {
      this._evictOldest(Math.floor(this.maxEntries * this.overheadFactor));
    }
  }

  _evictOldest(count) {
    // Use bounded max-heap to find k oldest entries without sorting all entries
    // Space: O(k), Time: O(n log k) instead of O(n) space + O(n log n) time
    const heap = new MaxHeap(count);

    // Iterate over all entries, heap maintains k oldest
    for (const [hash, innerMap] of this.cache.entries()) {
      for (const [word, entry] of innerMap.entries()) {
        heap.push({ hash, word, lastUsed: entry.lastUsed });
      }
    }

    // Evict all entries from the heap (these are the k oldest)
    const toEvict = heap.getAll();
    for (const { hash, word } of toEvict) {
      const innerMap = this.cache.get(hash);
      if (innerMap) {
        innerMap.delete(word);
        this.totalEntries--;

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
    this.totalEntries = 0;
  }

  getStats() {
    return {
      letterStatesCount: this.cache.size,
      totalEntries: this.totalEntries,
      maxEntries: this.maxEntries,
    };
  }
}

// Module-level cache instance
const satisfiesCache = new SatisfiesCache(100000, 0.25);

export class LetterStateUtils {
  // Reusable data structures for satisfiesLetterStates (avoids allocations)
  static _reusableRequiredFreqs = new Uint8Array(26);
  static _reusableWordFreqs = new Uint8Array(26);
  static _reusableAbsent = new Set();

  /**
   * Generates a compact numeric hash for a letterStates array.
   * Uses base-79 encoding (0-78 per position), total ~35 bits for 5 positions.
   *
   * Encoding per position:
   * - 0: null (no constraint)
   * - 1-26: CORRECT (A=1, B=2, ..., Z=26)
   * - 27-52: PRESENT (A=27, B=28, ..., Z=52)
   * - 53-78: ABSENT (A=53, B=54, ..., Z=78)
   */
  static hashLetterStates(letterStates) {
    let hash = 0;
    for (let i = 0; i < letterStates.length; i++) {
      const ls = letterStates[i];
      let value = 0;
      if (ls !== null) {
        const letterCode = this._idx(ls.letter);
        if (ls.state === LetterState.CORRECT) {
          value = 1 + letterCode; // 1-26
        } else if (ls.state === LetterState.PRESENT) {
          value = 27 + letterCode; // 27-52
        } else {
          // LetterState.ABSENT
          value = 53 + letterCode; // 53-78
        }
      }
      hash = hash * 79 + value;
    }
    return hash;
  }

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
    const hash = this.hashLetterStates(letterStates);

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

  static _idx(letter) {
    return letter.charCodeAt(0) - 65; // 'A' = 65
  }

  static _chr(i) {
    return String.fromCharCode(65 + i);
  }

  static _satisfiesLetterStatesImpl(letterStates, word) {
    // Early termination - check CORRECT and PRESENT positions first
    for (let j = 0; j < WORD_LENGTH; j++) {
      const letterState = letterStates[j];
      if (letterState?.state === LetterState.CORRECT && word[j] !== letterState.letter) {
        return false;
      }

      if (letterState?.state === LetterState.PRESENT && word[j] === letterState.letter) {
        return false;
      }
    }

    // Reuse typed arrays and Set (class-level)
    this._reusableRequiredFreqs.fill(0);
    this._reusableWordFreqs.fill(0);
    this._reusableAbsent.clear();

    // First pass: collect CORRECT and PRESENT constraints, ABSENT letters
    for (let j = 0; j < WORD_LENGTH; j++) {
      const letterState = letterStates[j];
      if (letterState === null) continue;

      const { letter, state } = letterState;
      const i = this._idx(letter);

      if (state === LetterState.CORRECT || state === LetterState.PRESENT) {
        this._reusableRequiredFreqs[i]++;
        // Already checked above in early termination
      } else if (state === LetterState.ABSENT) {
        this._reusableAbsent.add(letter);
      }
    }

    // Second pass: check ABSENT letters in word
    for (const letter of word) {
      const i = this._idx(letter);
      if (this._reusableRequiredFreqs[i] > 0) {
        continue; // This letter is required, so it's allowed
      }
      if (this._reusableAbsent.has(letter)) {
        return false; // Word contains absent letter
      }
    }

    // Build word frequency map
    for (const letter of word) {
      const i = this._idx(letter);
      this._reusableWordFreqs[i]++;
    }

    // Check frequency requirements
    for (let i = 0; i < 26; i++) {
      const requiredCount = this._reusableRequiredFreqs[i];
      if (requiredCount === 0) continue;

      const letter = this._chr(i);
      const wordCount = this._reusableWordFreqs[i];

      if (this._reusableAbsent.has(letter)) {
        // Exact frequency required
        if (wordCount !== requiredCount) {
          return false;
        }
      } else {
        // Minimum frequency required
        if (wordCount < requiredCount) {
          return false;
        }
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

  serialize() {
    return {
      answer: this.answer,
      guesses: [...this.guesses],
      validAnswers: this.validAnswers,
      validGuesses: this.validGuesses,
    };
  }

  static deserialize(data) {
    return new GameState(data.answer, data.guesses, data.validAnswers, data.validGuesses);
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

const HEURISTIC_MAX = [4, 3, 3, 2, 2, 1];
const EVALUATION_TIME_MAX = 10000; // 10 seconds

// expectimax
// value is average number of remaining guesses
// tree: answer (max) -> guess (expect) -> ...
export const getAdversarialAnswer = (gameState) => {
  let statesConsidered = 0;
  const startedAt = Date.now().valueOf();

  const evaluateNode = (gameState, nodeType, alpha, beta) => {
    statesConsidered += 1;
    if (statesConsidered % 100000 === 0) {
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

        if (Date.now().valueOf() - startedAt > EVALUATION_TIME_MAX) {
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
    const maxChildScore = HEURISTIC_MAX[numGuessesAlreadyMade];

    let partialSum = 0.0;
    let partialProb = 0.0;

    for (const nextGuess of nextGuesses) {
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

      if (Date.now().valueOf() - startedAt > EVALUATION_TIME_MAX) {
        return { move: null, score: pessimisticFinalScore };
      }

      const { word: nextGuessWord, count: prob } = nextGuess;
      const nextGameState = gameState.withGuess(nextGuessWord);

      const { score } = evaluateNode(nextGameState, NodeType.ANSWER, alpha, beta);

      partialSum += prob * score;
      partialProb += prob;
    }

    return { move: null, score: 1 + partialSum };
  };

  const { move, score } = evaluateNode(gameState, NodeType.ANSWER, -Infinity, Infinity);

  return { move, score, statesConsidered };
};

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
