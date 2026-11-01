import type { PricesPastReviewDeadlineReportBody } from "@purosur/contracts";
import { formatProductDescription } from "@purosur/ui/formatters";
import { type Cell, cell, type Workbook } from "../platform/spreadsheet/workbook";
import { periodSummaryRows, summarySheet } from "../shell/report-summary-sheet";
import { REVIEW_TIME_ZONE } from "./prices-past-review-deadline-moments";
import { REASON_TEXT } from "./prices-past-review-deadline-reason-text";

type Price = PricesPastReviewDeadlineReportBody["prices"][number];

function currentPriceCells(price: Price): [Cell, Cell] {
  if (price.current_price === null) {
    return [cell.empty(), cell.empty()];
  }
  const amount = cell.money(price.current_price.unit_price_cents);
  return price.product.sale_unit === "KG" ? [cell.empty(), amount] : [amount, cell.empty()];
}

export function pricesPastReviewDeadlineReportSpreadsheet(
  shown: PricesPastReviewDeadlineReportBody,
): Workbook {
  return {
    sheets: [
      summarySheet([
        ...periodSummaryRows(shown.period),
        ["Plazo de revisión (días)", cell.count(shown.window_days)],
        ["Precios", cell.count(shown.summary.price_count)],
      ]),
      {
        name: "Precios sin revisar",
        header: [
          "Producto",
          "Categoría",
          "Precio actual (u)",
          "Precio actual (kg)",
          "Última revisión",
          "Venció el",
          "Motivo",
        ],
        rows: shown.prices.map((price): Cell[] => [
          cell.text(
            formatProductDescription({
              name: price.product.name,
              brandName: price.product.brand_name,
              netContent: price.product.net_content,
            }),
          ),
          cell.text(price.product.category_name),
          ...currentPriceCells(price),
          price.last_reviewed_at === null
            ? cell.empty()
            : cell.instant(price.last_reviewed_at, REVIEW_TIME_ZONE),
          price.past_deadline_on === null ? cell.empty() : cell.day(price.past_deadline_on),
          cell.text(REASON_TEXT[price.reason]),
        ]),
      },
    ],
  };
}
