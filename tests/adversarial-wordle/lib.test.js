import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  GameState,
  getAdversarialAnswer,
  LetterState,
  LetterStateUtils,
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
      const letterStates = [
        { letter: "A", state: LetterState.CORRECT },
        null,
        null,
        null,
        null,
      ];

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
      const letterStates = [
        { letter: "A", state: LetterState.CORRECT },
        null,
        null,
        null,
        null,
      ];

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
    // { answer: "TAKER", guesses: ["CRATE"], maxStatesConsidered: 370000 },
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
