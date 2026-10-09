import { describe, expect, it } from "vitest";
import { printoutOf } from "./escpos-printout";

const ESC = 0x1b;
const GS = 0x1d;

function ascii(text: string): number[] {
  return Array.from(text, (character) => character.charCodeAt(0));
}

describe("a readable printout of ESC/POS bytes", () => {
  it("shows commands as markers and text as lines", () => {
    const printout = printoutOf(
      Uint8Array.from([
        ESC,
        0x40,
        ESC,
        0x74,
        2,
        ...ascii("Hola"),
        0x0a,
        ESC,
        0x45,
        1,
        ...ascii("TOTAL"),
        ESC,
        0x45,
        0,
        0x0a,
        ESC,
        0x64,
        3,
        GS,
        0x56,
        1,
      ]),
    );

    expect(printout.text).toBe(
      [
        "[init]",
        "[codepage PC850]",
        "Hola",
        "[bold]TOTAL[/bold]",
        "[feed 3]",
        "[cut partial]",
      ].join("\n"),
    );
    expect(printout.textLines).toEqual(["Hola", "TOTAL"]);
  });

  it("shows a raster image as its size", () => {
    const printout = printoutOf(
      Uint8Array.from([GS, 0x76, 0x30, 0, 2, 0, 3, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
    );

    expect(printout.text).toBe("[logo 16x3]");
  });

  it("refuses a command it does not know", () => {
    expect(() => printoutOf(Uint8Array.from([ESC, 0x21, 0]))).toThrow();
  });
});
