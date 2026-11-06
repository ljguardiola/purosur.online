import { describe, expect, it } from "vitest";
import { Bitmap } from "./bitmap-canvas.js";
import { drawText, fontMetrics, measureText, wrapText } from "./bitmap-text.js";

const SIZE = 30;

describe("measureText", () => {
  it("measures a text in the dots it takes at that size", () => {
    const small = measureText("Almendras", 20);
    const large = measureText("Almendras", 40);

    expect(small).toBeGreaterThan(0);
    expect(large).toBeCloseTo(small * 2, 0);
  });

  it("measures the digits of a barcode alike", () => {
    expect(measureText("0", SIZE)).toBe(measureText("8", SIZE));
  });
});

describe("fontMetrics", () => {
  it("gives the room a line takes above and below its baseline", () => {
    const { ascent, descent } = fontMetrics(100);

    expect(ascent).toBeGreaterThan(80);
    expect(descent).toBeGreaterThan(10);
    expect(ascent + descent).toBeLessThan(130);
  });
});

describe("drawText", () => {
  it("draws the letter above its baseline, with the counter between its stems left white", () => {
    const bitmap = new Bitmap(80, 80);

    drawText(bitmap, "H", { x: 10, baseline: 60, fontSize: 40 });

    expect(bitmap.isBlack(10 + 5, 60 - 5)).toBe(true);
    expect(bitmap.isBlack(10 + 14, 60 - 15)).toBe(true);
    expect(bitmap.isBlack(10 + 14, 60 - 5)).toBe(false);
    for (let x = 0; x < 80; x += 1) {
      expect(bitmap.isBlack(x, 60)).toBe(false);
    }
    expect(bitmap.isBlack(10 + 5, 60 - 1)).toBe(true);
  });

  it("leaves a hole inside a closed letter", () => {
    const bitmap = new Bitmap(80, 80);

    drawText(bitmap, "O", { x: 10, baseline: 60, fontSize: 60 });

    expect(bitmap.isBlack(10 + 22, 60 - 22)).toBe(false);
    expect(bitmap.isBlack(10 + 22, 60 - 41)).toBe(true);
  });

  it("starts the text at x", () => {
    const bitmap = new Bitmap(120, 60);

    drawText(bitmap, "Hola", { x: 40, baseline: 40, fontSize: 30 });

    let leftmost = Number.POSITIVE_INFINITY;
    let rightmost = -1;
    for (let y = 0; y < 60; y += 1) {
      for (let x = 0; x < 120; x += 1) {
        if (bitmap.isBlack(x, y)) {
          leftmost = Math.min(leftmost, x);
          rightmost = Math.max(rightmost, x);
        }
      }
    }
    expect(leftmost).toBeGreaterThanOrEqual(40);
    expect(leftmost).toBeLessThan(45);
    expect(rightmost).toBeLessThanOrEqual(40 + measureText("Hola", 30));
  });
});

describe("wrapText", () => {
  it("keeps a text that fits on one line", () => {
    expect(wrapText("Almendras peladas", 1000, 2, SIZE)).toEqual(["Almendras peladas"]);
  });

  it("returns no line for an empty text", () => {
    expect(wrapText("   ", 1000, 2, SIZE)).toEqual([]);
  });

  it("breaks between words when the text does not fit", () => {
    const width = measureText("Almendras peladas", SIZE) - 1;

    expect(wrapText("Almendras peladas", width, 2, SIZE)).toEqual(["Almendras", "peladas"]);
  });

  it("collapses the spaces between words", () => {
    expect(wrapText("Almendras   peladas", 1000, 2, SIZE)).toEqual(["Almendras peladas"]);
  });

  it("ends the last line with an ellipsis when the text needs more lines", () => {
    const width = 200;
    const lines = wrapText(
      "Almendras peladas naturales sin sal de la sierra premium",
      width,
      2,
      SIZE,
    );

    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("Almendras");
    expect(lines[1]?.endsWith("…")).toBe(true);
    for (const line of lines) {
      expect(measureText(line, SIZE)).toBeLessThanOrEqual(width);
    }
  });

  it("does not ellipsize a last line that fits whole", () => {
    const width = measureText("Almendras peladas", SIZE) - 1;

    expect(wrapText("Almendras peladas", width, 2, SIZE)).not.toContain("…");
  });

  it("breaks a word wider than a line", () => {
    const width = 100;
    const lines = wrapText("Supercalifragilisticoespialidoso", width, 2, SIZE);

    expect(lines).toHaveLength(2);
    expect(lines[0]?.length).toBeGreaterThan(2);
    expect(lines.join("").startsWith(lines[0] ?? "?")).toBe(true);
    for (const line of lines) {
      expect(measureText(line, SIZE)).toBeLessThanOrEqual(width);
    }
  });

  it("never returns more lines than allowed", () => {
    expect(wrapText("a b c d e f g h i j k l", 30, 3, SIZE).length).toBeLessThanOrEqual(3);
  });
});
