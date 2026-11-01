import { expect, test } from "vitest";
import { reportFileName } from "./report-file-name";

test("slugs the screen title in Spanish and ends with the answered period", () => {
  expect(
    reportFileName("Ventas por día o por rango", { from: "2026-10-01", to: "2026-10-31" }),
  ).toBe("ventas-por-dia-o-por-rango-2026-10-01-2026-10-31.xlsx");
});

test("drops accents and punctuation but keeps ñ's base letter", () => {
  expect(
    reportFileName("Stock: año / ñandú (¡hoy!)", { from: "2026-10-07", to: "2026-10-07" }),
  ).toBe("stock-ano-nandu-hoy-2026-10-07-2026-10-07.xlsx");
});
