import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { CloudData } from "../platform/use-cloud-query";
import type { ClockCorrection } from "./clock-corrections-api";
import { ClockCorrectionsSection } from "./clock-corrections-section";

function correction(overrides: Partial<ClockCorrection> = {}): ClockCorrection {
  return {
    id: "correction-1",
    correctedAt: "2026-10-05T12:00:00.000Z",
    registerId: "register-1",
    registerName: "Caja 1",
    pointOfSaleNumber: 4,
    actorFirstName: "Ada",
    previousReading: "2026-10-07T14:31:00.000Z",
    correctedReading: "2026-10-05T12:00:00.000Z",
    alertState: "open",
    ...overrides,
  };
}

function loaded(corrections: ClockCorrection[]): CloudData<ClockCorrection[]> {
  return { status: "loaded", value: corrections, refreshing: false };
}

function sectionFor(data: CloudData<ClockCorrection[]>) {
  return (
    <main>
      <ClockCorrectionsSection data={data} />
    </main>
  );
}

test("lists each correction with when it was made, which register and point of sale, who made it, the readings before and after, and the state of its alert", async () => {
  const screen = await render(sectionFor(loaded([correction()])));

  await expect
    .element(screen.getByRole("heading", { name: "Correcciones de reloj", level: 2 }))
    .toBeVisible();
  await expect.element(screen.getByText("05/10/2026", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("09:00", { exact: true })).toBeVisible();
  await expect
    .element(screen.getByText("Caja 1 · Punto de venta 00004", { exact: true }))
    .toBeVisible();
  await expect.element(screen.getByText("Corrigió Ada", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("07/10/2026 · 11:31", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("05/10/2026 · 09:00", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Abierto", { exact: true })).toBeVisible();
});

test("tells an open alert from a closed one", async () => {
  const screen = await render(
    sectionFor(loaded([correction(), correction({ id: "correction-2", alertState: "closed" })])),
  );

  await expect.element(screen.getByText("Abierto", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Cerrado", { exact: true })).toBeVisible();
});

test("shows the empty state when no clock was ever corrected", async () => {
  const screen = await render(sectionFor(loaded([])));

  await expect.element(screen.getByText("Todavía no se corrigió ningún reloj")).toBeVisible();
});

test("shows a placeholder while the corrections load", async () => {
  const screen = await render(sectionFor({ status: "loading" }));

  await expect
    .element(screen.getByRole("table", { name: "Correcciones de reloj" }))
    .toHaveAttribute("aria-busy", "true");
});

test("shows a load failure, and Reintentar asks again", async () => {
  const retry = vi.fn();
  const screen = await render(sectionFor({ status: "failed", retry }));
  await expect
    .element(screen.getByText("No pudimos abrir las correcciones de reloj"))
    .toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  expect(retry).toHaveBeenCalledOnce();
});

test("has no accessibility violations", async () => {
  const screen = await render(
    sectionFor(loaded([correction(), correction({ id: "correction-2", alertState: "closed" })])),
  );

  await expect.element(screen.getByRole("table")).toBeVisible();
  await expectNoAccessibilityViolations(document.body);
});
