import { describe, expect, it } from "vitest";
import { Bitmap } from "./bitmap-canvas.js";

function blackPixels(bitmap: Bitmap): string[] {
  const black: string[] = [];
  for (let y = 0; y < bitmap.height; y += 1) {
    for (let x = 0; x < bitmap.width; x += 1) {
      if (bitmap.isBlack(x, y)) {
        black.push(`${x},${y}`);
      }
    }
  }
  return black;
}

function square(left: number, top: number, size: number, clockwise: boolean) {
  const corners = [
    { x: left, y: top },
    { x: left + size, y: top },
    { x: left + size, y: top + size },
    { x: left, y: top + size },
  ];
  return clockwise ? corners : corners.reverse();
}

describe("Bitmap", () => {
  it("starts white", () => {
    expect(blackPixels(new Bitmap(8, 2))).toEqual([]);
  });

  it("fills a rectangle of whole dots", () => {
    const bitmap = new Bitmap(8, 4);

    bitmap.fillRect(2, 1, 3, 2);

    expect(blackPixels(bitmap)).toEqual(["2,1", "3,1", "4,1", "2,2", "3,2", "4,2"]);
  });

  it("clips whatever falls outside the bitmap", () => {
    const bitmap = new Bitmap(8, 2);

    bitmap.fillRect(-3, -3, 5, 4);
    bitmap.fillRect(6, 1, 10, 10);

    expect(blackPixels(bitmap)).toEqual(["0,0", "1,0", "6,1", "7,1"]);
  });

  it("packs eight dots to a byte, the leftmost dot in the most significant bit", () => {
    const bitmap = new Bitmap(16, 2);
    bitmap.fillRect(0, 0, 1, 1);
    bitmap.fillRect(7, 0, 1, 1);
    bitmap.fillRect(8, 1, 2, 1);

    expect(Array.from(bitmap.pack())).toEqual([0b10000001, 0, 0, 0b11000000]);
  });

  it("refuses a width that is not a whole number of bytes", () => {
    expect(() => new Bitmap(12, 2)).toThrow(RangeError);
  });

  it("fills a polygon where the dot's center is inside it", () => {
    const bitmap = new Bitmap(8, 8);

    bitmap.fillPolygons([
      [
        { x: 0.6, y: 0.4 },
        { x: 3.4, y: 0.4 },
        { x: 3.4, y: 2.6 },
        { x: 0.6, y: 2.6 },
      ],
    ]);

    expect(blackPixels(bitmap)).toEqual(["1,0", "2,0", "1,1", "2,1", "1,2", "2,2"]);
  });

  it("fills a triangle by its edges", () => {
    const bitmap = new Bitmap(8, 8);

    bitmap.fillPolygons([
      [
        { x: 0, y: 0 },
        { x: 6, y: 0 },
        { x: 0, y: 6 },
      ],
    ]);

    expect(bitmap.isBlack(0, 4)).toBe(true);
    expect(bitmap.isBlack(4, 0)).toBe(true);
    expect(bitmap.isBlack(3, 3)).toBe(false);
    expect(bitmap.isBlack(2, 2)).toBe(true);
  });

  it("leaves a hole where an inner outline runs the opposite way", () => {
    const bitmap = new Bitmap(8, 8);

    bitmap.fillPolygons([square(0, 0, 8, true), square(2, 2, 4, false)]);

    expect(bitmap.isBlack(1, 1)).toBe(true);
    expect(bitmap.isBlack(3, 3)).toBe(false);
  });

  it("fills where outlines of the same direction overlap", () => {
    const bitmap = new Bitmap(8, 8);

    bitmap.fillPolygons([square(0, 0, 8, true), square(2, 2, 4, true)]);

    expect(bitmap.isBlack(3, 3)).toBe(true);
  });

  it("is not black outside the bitmap", () => {
    const bitmap = new Bitmap(8, 2);
    bitmap.fillRect(0, 0, 8, 2);

    expect(bitmap.isBlack(-1, 0)).toBe(false);
    expect(bitmap.isBlack(8, 0)).toBe(false);
    expect(bitmap.isBlack(0, 2)).toBe(false);
  });
});
