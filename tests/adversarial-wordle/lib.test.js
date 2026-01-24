import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  GameState,
  getAdversarialAnswer,
  LetterState,
  LetterStateUtils,
  MaxHeap,
  SatisfiesCache,
} from "../../public/embeds/adversarial-wordle/lib.js";
import { getWordListFromFile } from "./helpers";

const __dirname = new URL(".", import.meta.url).pathname;

describe("LetterStateUtils", () => {
  describe("getLetterStates", () => {
    it("returns all null for empty guess", () => {
      const answer = "STARE";
      const letterStates = LetterStateUtils.getLetterStates(answer, "");
      expect(letterStates).toEqual(Array(5).fill(null));
    });

    it("returns all correct for exact match", () => {
      const answer = "STARE";
      const letterStates = LetterStateUtils.getLetterStates(answer, answer);
      expect(letterStates).toEqual(
        Array.from(answer).map((letter) => ({ letter, state: LetterState.CORRECT })),
      );
    });

    it("returns correct letter states for partial match", () => {
      const answer = "STARE";
      const guess = "SCRAP";
      const letterStates = LetterStateUtils.getLetterStates(answer, guess);
      expect(letterStates).toEqual([
        { letter: "S", state: LetterState.CORRECT },
        { letter: "C", state: LetterState.ABSENT },
        { letter: "R", state: LetterState.PRESENT },
        { letter: "A", state: LetterState.PRESENT },
        { letter: "P", state: LetterState.ABSENT },
      ]);
    });

    it("handles repeated letters correctly", () => {
      const answer = "BALLO";
      const guess = "ALLEY";
      const letterStates = LetterStateUtils.getLetterStates(answer, guess);
      expect(letterStates).toEqual([
        { letter: "A", state: LetterState.PRESENT },
        { letter: "L", state: LetterState.PRESENT },
        { letter: "L", state: LetterState.CORRECT },
        { letter: "E", state: LetterState.ABSENT },
        { letter: "Y", state: LetterState.ABSENT },
      ]);
    });

    it("handles all absent letters", () => {
      const answer = "MIGHT";
      const guess = "CLOWN";
      const letterStates = LetterStateUtils.getLetterStates(answer, guess);
      expect(letterStates).toEqual([
        { letter: "C", state: LetterState.ABSENT },
        { letter: "L", state: LetterState.ABSENT },
        { letter: "O", state: LetterState.ABSENT },
        { letter: "W", state: LetterState.ABSENT },
        { letter: "N", state: LetterState.ABSENT },
      ]);
    });
  });

  describe("satisfiesLetterStates", () => {
    it.for([
      { guess: "ACFDG", expected: true }, // matches all constraints
      { guess: "ABCDE", expected: false }, // B, E should be absent
      { guess: "ACBDG", expected: false }, // B should be absent, regardless of position
      { guess: "AFCDG", expected: false }, // C should not be in position 2
      { guess: "AAFDG", expected: false }, // must have at least one C
      { guess: "ACFDC", expected: true }, // can have extra C's
    ])("ABCDE:capca returns $expected for $guess", ({ guess, expected }) => {
      const letterStates = [
        { letter: "A", state: LetterState.CORRECT },
        { letter: "B", state: LetterState.ABSENT },
        { letter: "C", state: LetterState.PRESENT },
        { letter: "D", state: LetterState.CORRECT },
        { letter: "E", state: LetterState.ABSENT },
      ];
      expect(LetterStateUtils.satisfiesLetterStates(letterStates, guess)).toBe(expected);
    });
  });

  describe("satisfiesLetterStates memoization", () => {
    beforeEach(() => {
      LetterStateUtils.clearSatisfiesCache();
    });

    it("caches results for repeated calls", () => {
      const letterStates = [{ letter: "A", state: LetterState.CORRECT }, null, null, null, null];

      LetterStateUtils.satisfiesLetterStates(letterStates, "ABCDE");
      const stats1 = LetterStateUtils.getCacheStats();
      expect(stats1.totalEntries).toBe(1);

      // Second call should hit cache
      LetterStateUtils.satisfiesLetterStates(letterStates, "ABCDE");
      const stats2 = LetterStateUtils.getCacheStats();
      expect(stats2.totalEntries).toBe(1); // No new entries
    });

    it("distinguishes different letterStates patterns", () => {
      const ls1 = [{ letter: "A", state: LetterState.CORRECT }, null, null, null, null];
      const ls2 = [{ letter: "B", state: LetterState.CORRECT }, null, null, null, null];

      LetterStateUtils.satisfiesLetterStates(ls1, "ABCDE");
      LetterStateUtils.satisfiesLetterStates(ls2, "ABCDE");

      const stats = LetterStateUtils.getCacheStats();
      expect(stats.letterStatesCount).toBe(2); // Two different hashes
    });

    it("handles empty letterStates", () => {
      const emptyLS = [null, null, null, null, null];
      const result = LetterStateUtils.satisfiesLetterStates(emptyLS, "ABCDE");
      expect(result).toBe(true); // No constraints = all words satisfy
    });

    it("caches different words with same letterStates separately", () => {
      const letterStates = [{ letter: "A", state: LetterState.CORRECT }, null, null, null, null];

      LetterStateUtils.satisfiesLetterStates(letterStates, "ABCDE");
      LetterStateUtils.satisfiesLetterStates(letterStates, "AFGHT");

      const stats = LetterStateUtils.getCacheStats();
      expect(stats.letterStatesCount).toBe(1); // Same letterStates hash
      expect(stats.totalEntries).toBe(2); // Two different words
    });

    it("produces consistent results with and without cache", () => {
      const letterStates = [
        { letter: "A", state: LetterState.CORRECT },
        { letter: "B", state: LetterState.ABSENT },
        { letter: "C", state: LetterState.PRESENT },
        { letter: "D", state: LetterState.CORRECT },
        { letter: "E", state: LetterState.ABSENT },
      ];

      LetterStateUtils.clearSatisfiesCache();

      // First call (cache miss)
      const result1 = LetterStateUtils.satisfiesLetterStates(letterStates, "ACFDG");
      // Second call (cache hit)
      const result2 = LetterStateUtils.satisfiesLetterStates(letterStates, "ACFDG");

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(result1).toBe(result2);
    });
  });
});

describe("GameState", () => {
  describe("satisfiesLetterStates", async () => {
    const [validAnswers, validGuesses] = await Promise.all([
      getWordListFromFile(path.join(__dirname, "../../public/data/wordle-answers.csv")),
      getWordListFromFile(path.join(__dirname, "../../public/data/wordle-guesses.csv")),
    ]);

    it.for([
      { answer: "CAIRN", guesses: ["ABASE", "CADDY", "CALIF", "CAPUT", "CANON"] },
      { answer: "REIGN", guesses: ["ROARS", "RECCE", "REDDY", "REWTH", "RENIN"] },
      { answer: "AMPLE", guesses: ["SINGE", "ACKEE", "ADOBE", "AQUAE", "APPLE"] },
      { answer: "RADIO", guesses: ["REBUS", "RAGGA", "RALLY", "RANCH", "RATOO"] },
    ])("handles actual letter states correctly: $answer ($guesses)", ({ answer, guesses }) => {
      const gameState = GameState.simulate(answer, guesses, validAnswers, validGuesses);

      expect(gameState.satisfiesLetterStates(answer)).toBe(true);
    });
  });
});

describe("getAdversarialAnswer", async () => {
  const [validAnswers, validGuesses] = await Promise.all([
    getWordListFromFile(path.join(__dirname, "../../public/data/wordle-answers.csv")),
    getWordListFromFile(path.join(__dirname, "../../public/data/wordle-guesses.csv")),
  ]);

  it.for([
    { answer: "VOGUE", guesses: ["ADIEU"], maxStatesConsidered: 1500000 },
    { answer: "TAKER", guesses: ["CRATE"], maxStatesConsidered: 370000 },
    { answer: "MERRY", guesses: ["MIRTH"], maxStatesConsidered: 31000 },
    { answer: "HAUTE", guesses: ["THEWS"], maxStatesConsidered: 20000 },
    { answer: "SHIRE", guesses: ["RISEN"], maxStatesConsidered: 2000 },
    { answer: "HEFTY", guesses: ["THEWS", "ETHIC"], maxStatesConsidered: 1200 },
    { answer: "EXTRA", guesses: ["TAXES"], maxStatesConsidered: 150 },
  ])(
    "returns valid answer in less than $maxStatesConsidered states considered: $answer / $guesses",
    ({ answer, guesses, maxStatesConsidered }) => {
      const gameState = GameState.simulate(answer, guesses, validAnswers, validGuesses);

      const { move, score, statesConsidered } = getAdversarialAnswer(gameState);
      console.log(`move: ${move}, score: ${score}`);
      console.log(`states considered: ${statesConsidered}`);

      expect(gameState.satisfiesLetterStates(move)).toBe(true);
      expect(statesConsidered).toBeGreaterThan(0);
      expect(statesConsidered).toBeLessThanOrEqual(maxStatesConsidered);
    },
  );
});

// Helper function to verify max-heap invariant
function verifyHeapInvariant(heap) {
  const items = heap.getAll();
  for (let i = 0; i < items.length; i++) {
    const leftChild = 2 * i + 1;
    const rightChild = 2 * i + 2;

    if (leftChild < items.length) {
      expect(
        items[i].lastUsed,
        `Heap invariant violated at index ${i}: parent.lastUsed=${items[i].lastUsed} < leftChild[${leftChild}].lastUsed=${items[leftChild].lastUsed}`,
      ).toBeGreaterThanOrEqual(items[leftChild].lastUsed);
    }
    if (rightChild < items.length) {
      expect(
        items[i].lastUsed,
        `Heap invariant violated at index ${i}: parent.lastUsed=${items[i].lastUsed} < rightChild[${rightChild}].lastUsed=${items[rightChild].lastUsed}`,
      ).toBeGreaterThanOrEqual(items[rightChild].lastUsed);
    }
  }
}

describe("MaxHeap", () => {
  describe("basic operations", () => {
    it("returns empty array for empty heap", () => {
      const heap = new MaxHeap(5);
      expect(heap.getAll()).toEqual([]);
    });

    it("stores single item correctly", () => {
      const heap = new MaxHeap(5);
      heap.push({ lastUsed: 10 });
      expect(heap.getAll()).toEqual([{ lastUsed: 10 }]);
    });

    it("enforces max size limit", () => {
      const heap = new MaxHeap(3);
      heap.push({ lastUsed: 1 });
      heap.push({ lastUsed: 2 });
      heap.push({ lastUsed: 3 });
      heap.push({ lastUsed: 4 });
      heap.push({ lastUsed: 5 });

      expect(heap.getAll().length).toBe(3);
    });
  });

  describe("heap invariant", () => {
    it("maintains heap property when pushing items in ascending order", () => {
      const heap = new MaxHeap(10);
      for (let i = 1; i <= 10; i++) {
        heap.push({ lastUsed: i });
      }
      verifyHeapInvariant(heap);
    });

    it("maintains heap property when pushing items in descending order", () => {
      const heap = new MaxHeap(10);
      for (let i = 100; i > 90; i--) {
        heap.push({ lastUsed: i });
      }
      verifyHeapInvariant(heap);
    });

    it("maintains heap property when pushing items in random order", () => {
      const heap = new MaxHeap(10);
      const randomValues = [45, 12, 89, 23, 67, 34, 78, 56, 90, 11];
      for (const val of randomValues) {
        heap.push({ lastUsed: val });
      }
      verifyHeapInvariant(heap);
    });

    it("maintains heap property when pushing beyond capacity", () => {
      const heap = new MaxHeap(5);
      for (let i = 1; i <= 20; i++) {
        heap.push({ lastUsed: i });
      }
      verifyHeapInvariant(heap);
    });
  });

  describe("eviction behavior", () => {
    it("keeps oldest items when pushing beyond maxSize", () => {
      const heap = new MaxHeap(5);
      for (let i = 1; i <= 10; i++) {
        heap.push({ lastUsed: i });
      }

      const items = heap.getAll();
      const lastUsedValues = items.map((item) => item.lastUsed).sort((a, b) => a - b);

      expect(lastUsedValues).toEqual([1, 2, 3, 4, 5]);
    });

    it("replaces root when new item is older than current max", () => {
      const heap = new MaxHeap(3);
      heap.push({ lastUsed: 10 });
      heap.push({ lastUsed: 20 });
      heap.push({ lastUsed: 30 });

      const beforePush = heap.getAll().map((item) => item.lastUsed).sort((a, b) => a - b);
      expect(beforePush).toEqual([10, 20, 30]);

      heap.push({ lastUsed: 15 });

      const afterPush = heap.getAll().map((item) => item.lastUsed).sort((a, b) => a - b);
      expect(afterPush).toEqual([10, 15, 20]);
      verifyHeapInvariant(heap);
    });

    it("ignores item when newer than all entries in full heap", () => {
      const heap = new MaxHeap(3);
      heap.push({ lastUsed: 10 });
      heap.push({ lastUsed: 20 });
      heap.push({ lastUsed: 30 });

      heap.push({ lastUsed: 100 });

      const items = heap.getAll().map((item) => item.lastUsed).sort((a, b) => a - b);
      expect(items).toEqual([10, 20, 30]);
    });

    it("handles edge case when new item has same lastUsed as current max", () => {
      const heap = new MaxHeap(3);
      heap.push({ lastUsed: 10, id: 1 });
      heap.push({ lastUsed: 20, id: 2 });
      heap.push({ lastUsed: 30, id: 3 });

      heap.push({ lastUsed: 30, id: 4 });

      expect(heap.getAll().length).toBe(3);
      verifyHeapInvariant(heap);
    });
  });

  describe("fuzz test", () => {
    it("maintains correctness with 1000 random items", () => {
      const heapSize = 50;
      const totalItems = 1000;
      const heap = new MaxHeap(heapSize);
      const allItems = [];

      for (let i = 0; i < totalItems; i++) {
        const item = { lastUsed: Math.floor(Math.random() * 10000), id: i };
        allItems.push(item);
        heap.push(item);
      }

      verifyHeapInvariant(heap);

      expect(heap.getAll().length).toBe(heapSize);

      const heapValues = heap.getAll().map((item) => item.lastUsed).sort((a, b) => a - b);
      const expectedOldest = allItems
        .map((item) => item.lastUsed)
        .sort((a, b) => a - b)
        .slice(0, heapSize);

      expect(heapValues).toEqual(expectedOldest);
    });
  });
});

describe("SatisfiesCache", () => {
  describe("get/set operations", () => {
    it("returns undefined for cache miss", () => {
      const cache = new SatisfiesCache(100, 0.2);
      const result = cache.get("hash1", "WORD1");
      expect(result).toBeUndefined();
    });

    it("returns correct result after set", () => {
      const cache = new SatisfiesCache(100, 0.2);
      cache.set("hash1", "WORD1", true);
      const result = cache.get("hash1", "WORD1");
      expect(result).toBe(true);
    });

    it("updates lastUsed on multiple get calls", () => {
      const cache = new SatisfiesCache(100, 0.2);
      cache.set("hash1", "WORD1", true);

      const innerMap1 = cache.cache.get("hash1");
      const entry1 = innerMap1.get("WORD1");
      const lastUsed1 = entry1.lastUsed;

      cache.get("hash1", "WORD1");

      const innerMap2 = cache.cache.get("hash1");
      const entry2 = innerMap2.get("WORD1");
      const lastUsed2 = entry2.lastUsed;

      expect(lastUsed2).toBeGreaterThan(lastUsed1);
    });

    it("caches both true and false boolean values correctly", () => {
      const cache = new SatisfiesCache(100, 0.2);
      cache.set("hash1", "WORD1", true);
      cache.set("hash1", "WORD2", false);

      expect(cache.get("hash1", "WORD1")).toBe(true);
      expect(cache.get("hash1", "WORD2")).toBe(false);
    });
  });

  describe("nested map structure", () => {
    it("creates separate inner maps for different letterStatesHash values", () => {
      const cache = new SatisfiesCache(100, 0.2);
      cache.set("hash1", "WORD1", true);
      cache.set("hash2", "WORD1", false);

      const stats = cache.getStats();
      expect(stats).toEqual(
        expect.objectContaining({
          letterStatesCount: 2,
          totalEntries: 2,
        }),
      );
    });

    it("stores multiple words under same hash in inner map", () => {
      const cache = new SatisfiesCache(100, 0.2);
      cache.set("hash1", "WORD1", true);
      cache.set("hash1", "WORD2", false);
      cache.set("hash1", "WORD3", true);

      const stats = cache.getStats();
      expect(stats).toEqual(
        expect.objectContaining({
          letterStatesCount: 1,
          totalEntries: 3,
        }),
      );
    });

    it("reports correct stats via getStats", () => {
      const cache = new SatisfiesCache(100, 0.2);
      cache.set("hash1", "WORD1", true);
      cache.set("hash1", "WORD2", false);
      cache.set("hash2", "WORD3", true);
      cache.set("hash3", "WORD4", false);

      const stats = cache.getStats();
      expect(stats).toEqual({
        letterStatesCount: 3,
        totalEntries: 4,
        maxEntries: 100,
      });
    });
  });

  describe("eviction logic", () => {
    it("triggers eviction when exceeding maxEntries * (1 + overheadFactor)", () => {
      const cache = new SatisfiesCache(100, 0.2);

      for (let i = 1; i <= 120; i++) {
        cache.set("hash1", `WORD${i}`, true);
      }

      let stats = cache.getStats();
      expect(stats.totalEntries).toBe(120);

      cache.set("hash1", "WORD121", true);

      stats = cache.getStats();
      expect(stats.totalEntries).toBe(101);
    });

    it("evicts correct number of entries based on overheadFactor", () => {
      const cache = new SatisfiesCache(100, 0.2);

      for (let i = 1; i <= 121; i++) {
        cache.set("hash1", `WORD${i}`, true);
      }

      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(101);
    });

    it("evicts oldest entries based on LRU ordering", () => {
      const cache = new SatisfiesCache(100, 0.2);

      for (let i = 1; i <= 120; i++) {
        cache.set("hash1", `WORD${i}`, true);
      }

      cache.get("hash1", "WORD1");
      cache.get("hash1", "WORD2");
      cache.get("hash1", "WORD3");

      cache.set("hash1", "WORD121", true);

      expect(cache.get("hash1", "WORD1")).toBe(true);
      expect(cache.get("hash1", "WORD2")).toBe(true);
      expect(cache.get("hash1", "WORD3")).toBe(true);

      expect(cache.get("hash1", "WORD4")).toBeUndefined();
    });

    it("maintains size bounds after eviction", () => {
      const cache = new SatisfiesCache(50, 0.2);

      for (let i = 1; i <= 100; i++) {
        cache.set("hash1", `WORD${i}`, true);
        const stats = cache.getStats();
        expect(stats.totalEntries).toBeLessThanOrEqual(60);
      }
    });

    it("cleans up empty inner maps after eviction", () => {
      const cache = new SatisfiesCache(100, 0.2);

      for (let i = 1; i <= 10; i++) {
        cache.set("hash1", `WORD${i}`, true);
      }

      for (let i = 1; i <= 111; i++) {
        cache.set("hash2", `WORD${i}`, true);
      }

      const stats = cache.getStats();
      expect(stats).toEqual(
        expect.objectContaining({
          letterStatesCount: 1,
          totalEntries: 101,
        }),
      );

      expect(cache.cache.has("hash1")).toBe(false);
    });

    it("preserves recently accessed entries across multiple evictions", () => {
      const cache = new SatisfiesCache(100, 0.2);

      for (let i = 1; i <= 120; i++) {
        cache.set("hash1", `WORD${i}`, true);
      }

      cache.get("hash1", "WORD5");
      cache.get("hash1", "WORD10");

      cache.set("hash1", "WORD121", true);

      expect(cache.get("hash1", "WORD5")).toBe(true);
      expect(cache.get("hash1", "WORD10")).toBe(true);

      for (let i = 122; i <= 141; i++) {
        cache.set("hash1", `WORD${i}`, true);
      }

      expect(cache.get("hash1", "WORD5")).toBe(true);
      expect(cache.get("hash1", "WORD10")).toBe(true);
    });
  });

  describe("clear operation", () => {
    it("resets all state when calling clear", () => {
      const cache = new SatisfiesCache(100, 0.2);
      cache.set("hash1", "WORD1", true);
      cache.set("hash2", "WORD2", false);
      cache.set("hash1", "WORD3", true);

      cache.clear();

      const stats = cache.getStats();
      expect(stats).toEqual(
        expect.objectContaining({
          letterStatesCount: 0,
          totalEntries: 0,
        }),
      );

      expect(cache.get("hash1", "WORD1")).toBeUndefined();
      expect(cache.get("hash2", "WORD2")).toBeUndefined();
    });
  });

  describe("integration with MaxHeap", () => {
    it("uses MaxHeap for efficient eviction", () => {
      const cache = new SatisfiesCache(50, 0.2);

      for (let i = 1; i <= 100; i++) {
        cache.set("hash1", `WORD${i}`, true);
      }

      const stats = cache.getStats();
      expect(stats.totalEntries).toBeLessThanOrEqual(60);
      expect(stats.totalEntries).toBeGreaterThan(40);
    });

    it("evicts k oldest entries without full sort", () => {
      const cache = new SatisfiesCache(100, 0.2);
      const accessedWords = [];

      for (let i = 1; i <= 120; i++) {
        cache.set("hash1", `WORD${i}`, true);
      }

      for (let i = 100; i <= 120; i++) {
        cache.get("hash1", `WORD${i}`);
        accessedWords.push(`WORD${i}`);
      }

      cache.set("hash1", "WORD121", true);

      for (const word of accessedWords) {
        expect(cache.get("hash1", word)).toBe(true);
      }

      for (let i = 1; i <= 10; i++) {
        expect(cache.get("hash1", `WORD${i}`)).toBeUndefined();
      }
    });
  });
});
