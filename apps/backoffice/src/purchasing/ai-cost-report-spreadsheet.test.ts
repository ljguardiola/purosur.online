import { expect, test } from "vitest";
import { cell } from "../platform/spreadsheet/workbook";
import { aiCostReportSpreadsheet } from "./ai-cost-report-spreadsheet";
import {
  AI_COST_BY_DAY,
  AI_COST_BY_PERSON,
  AI_COST_BY_SUPPLIER,
  EMPTY_AI_COST,
  INCOMPLETE_AI_COST_BY_SUPPLIER,
} from "./test-support/ai-cost";

test("has a Resumen sheet with the period, the grouping and the costs and unpriced calls of the cards", () => {
  const [summary] = aiCostReportSpreadsheet(INCOMPLETE_AI_COST_BY_SUPPLIER, "supplier").sheets;

  expect(summary).toEqual({
    name: "Resumen",
    header: ["Dato", "Valor"],
    rows: [
      [cell.text("Desde"), cell.day("2026-10-01")],
      [cell.text("Hasta"), cell.day("2026-10-31")],
      [cell.text("Agrupar por"), cell.text("Proveedor")],
      [cell.text("Costo de lectura"), cell.usd(3_000_000_000)],
      [cell.text("Costo de propuestas"), cell.usd(750_000_000)],
      [cell.text("Costo total"), cell.usd(3_750_000_000)],
      [cell.text("Costo de lectura: llamadas sin precio"), cell.count(0)],
      [cell.text("Costo de propuestas: llamadas sin precio"), cell.count(3)],
      [cell.text("Costo total: llamadas sin precio"), cell.count(3)],
    ],
  });
});

test("has a sheet named after the table with the cost of each group, and the unpriced calls beside them", () => {
  const sheets = aiCostReportSpreadsheet(INCOMPLETE_AI_COST_BY_SUPPLIER, "supplier").sheets;

  expect(sheets[1]).toEqual({
    name: "Costo de IA por período",
    header: [
      "Proveedor",
      "Lectura",
      "Propuestas",
      "Total",
      "Lectura: llamadas sin precio",
      "Propuestas: llamadas sin precio",
      "Total: llamadas sin precio",
    ],
    rows: [
      [
        cell.text("Distribuidora Andina"),
        cell.usd(1_000_000_000),
        cell.usd(500_000_000),
        cell.usd(1_500_000_000),
        cell.count(0),
        cell.count(3),
        cell.count(3),
      ],
      [
        cell.text("Almacén del Sur"),
        cell.usd(2_000_000_000),
        cell.usd(250_000_000),
        cell.usd(2_250_000_000),
        cell.count(0),
        cell.count(0),
        cell.count(0),
      ],
    ],
  });
});

test("names the first column after the grouping and writes a day as a date", () => {
  const byDay = aiCostReportSpreadsheet(AI_COST_BY_DAY, "day").sheets;
  const byPerson = aiCostReportSpreadsheet(AI_COST_BY_PERSON, "person").sheets;

  expect(byDay[0]?.rows[2]).toEqual([cell.text("Agrupar por"), cell.text("Día")]);
  expect(byDay[1]?.header[0]).toBe("Día");
  expect(byDay[1]?.rows[0]?.[0]).toEqual(cell.day("2026-10-03"));
  expect(byPerson[0]?.rows[2]).toEqual([cell.text("Agrupar por"), cell.text("Persona")]);
  expect(byPerson[1]?.header[0]).toBe("Persona");
  expect(byPerson[1]?.rows[0]?.[0]).toEqual(cell.text("Lucía Ferreyra"));
});

test("has no rows in the table sheet when there is no cost", () => {
  const sheets = aiCostReportSpreadsheet(EMPTY_AI_COST, "supplier").sheets;

  expect(sheets[1]?.rows).toEqual([]);
  expect(aiCostReportSpreadsheet(AI_COST_BY_SUPPLIER, "supplier").sheets[1]?.rows).toHaveLength(2);
});
