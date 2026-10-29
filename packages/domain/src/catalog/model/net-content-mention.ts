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

export interface NetContentMention {
  measure: Measure;
  thousandths: number;
}

const SCALE = 1000;

const BASE: Record<NetContentUnit, { measure: Measure; factor: number }> = {
  G: { measure: "mass", factor: 1 },
  KG: { measure: "mass", factor: 1000 },
  ML: { measure: "volume", factor: 1 },
  L: { measure: "volume", factor: 1000 },
  UNIT: { measure: "count", factor: 1 },
};

const SPELLING_PATTERNS = Object.entries(UNIT_SPELLINGS).flatMap(([unit, spellings]) =>
  spellings.map((spelling) => ({
    unit: unit as NetContentUnit,
    pattern: new RegExp(
      `(?<![^\\P{L}x]|[\\p{N}./]|\\d,)(?:([1-9]\\d{0,2}(?:\\.\\d{3})+)|(\\d+(?:[.,]\\d+)?))\\s*${spelling}(?![\\p{L}\\p{N}])`,
      "gu",
    ),
  })),
);

function inBase(quantity: number, unit: NetContentUnit): NetContentMention {
  const { measure, factor } = BASE[unit];
  return { measure, thousandths: Math.round(quantity * SCALE) * factor };
}

function quantityOf(grouped: string | undefined, decimal: string | undefined): number {
  return grouped === undefined
    ? Number(decimal?.replace(",", "."))
    : Number(grouped.replaceAll(".", ""));
}

export function netContentMentions(text: string): NetContentMention[] {
  const folded = foldedText(text);
  return SPELLING_PATTERNS.flatMap(({ unit, pattern }) =>
    [...folded.matchAll(pattern)].map(([, grouped, decimal]) =>
      inBase(quantityOf(grouped, decimal), unit),
    ),
  );
}

export function isNetContentMentioned(
  mentions: readonly NetContentMention[],
  netContent: { quantity: number; unit: NetContentUnit },
): boolean {
  const wanted = inBase(netContent.quantity, netContent.unit);
  return mentions.some(
    ({ measure, thousandths }) => measure === wanted.measure && thousandths === wanted.thousandths,
  );
}
