import path from "node:path";
import { describe, expect, it } from "vitest";
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
    { answer: "HAUTE", guesses: ["THEWS"] },
  ])("returns valid answer and meets performance threshold: $answer after $guesses", ({ answer, guesses }) => {
    const gameState = GameState.simulate(answer, guesses, validAnswers, validGuesses);

    const { move, score, statesConsidered } = getAdversarialAnswer(gameState);

    // Test that the returned answer is valid for the game state
    expect(gameState.satisfiesLetterStates(move)).toBe(true);

    // Test that the computation considers at most 67000 states (buffer for implementation variations)
    expect(statesConsidered).toBeLessThanOrEqual(67000);

    // Additional robustness checks
    expect(typeof move).toBe("string");
    expect(move).toHaveLength(5);
    expect(typeof score).toBe("number");
    expect(statesConsidered).toBeGreaterThan(0);
  });
});
