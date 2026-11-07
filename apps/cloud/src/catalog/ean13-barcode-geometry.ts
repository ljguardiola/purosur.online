import { ean13Modules } from "@purosur/domain";

export const MODULE_WIDTH_MM = 0.33;
export const BAR_HEIGHT_MM = 12;
export const GUARD_BAR_EXTRA_MM = 2;
export const QUIET_ZONE_LEFT_MODULES = 11;
const QUIET_ZONE_RIGHT_MODULES = 7;
export const HUMAN_READABLE_HEIGHT_MM = 3.1;

export const DIGITS_PER_GROUP = 6;
export const MODULES_PER_DIGIT = 7;
export const START_GUARD_END_MODULE = 3;
export const CENTER_GUARD_START_MODULE = 45;
export const CENTER_GUARD_END_MODULE = 50;
export const END_GUARD_START_MODULE = 92;
const END_GUARD_END_MODULE = 95;

function moduleRange(start: number, end: number): number[] {
  return Array.from({ length: end - start }, (_, offset) => start + offset);
}

// EAN-13's start (101), center (01010) and end (101) guard bar module indices.
const GUARD_MODULE_INDEXES = new Set([
  ...moduleRange(0, START_GUARD_END_MODULE),
  ...moduleRange(CENTER_GUARD_START_MODULE, CENTER_GUARD_END_MODULE),
  ...moduleRange(END_GUARD_START_MODULE, END_GUARD_END_MODULE),
]);
const HALF_GROUP_WIDTH_MODULES = (DIGITS_PER_GROUP * MODULES_PER_DIGIT) / 2;

export interface Ean13BarcodeDimensions {
  moduleWidth: number;
  barHeight: number;
  guardExtra: number;
  digitsHeight: number;
}

interface BarcodeBar {
  x: number;
  width: number;
  height: number;
}

interface BarcodeText {
  value: string;
  x: number;
  align: "left" | "center" | "right";
}

export interface Ean13BarcodeGeometry {
  totalWidth: number;
  totalHeight: number;
  digitsHeight: number;
  digitsTop: number;
  bars: BarcodeBar[];
  firstDigitText: BarcodeText;
  leftGroupText: BarcodeText;
  rightGroupText: BarcodeText;
}

export function ean13BarcodeGeometry(
  code: string,
  dimensions: Ean13BarcodeDimensions,
): Ean13BarcodeGeometry {
  const { moduleWidth, barHeight, guardExtra, digitsHeight } = dimensions;
  const modules = ean13Modules(code);
  const bars: BarcodeBar[] = [];
  for (let index = 0; index < modules.length; index += 1) {
    if (modules[index] !== "1") {
      continue;
    }
    const isGuard = GUARD_MODULE_INDEXES.has(index);
    bars.push({
      x: (QUIET_ZONE_LEFT_MODULES + index) * moduleWidth,
      width: moduleWidth,
      height: isGuard ? barHeight + guardExtra : barHeight,
    });
  }

  const leftGroupCenterModule =
    QUIET_ZONE_LEFT_MODULES + START_GUARD_END_MODULE + HALF_GROUP_WIDTH_MODULES;
  const rightGroupCenterModule =
    QUIET_ZONE_LEFT_MODULES + CENTER_GUARD_END_MODULE + HALF_GROUP_WIDTH_MODULES;
  const digitsTop = barHeight + guardExtra;

  return {
    totalWidth: (QUIET_ZONE_LEFT_MODULES + modules.length + QUIET_ZONE_RIGHT_MODULES) * moduleWidth,
    totalHeight: digitsTop + digitsHeight,
    digitsHeight,
    digitsTop,
    bars,
    firstDigitText: {
      value: code[0] ?? "",
      x: (QUIET_ZONE_LEFT_MODULES - 1.5) * moduleWidth,
      align: "right",
    },
    leftGroupText: {
      value: code.slice(1, 7),
      x: leftGroupCenterModule * moduleWidth,
      align: "center",
    },
    rightGroupText: {
      value: code.slice(7),
      x: rightGroupCenterModule * moduleWidth,
      align: "center",
    },
  };
}
