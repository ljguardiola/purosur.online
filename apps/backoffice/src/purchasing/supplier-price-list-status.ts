import type { SupplierPriceListSummary } from "@purosur/contracts";
import { formatNumber, plural, type Tone } from "@purosur/ui";

export type SupplierPriceListStatus = {
  tone: Tone;
  label: string;
  busy: boolean;
  reason?: string;
};

const READ_FAILURE_REASONS = {
  unreadable_document: "No se pudo leer el contenido del archivo.",
  no_items_found: "No se encontró ningún ítem en el archivo.",
  reading_unavailable: "La lectura no estuvo disponible.",
  interrupted: "La lectura se interrumpió.",
} satisfies Record<NonNullable<SupplierPriceListSummary["readFailure"]>, string>;

export function supplierPriceListStatusOf(list: SupplierPriceListSummary): SupplierPriceListStatus {
  switch (list.state) {
    case "EXTRACTED": {
      const count = formatNumber(list.rowCount);
      return {
        tone: "warning",
        label: plural(list.rowCount, {
          one: `${count} ítem para revisar`,
          other: `${count} ítems para revisar`,
        }),
        busy: false,
      };
    }
    case "READING":
      return { tone: "info", label: "Leyendo la lista", busy: true };
    case "READ_FAILED":
      return {
        tone: "error",
        label: "No se pudo leer",
        busy: false,
        ...(list.readFailure === null ? {} : { reason: READ_FAILURE_REASONS[list.readFailure] }),
      };
    case "REVIEWED":
      return list.replaced
        ? { tone: "neutral", label: "Reemplazada", busy: false }
        : { tone: "success", label: "Revisada", busy: false };
    case "DISCARDED":
      return { tone: "neutral", label: "Descartada", busy: false };
  }
}
