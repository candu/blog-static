import { describe, expect, it } from "vitest";
import { LetterState, LetterStateUtils } from "../../public/embeds/adversarial-wordle/lib";

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
      { guess: "AFCDG", expected: false }, // C should not be in position 2
      { guess: "AAFDG", expected: true }, // possible to have multiple A's
    ])("ABCDE:capca returns $expected for $guess", ({ guess, expected }) => {
      const letterStates = [
        [
          { letter: "A", state: LetterState.CORRECT },
          { letter: "B", state: LetterState.ABSENT },
          { letter: "C", state: LetterState.PRESENT },
          { letter: "D", state: LetterState.CORRECT },
          { letter: "E", state: LetterState.ABSENT },
        ],
      ];
      expect(LetterStateUtils.satisfiesLetterStates(letterStates, guess)).toBe(expected);
    });
  });
});
