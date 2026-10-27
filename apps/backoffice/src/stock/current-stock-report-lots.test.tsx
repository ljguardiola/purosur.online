import { formatSignedCents } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test } from "vitest";
import { render } from "../shell/test-support/render-with-router";
import { CurrentStockReportLots } from "./current-stock-report-lots";
import {
  almondsProduct,
  crackersProduct,
  teaProduct,
} from "./test-support/current-stock-report-fixtures";

test("lists each lot with its number, expiry, balance, unit cost and value", async () => {
  const screen = await render(<CurrentStockReportLots product={almondsProduct} />);

  const table = screen.getByRole("table", { name: "Lotes de Almendras peladas" });
  await expect.element(table.getByText("L-2312")).toBeVisible();
  await expect.element(table.getByText("14/10/2026")).toBeVisible();
  await expect.element(table.getByText("4,300 kg")).toBeVisible();
  await expect.element(table.getByText("$ 10.180,00 / kg")).toBeVisible();
  await expect.element(table.getByText(formatSignedCents(4_377_400))).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("marks a lot that belongs to no purchase as technical", async () => {
  const screen = await render(<CurrentStockReportLots product={crackersProduct} />);

  await expect.element(screen.getByText("Técnico")).toBeVisible();
  await expect.element(screen.getByText("− 4 u")).toBeVisible();
});

test("shows a lot without a known cost as without cost and without value", async () => {
  const screen = await render(<CurrentStockReportLots product={teaProduct} />);

  await expect.element(screen.getByText("Sin costo")).toBeVisible();
  await expect.element(screen.getByText("—").first()).toBeVisible();
});
