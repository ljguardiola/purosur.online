import { ean13Modules } from "@purosur/contracts";

export const MODULE_WIDTH_MM = 0.33;
export const BAR_HEIGHT_MM = 12;
export const GUARD_BAR_EXTRA_MM = 2;
export const QUIET_ZONE_LEFT_MODULES = 11;
export const QUIET_ZONE_RIGHT_MODULES = 7;
export const HUMAN_READABLE_HEIGHT_MM = 3.1;

// EAN-13's start (101), center (01010) and end (101) guard bar module indices.
const GUARD_MODULE_INDEXES = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94]);

const DIGITS_PER_GROUP = 6;
const MODULES_PER_DIGIT = 7;
const HALF_GROUP_WIDTH_MODULES = (DIGITS_PER_GROUP * MODULES_PER_DIGIT) / 2;

export interface BarcodeBar {
  xMm: number;
  widthMm: number;
  heightMm: number;
}

export interface BarcodeText {
  value: string;
  xMm: number;
  align: "left" | "center" | "right";
}

export interface Ean13BarcodeGeometry {
  totalWidthMm: number;
  totalHeightMm: number;
  fontSizeMm: number;
  bars: BarcodeBar[];
  firstDigitText: BarcodeText;
  leftGroupText: BarcodeText;
  rightGroupText: BarcodeText;
}

export function ean13BarcodeGeometry(code: string): Ean13BarcodeGeometry {
  const modules = ean13Modules(code);
  const bars: BarcodeBar[] = [];
  for (let index = 0; index < modules.length; index += 1) {
    if (modules[index] !== "1") {
      continue;
    }
    const isGuard = GUARD_MODULE_INDEXES.has(index);
    bars.push({
      xMm: (QUIET_ZONE_LEFT_MODULES + index) * MODULE_WIDTH_MM,
      widthMm: MODULE_WIDTH_MM,
      heightMm: isGuard ? BAR_HEIGHT_MM + GUARD_BAR_EXTRA_MM : BAR_HEIGHT_MM,
    });
  }

  const leftGroupCenterModule = QUIET_ZONE_LEFT_MODULES + 3 + HALF_GROUP_WIDTH_MODULES;
  const rightGroupCenterModule = QUIET_ZONE_LEFT_MODULES + 50 + HALF_GROUP_WIDTH_MODULES;

  return {
    totalWidthMm:
      (QUIET_ZONE_LEFT_MODULES + modules.length + QUIET_ZONE_RIGHT_MODULES) * MODULE_WIDTH_MM,
    totalHeightMm: BAR_HEIGHT_MM + GUARD_BAR_EXTRA_MM + HUMAN_READABLE_HEIGHT_MM,
    fontSizeMm: HUMAN_READABLE_HEIGHT_MM,
    bars,
    firstDigitText: {
      value: code[0] ?? "",
      xMm: (QUIET_ZONE_LEFT_MODULES - 1.5) * MODULE_WIDTH_MM,
      align: "right",
    },
    leftGroupText: {
      value: code.slice(1, 7),
      xMm: leftGroupCenterModule * MODULE_WIDTH_MM,
      align: "center",
    },
    rightGroupText: {
      value: code.slice(7),
      xMm: rightGroupCenterModule * MODULE_WIDTH_MM,
      align: "center",
    },
  };
}
