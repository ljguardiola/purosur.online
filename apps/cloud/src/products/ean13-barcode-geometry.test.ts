import { describe, expect, it } from "vitest";
import { ean13BarcodeGeometry } from "./ean13-barcode-geometry.js";

describe("ean13BarcodeGeometry", () => {
  const geometry = ean13BarcodeGeometry("2000000000015");

  it("sizes the barcode from its quiet zones, module width, bar height and digit height", () => {
    expect(geometry.totalWidthMm).toBeCloseTo(37.29, 4);
    expect(geometry.totalHeightMm).toBeCloseTo(17.1, 4);
  });

  it("draws one bar per '1' module, each one module wide", () => {
    expect(geometry.bars).toHaveLength(51);
    for (const bar of geometry.bars) {
      expect(bar.widthMm).toBeCloseTo(0.33, 4);
    }
  });

  it("extends the start, center and end guard bars 2mm past the ordinary bar height", () => {
    const [firstBar] = geometry.bars;
    const lastBar = geometry.bars[geometry.bars.length - 1];

    expect(firstBar).toMatchObject({ xMm: expect.closeTo(3.63, 4), heightMm: 14 });
    expect(lastBar).toMatchObject({ xMm: expect.closeTo(34.65, 4), heightMm: 14 });
  });

  it("draws an ordinary (non-guard) bar at the plain 12mm bar height", () => {
    const ordinaryBar = geometry.bars.find((bar) => bar.heightMm === 12);

    expect(ordinaryBar).toMatchObject({ xMm: expect.closeTo(5.61, 4), heightMm: 12 });
  });

  it("places the first digit right-aligned in the left quiet zone", () => {
    expect(geometry.firstDigitText).toMatchObject({
      value: "2",
      align: "right",
      xMm: expect.closeTo(3.135, 4),
    });
  });

  it("centers each 6-digit human-readable group under its half of the bars", () => {
    expect(geometry.leftGroupText).toMatchObject({
      value: "000000",
      align: "center",
      xMm: expect.closeTo(11.55, 4),
    });
    expect(geometry.rightGroupText).toMatchObject({
      value: "000015",
      align: "center",
      xMm: expect.closeTo(27.06, 4),
    });
  });

  it("sizes the human-readable digits at 3.1mm, the proof's own digit height", () => {
    expect(geometry.fontSizeMm).toBe(3.1);
  });

  it("keeps the first digit clear of the start guard bar", () => {
    const [firstBar] = geometry.bars;

    expect(firstBar).toBeDefined();
    expect(geometry.firstDigitText.xMm).toBeLessThan(firstBar?.xMm ?? 0);
  });

  it("keeps each 6-digit group's center within its own half, clear of the guard bars", () => {
    // Start guard ends and the left half begins at module 3; the center guard begins at module 45.
    const leftHalfStartMm = 3.63 + 3 * 0.33;
    const centerGuardStartMm = 3.63 + 45 * 0.33;
    expect(geometry.leftGroupText.xMm).toBeGreaterThan(leftHalfStartMm);
    expect(geometry.leftGroupText.xMm).toBeLessThan(centerGuardStartMm);

    // The center guard ends and the right half begins at module 50; the end guard begins at 92.
    const rightHalfStartMm = 3.63 + 50 * 0.33;
    const endGuardStartMm = 3.63 + 92 * 0.33;
    expect(geometry.rightGroupText.xMm).toBeGreaterThan(rightHalfStartMm);
    expect(geometry.rightGroupText.xMm).toBeLessThan(endGuardStartMm);
  });
});
