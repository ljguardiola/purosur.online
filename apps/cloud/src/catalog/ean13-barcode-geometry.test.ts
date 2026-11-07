import { describe, expect, it } from "vitest";
import {
  BAR_HEIGHT_MM,
  CENTER_GUARD_END_MODULE,
  CENTER_GUARD_START_MODULE,
  END_GUARD_START_MODULE,
  ean13BarcodeGeometry,
  ean13NarrowBarcodeGeometry,
  GUARD_BAR_EXTRA_MM,
  HUMAN_READABLE_HEIGHT_MM,
  MODULE_WIDTH_MM,
  QUIET_ZONE_LEFT_MODULES,
  START_GUARD_END_MODULE,
} from "./ean13-barcode-geometry.js";

const MM_DIMENSIONS = {
  moduleWidth: MODULE_WIDTH_MM,
  barHeight: BAR_HEIGHT_MM,
  guardExtra: GUARD_BAR_EXTRA_MM,
  digitsHeight: HUMAN_READABLE_HEIGHT_MM,
};

const QUIET_ZONE_LEFT_MM = QUIET_ZONE_LEFT_MODULES * MODULE_WIDTH_MM;

describe("ean13BarcodeGeometry", () => {
  const geometry = ean13BarcodeGeometry("2000000000015", MM_DIMENSIONS);

  it("sizes the barcode from its quiet zones, module width, bar height and digit height", () => {
    expect(geometry.totalWidth).toBeCloseTo(37.29, 4);
    expect(geometry.totalHeight).toBeCloseTo(17.1, 4);
  });

  it("draws one bar per '1' module, each one module wide", () => {
    expect(geometry.bars).toHaveLength(51);
    for (const bar of geometry.bars) {
      expect(bar.width).toBeCloseTo(0.33, 4);
    }
  });

  it("extends the start, center and end guard bars 2mm past the ordinary bar height", () => {
    const [firstBar] = geometry.bars;
    const lastBar = geometry.bars[geometry.bars.length - 1];

    expect(firstBar).toMatchObject({ x: expect.closeTo(3.63, 4), height: 14 });
    expect(lastBar).toMatchObject({ x: expect.closeTo(34.65, 4), height: 14 });
  });

  it("draws an ordinary (non-guard) bar at the plain 12mm bar height", () => {
    const ordinaryBar = geometry.bars.find((bar) => bar.height === 12);

    expect(ordinaryBar).toMatchObject({ x: expect.closeTo(5.61, 4), height: 12 });
  });

  it("places the first digit right-aligned in the left quiet zone", () => {
    expect(geometry.firstDigitText).toMatchObject({
      value: "2",
      align: "right",
      x: expect.closeTo(3.135, 4),
    });
  });

  it("centers each 6-digit human-readable group under its half of the bars", () => {
    expect(geometry.leftGroupText).toMatchObject({
      value: "000000",
      align: "center",
      x: expect.closeTo(11.55, 4),
    });
    expect(geometry.rightGroupText).toMatchObject({
      value: "000015",
      align: "center",
      x: expect.closeTo(27.06, 4),
    });
  });

  it("sizes the human-readable digits at 3.1mm, the proof's own digit height", () => {
    expect(geometry.digitsHeight).toBe(3.1);
  });

  it("keeps the first digit clear of the start guard bar", () => {
    const [firstBar] = geometry.bars;

    expect(firstBar).toBeDefined();
    expect(geometry.firstDigitText.x).toBeLessThan(firstBar?.x ?? 0);
  });

  it("keeps each 6-digit group's center within its own half, clear of the guard bars", () => {
    const leftHalfStartMm = QUIET_ZONE_LEFT_MM + START_GUARD_END_MODULE * MODULE_WIDTH_MM;
    const centerGuardStartMm = QUIET_ZONE_LEFT_MM + CENTER_GUARD_START_MODULE * MODULE_WIDTH_MM;
    expect(geometry.leftGroupText.x).toBeGreaterThan(leftHalfStartMm);
    expect(geometry.leftGroupText.x).toBeLessThan(centerGuardStartMm);

    const rightHalfStartMm = QUIET_ZONE_LEFT_MM + CENTER_GUARD_END_MODULE * MODULE_WIDTH_MM;
    const endGuardStartMm = QUIET_ZONE_LEFT_MM + END_GUARD_START_MODULE * MODULE_WIDTH_MM;
    expect(geometry.rightGroupText.x).toBeGreaterThan(rightHalfStartMm);
    expect(geometry.rightGroupText.x).toBeLessThan(endGuardStartMm);
  });
});

describe("ean13BarcodeGeometry in another unit", () => {
  const DOTS = { moduleWidth: 3, barHeight: 96, guardExtra: 16, digitsHeight: 25 };
  const geometry = ean13BarcodeGeometry("2000000000015", DOTS);

  it("returns every measure in the unit the caller's dimensions are in", () => {
    expect(geometry.totalWidth).toBe(113 * 3);
    expect(geometry.totalHeight).toBe(96 + 16 + 25);
    expect(geometry.digitsHeight).toBe(25);
  });

  it("keeps every bar on a whole multiple of the module width", () => {
    for (const bar of geometry.bars) {
      expect(bar.width).toBe(3);
      expect(bar.x % 3).toBe(0);
    }
    expect(geometry.bars[0]).toMatchObject({ x: 33, height: 112 });
  });

  it("starts the digits right under the tallest bars", () => {
    expect(geometry.digitsTop).toBe(112);
  });

  it("places the digit groups at the same modules as in any other unit", () => {
    expect(geometry.firstDigitText.x).toBe(28.5);
    expect(geometry.leftGroupText.x).toBe(105);
    expect(geometry.rightGroupText.x).toBe(246);
  });
});

describe("ean13NarrowBarcodeGeometry", () => {
  const geometry = ean13NarrowBarcodeGeometry("2000000000015", {
    moduleWidth: 2,
    barHeight: 60,
    guardExtra: 11,
    digitsHeight: 17,
  });

  it("is as wide as the 95 modules of the bars, with no quiet zone", () => {
    expect(geometry.totalWidth).toBe(190);
    expect(geometry.bars[0]?.x).toBe(0);
    expect(geometry.totalHeight).toBe(88);
  });

  it("writes every digit as one line centered under the bars", () => {
    expect(geometry.digitsText).toEqual({ value: "2 000000 000015", x: 95, align: "center" });
  });
});
