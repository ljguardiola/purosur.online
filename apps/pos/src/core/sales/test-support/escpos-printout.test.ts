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

  it("marks the text printed in the small font and tells its rows apart", () => {
    const printout = printoutOf(
      Uint8Array.from([
        ESC,
        0x4d,
        1,
        ...ascii("chica"),
        ESC,
        0x4d,
        0,
        0x0a,
        ...ascii("normal"),
        0x0a,
      ]),
    );

    expect(printout.text).toBe(["[small]chica[/small]", "normal"].join("\n"));
    expect(printout.rows).toEqual([
      { text: "chica", small: true },
      { text: "normal", small: false },
    ]);
  });

  it("shows a raster image as its size", () => {
    const printout = printoutOf(Uint8Array.from([GS, 0x76, 0x30, 0, 2, 0, 3, 0, 1, 2, 3, 4, 5, 6]));

    expect(printout.text).toBe("[logo 16x3]");
  });

  it("shows the alignment the printer is set to", () => {
    const printout = printoutOf(
      Uint8Array.from([ESC, 0x61, 1, ...ascii("Hola"), 0x0a, ESC, 0x61, 0, ESC, 0x61, 2]),
    );

    expect(printout.text).toBe(
      ["[align center]", "Hola", "[align left]", "[align right]"].join("\n"),
    );
    expect(printout.textLines).toEqual(["Hola"]);
  });

  it("shows a QR code's settings, the text it stores and its printing", () => {
    const text = ascii("https://example.test/?p=abc");
    const storedLength = text.length + 3;
    const printout = printoutOf(
      Uint8Array.from([
        ...[GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0],
        ...[GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, 6],
        ...[GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x31],
        ...[GS, 0x28, 0x6b, storedLength & 0xff, storedLength >> 8, 0x31, 0x50, 0x30, ...text],
        ...[GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30],
      ]),
    );

    expect(printout.text).toBe(
      [
        "[qr model 2]",
        "[qr module 6]",
        "[qr correction M]",
        "[qr store https://example.test/?p=abc]",
        "[qr print]",
      ].join("\n"),
    );
  });

  it("refuses a command it does not know", () => {
    expect(() => printoutOf(Uint8Array.from([ESC, 0x21, 0]))).toThrow();
  });
});
