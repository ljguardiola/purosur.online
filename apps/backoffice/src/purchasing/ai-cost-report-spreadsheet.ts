import type { AiCostByPeriodBody } from "@purosur/contracts";
import { type Cell, cell, type Workbook } from "../platform/spreadsheet/workbook";
import { periodSummaryRows, summarySheet } from "../shell/report-summary-sheet";
import type { AiCostReportFilters } from "./ai-cost-report-filters";

type CostGroup = AiCostByPeriodBody["groups"][number];

const GROUPING_LABELS: Record<AiCostReportFilters["group"], string> = {
  day: "Día",
  supplier: "Proveedor",
  person: "Persona",
};

function groupCell(grouping: AiCostReportFilters["group"], group: CostGroup): Cell {
  return grouping === "day" ? cell.day(group.key) : cell.text(group.name ?? group.key);
}

export function aiCostReportSpreadsheet(
  shown: AiCostByPeriodBody,
  grouping: AiCostReportFilters["group"],
): Workbook {
  const { reading, proposals, total } = shown.total;
  return {
    sheets: [
      summarySheet([
        ...periodSummaryRows(shown.range),
        ["Agrupar por", cell.text(GROUPING_LABELS[grouping])],
        ["Costo de lectura", cell.usd(reading.costNanoUsd)],
        ["Costo de propuestas", cell.usd(proposals.costNanoUsd)],
        ["Costo total", cell.usd(total.costNanoUsd)],
        ["Costo de lectura: llamadas sin precio", cell.count(reading.unpricedCalls)],
        ["Costo de propuestas: llamadas sin precio", cell.count(proposals.unpricedCalls)],
        ["Costo total: llamadas sin precio", cell.count(total.unpricedCalls)],
      ]),
      {
        name: "Costo de IA por período",
        header: [
          GROUPING_LABELS[grouping],
          "Lectura",
          "Propuestas",
          "Total",
          "Lectura: llamadas sin precio",
          "Propuestas: llamadas sin precio",
          "Total: llamadas sin precio",
        ],
        rows: shown.groups.map((group) => [
          groupCell(grouping, group),
          cell.usd(group.reading.costNanoUsd),
          cell.usd(group.proposals.costNanoUsd),
          cell.usd(group.total.costNanoUsd),
          cell.count(group.reading.unpricedCalls),
          cell.count(group.proposals.unpricedCalls),
          cell.count(group.total.unpricedCalls),
        ]),
      },
    ],
  };
}
