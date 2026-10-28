import {
  PRICE_LIST_EXTRACTION_MAX_DESCRIPTION_LENGTH,
  PRICE_LIST_EXTRACTION_MAX_ROWS,
  PRICE_LIST_EXTRACTION_MAX_SHORT_TEXT_LENGTH,
} from "@purosur/domain";
import type {
  ExtractedPriceListRow,
  StoreCatalogReading,
  StoreCatalogs,
} from "@purosur/domain/purchasing/use-cases";

function nonBlankText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function codeOf(id: unknown): string | null {
  return typeof id === "number" && Number.isFinite(id) ? String(id) : nonBlankText(id);
}

function cut(value: string, maxLength: number): string {
  return [...value].slice(0, maxLength).join("");
}

function cutOrNull(value: string | null, maxLength: number): string | null {
  return value === null ? null : cut(value, maxLength);
}

function priceCents(precio: unknown): number | null {
  const amount =
    typeof precio === "number" ? precio : typeof precio === "string" ? parsedAmount(precio) : null;
  return amount !== null && Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

function parsedAmount(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

const PRICE_PER_UNIT = /\s*\([^()]*c\/u\s*\)$/iu;

function packSizeOf(unit: string | null): string | null {
  return unit === null ? null : nonBlankText(unit.replace(PRICE_PER_UNIT, ""));
}

function rowOf(item: unknown): ExtractedPriceListRow | null {
  if (typeof item !== "object" || item === null || Array.isArray(item)) {
    return null;
  }
  const entry: Record<string, unknown> = { ...item };
  const name = nonBlankText(entry["nombre"]);
  if (name === null) {
    return null;
  }
  const brand = nonBlankText(entry["marca"]);
  const unit = nonBlankText(entry["unidad"]);
  return {
    description: cut(
      [name, brand, packSizeOf(unit)].filter((part) => part !== null).join(" "),
      PRICE_LIST_EXTRACTION_MAX_DESCRIPTION_LENGTH,
    ),
    code: cutOrNull(codeOf(entry["id"]), PRICE_LIST_EXTRACTION_MAX_SHORT_TEXT_LENGTH),
    presentation: cutOrNull(unit, PRICE_LIST_EXTRACTION_MAX_SHORT_TEXT_LENGTH),
    priceCents: priceCents(entry["precio"]),
    page: null,
    barcode: null,
  };
}

export class TiendistaStoreCatalogs implements StoreCatalogs {
  async rows(catalog: Uint8Array): Promise<StoreCatalogReading> {
    let entries: unknown;
    try {
      entries = JSON.parse(new TextDecoder().decode(catalog));
    } catch {
      return { kind: "unreadable" };
    }
    if (!Array.isArray(entries)) {
      return { kind: "unreadable" };
    }
    const rows = entries.flatMap((item) => rowOf(item) ?? []);
    if (rows.length > PRICE_LIST_EXTRACTION_MAX_ROWS) {
      return { kind: "unreadable" };
    }
    return { kind: "read", rows };
  }
}
