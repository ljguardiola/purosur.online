import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test } from "vitest";
import { render } from "../shell/test-support/render-with-router";
import { LossesByReasonReportReasonSection } from "./losses-by-reason-report-reason-section";
import {
  almondOilReason,
  expiredReason,
  returnDiscardReason,
  spoiledReason,
} from "./test-support/losses-by-reason-report-fixtures";

function renderSection(losses = spoiledReason, refreshing = false) {
  return render(
    <main>
      <LossesByReasonReportReasonSection losses={losses} refreshing={refreshing} />
    </main>,
  );
}

test("titles the section with its reason's label and loss count", async () => {
  const screen = await renderSection();

  const spoiled = screen.getByRole("region", { name: "Mal estado" });
  await expect.element(spoiled).toBeVisible();
  await expect.element(spoiled.getByText("3 pérdidas", { exact: true })).toBeVisible();
});

test("says one loss in the singular", async () => {
  const screen = await renderSection(expiredReason);

  const expired = screen.getByRole("region", { name: "Vencimiento" });
  await expect.element(expired.getByText("1 pérdida", { exact: true })).toBeVisible();
});

test("lists the products lost, their quantity and their losses", async () => {
  const screen = await renderSection();

  const table = screen.getByRole("table", { name: "Productos perdidos por Mal estado" });
  const cheese = table.getByRole("row").filter({ hasText: "Queso cremoso" });
  await expect.element(cheese.getByText("2,500 kg")).toBeVisible();
  await expect.element(cheese.getByText("2", { exact: true })).toBeVisible();
  const bread = table.getByRole("row").filter({ hasText: "Pan lactal" });
  await expect.element(bread.getByText("3 u")).toBeVisible();
  await expect.element(bread.getByText("1", { exact: true })).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("shows a reason the system assigns like one recorded by hand", async () => {
  const screen = await renderSection(returnDiscardReason);

  const discard = screen.getByRole("region", { name: "Descarte de devolución" });
  await expect.element(discard.getByText("0,400 kg")).toBeVisible();
});

test("marks its table busy while the report reads again", async () => {
  const screen = await renderSection(spoiledReason, true);

  await expect
    .element(screen.getByRole("table", { name: "Productos perdidos por Mal estado" }))
    .toHaveAttribute("aria-busy", "true");
});

test("lists each product lost with its brand and net content", async () => {
  const screen = await renderSection(almondOilReason);

  const table = screen.getByRole("table");
  await expect.element(table.getByText("Aceite de Almendras Vitora 30 ml")).toBeVisible();
});
