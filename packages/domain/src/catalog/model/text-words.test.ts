import { describe, expect, it } from "vitest";
import { wordsOf } from "./text-words.js";

describe("wordsOf", () => {
  it("answers each run of letters and digits with where it starts", () => {
    expect(wordsOf("Yerba mate, 1kg")).toEqual([
      { start: 0, text: "Yerba" },
      { start: 6, text: "mate" },
      { start: 12, text: "1kg" },
    ]);
  });

  it("keeps a combining mark inside the word it follows", () => {
    expect(wordsOf("café solo")).toEqual([
      { start: 0, text: "café" },
      { start: 6, text: "solo" },
    ]);
  });

  it("answers no word for text without letters or digits", () => {
    expect(wordsOf(" - , ")).toEqual([]);
  });
});
