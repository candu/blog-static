import { describe, expect, it } from "vitest";
import { LetterState, LetterStateUtils } from "../../public/embeds/adversarial-wordle/lib";

describe("LetterStateUtils", () => {
  describe("getLetterStates", () => {
    it("returns all correct for exact match", () => {
      const word = "STARE";
      const letterStates = LetterStateUtils.getLetterStates(word, word);
      expect(letterStates).toEqual(
        Array.from(word).map((letter) => ({ letter, state: LetterState.CORRECT })),
      );
    });
  });
});
