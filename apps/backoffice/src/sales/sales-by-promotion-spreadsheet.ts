import type { SalesByPromotionBody } from "@purosur/contracts";
import { cell, type Workbook } from "../platform/spreadsheet/workbook";
import { periodSummaryRows, summarySheet } from "../shell/report-summary-sheet";
import { promotionTermsText } from "./promotion-terms-text";

type PromotionRow = SalesByPromotionBody["rows"][number];

const UNKNOWN_PROMOTION = "Promoción desconocida";

export function salesByPromotionSpreadsheet(
  shown: SalesByPromotionBody,
  rows: readonly PromotionRow[],
  registerLabel: string,
): Workbook {
  const mostUsed = shown.totals.most_used;
  return {
    sheets: [
      summarySheet([
        ...periodSummaryRows(shown.range),
        ["Caja", cell.text(registerLabel)],
        ["Descontado", cell.money(shown.totals.discounted)],
        ["Líneas con promoción", cell.count(shown.totals.lines)],
        [
          "Más usada",
          mostUsed === null ? cell.empty() : cell.text(mostUsed.name ?? UNKNOWN_PROMOTION),
        ],
      ]),
      {
        name: "Descuentos por promoción",
        header: [
          "Promoción",
          "Condiciones",
          "Líneas",
          "Cantidad (u)",
          "Cantidad (kg)",
          "Descontado",
        ],
        rows: rows.map((row) => {
          const terms = promotionTermsText(row.terms);
          return [
            cell.text(row.name ?? UNKNOWN_PROMOTION),
            terms === null ? cell.empty() : cell.text(terms),
            cell.count(row.lines),
            cell.count(row.units),
            cell.weight(row.thousandths),
            cell.money(row.discounted),
          ];
        }),
      },
    ],
  };
}
