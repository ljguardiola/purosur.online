import type { ManualDiscountsBody } from "@purosur/contracts";
import { formatOperationNumber } from "@purosur/ui";
import { cell, type Workbook } from "../platform/spreadsheet/workbook";
import { periodSummaryRows, summarySheet } from "../shell/report-summary-sheet";
import { manualDiscountKindText } from "./manual-discount-kind-text";
import { MOMENT_TIME_ZONE } from "./manual-discount-moment";

const UNIDENTIFIED = "Sin identificar";
const CHOSEN_AUTHORIZER = "El elegido";

function authorizerName(name: string | null): string {
  return name ?? UNIDENTIFIED;
}

function authorizerFilterText(shown: ManualDiscountsBody, authorizedBy: string): string {
  if (authorizedBy === "ALL") {
    return "Todos";
  }
  const listed = shown.authorizers.find(({ id }) => id === authorizedBy);
  return listed === undefined ? CHOSEN_AUTHORIZER : authorizerName(listed.name);
}

export function manualDiscountsSpreadsheet(
  shown: ManualDiscountsBody,
  authorizedBy: string,
  registerLabel: string,
): Workbook {
  const mostAuthorized = shown.totals.most_authorized;
  return {
    sheets: [
      summarySheet([
        ...periodSummaryRows(shown.range),
        ["Caja", cell.text(registerLabel)],
        ["Autorizante", cell.text(authorizerFilterText(shown, authorizedBy))],
        ["Descontado", cell.money(shown.totals.discounted)],
        ["Descuentos", cell.count(shown.totals.count)],
        ["De línea", cell.count(shown.totals.line_count)],
        ["Sobre el total", cell.count(shown.totals.sale_count)],
        ...(authorizedBy === "ALL"
          ? ([
              [
                "Más autorizó",
                mostAuthorized === null
                  ? cell.empty()
                  : cell.text(authorizerName(mostAuthorized.name)),
              ],
            ] as const)
          : []),
      ]),
      {
        name: "Descuentos manuales",
        header: ["Fecha", "Venta", "Producto", "Tipo", "Motivo", "Autorizó", "Descontado"],
        rows: shown.rows.map((row) => [
          cell.instant(row.completed_at, MOMENT_TIME_ZONE),
          row.operation_number === null
            ? cell.empty()
            : cell.text(`Operación ${formatOperationNumber(row.operation_number)}`),
          row.product_name === null ? cell.empty() : cell.text(row.product_name),
          cell.text(manualDiscountKindText(row)),
          cell.text(row.reason),
          cell.text(authorizerName(row.authorizer.name)),
          cell.money(row.discounted),
        ]),
      },
    ],
  };
}
