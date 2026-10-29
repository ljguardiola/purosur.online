import { foldedText } from "../../shared/index.js";
import type { NetContentUnit } from "./product.js";

const UNIT_SPELLINGS: Record<NetContentUnit, readonly string[]> = {
  G: ["g", "gr", "grs", "gramo", "gramos"],
  KG: ["kg", "kilo", "kilos"],
  ML: ["ml", "cc"],
  L: ["l", "lt", "lts", "litro", "litros"],
  UNIT: ["u", "un", "unid", "unidad", "unidades"],
};

type Measure = "mass" | "volume" | "count";

const SCALE = 1000;

const BASE: Record<NetContentUnit, { measure: Measure; factor: number }> = {
  G: { measure: "mass", factor: 1 },
  KG: { measure: "mass", factor: 1000 },
  ML: { measure: "volume", factor: 1 },
  L: { measure: "volume", factor: 1000 },
  UNIT: { measure: "count", factor: 1 },
};

const unitOfSpelling = new Map<string, NetContentUnit>(
  Object.entries(UNIT_SPELLINGS).flatMap(([unit, spellings]) =>
    spellings.map((spelling): [string, NetContentUnit] => [spelling, unit as NetContentUnit]),
  ),
);

const MENTION = /(?<![\p{L}\p{N}.,])(\d+(?:[.,]\d+)?)\s*(\p{L}+)(?![\p{L}\p{N}])/gu;

function baseThousandths(
  quantity: number,
  unit: NetContentUnit,
): { measure: Measure; amount: number } {
  const { measure, factor } = BASE[unit];
  return { measure, amount: Math.round(quantity * SCALE) * factor };
}

export function mentionsNetContent(
  text: string,
  netContent: { quantity: number; unit: NetContentUnit },
): boolean {
  const wanted = baseThousandths(netContent.quantity, netContent.unit);
  return [...foldedText(text).matchAll(MENTION)].some(([, digits, spelling]) => {
    const unit = unitOfSpelling.get(spelling ?? "");
    if (unit === undefined || digits === undefined) {
      return false;
    }
    const mentioned = baseThousandths(Number(digits.replace(",", ".")), unit);
    return mentioned.measure === wanted.measure && mentioned.amount === wanted.amount;
  });
}
