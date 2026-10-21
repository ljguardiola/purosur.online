import { formatDayAndTime, formatPointOfSaleNumber } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { CloudData } from "../platform/use-cloud-query";
import type { OfflinePointOfSale } from "./offline-points-of-sale-api";
import { OfflinePointsOfSaleSection } from "./offline-points-of-sale-section";

function offlinePointOfSale(overrides: Partial<OfflinePointOfSale> = {}): OfflinePointOfSale {
  return {
    pointOfSaleNumber: 6,
    registerId: "register-1",
    registerName: "Caja 1",
    assigned: false,
    retiredAt: null,
    ...overrides,
  };
}

function loaded(items: OfflinePointOfSale[]): CloudData<OfflinePointOfSale[]> {
  return { status: "loaded", value: items, refreshing: false };
}

function sectionFor(
  data: CloudData<OfflinePointOfSale[]>,
  onRetire: (item: OfflinePointOfSale) => void = () => {},
) {
  return (
    <main>
      <OfflinePointsOfSaleSection data={data} onRetire={onRetire} />
    </main>
  );
}

test("lists each point of sale left without a register with its number, the register that used it and its state", async () => {
  const screen = await render(
    sectionFor(
      loaded([
        offlinePointOfSale({ pointOfSaleNumber: 6, registerName: "Caja 1" }),
        offlinePointOfSale({ pointOfSaleNumber: 9, registerName: "Caja 4" }),
      ]),
    ),
  );

  const table = screen.getByRole("table", { name: "Puntos de venta CAEA sin caja" });
  await expect.element(table).toBeVisible();
  await expect.element(table.getByText(formatPointOfSaleNumber(6), { exact: true })).toBeVisible();
  await expect.element(table.getByText("Caja 1", { exact: true })).toBeVisible();
  await expect.element(table.getByText(formatPointOfSaleNumber(9), { exact: true })).toBeVisible();
  await expect.element(table.getByText("Caja 4", { exact: true })).toBeVisible();
  expect(table.getByText("Sin caja", { exact: true }).elements()).toHaveLength(2);
  expect(table.getByRole("button", { name: "Dar de baja" }).elements()).toHaveLength(2);
});

test("labels the columns", async () => {
  const screen = await render(sectionFor(loaded([offlinePointOfSale()])));

  for (const header of ["Punto de venta", "Usado por", "Estado"]) {
    await expect.element(screen.getByRole("columnheader", { name: header })).toBeVisible();
  }
});

test("does not list a point of sale a register has assigned", async () => {
  const screen = await render(
    sectionFor(
      loaded([
        offlinePointOfSale({ pointOfSaleNumber: 6, registerName: "Caja 1" }),
        offlinePointOfSale({ pointOfSaleNumber: 9, registerName: "Caja 4", assigned: true }),
      ]),
    ),
  );

  await expect.element(screen.getByText("Caja 1", { exact: true })).toBeVisible();
  expect(screen.getByText("Caja 4", { exact: true }).query()).toBeNull();
  expect(screen.getByText(formatPointOfSaleNumber(9), { exact: true }).query()).toBeNull();
});

test("shows a retired point of sale with the day it was retired and no action", async () => {
  const retiredAt = "2026-10-01T15:30:00.000Z";
  const screen = await render(
    sectionFor(
      loaded([
        offlinePointOfSale({ retiredAt }),
        offlinePointOfSale({ pointOfSaleNumber: 9, registerName: "Caja 4" }),
      ]),
    ),
  );

  await expect.element(screen.getByText("Dado de baja", { exact: true })).toBeVisible();
  await expect
    .element(screen.getByText(formatDayAndTime(retiredAt), { exact: true }))
    .toBeVisible();
  expect(screen.getByRole("button", { name: "Dar de baja" }).elements()).toHaveLength(1);
});

test("asks to retire the point of sale of the row whose action was pressed", async () => {
  const onRetire = vi.fn();
  const target = offlinePointOfSale({ pointOfSaleNumber: 9, registerName: "Caja 4" });
  const screen = await render(
    sectionFor(
      loaded([offlinePointOfSale({ retiredAt: "2026-10-01T15:30:00.000Z" }), target]),
      onRetire,
    ),
  );

  await userEvent.click(screen.getByRole("button", { name: "Dar de baja" }));

  expect(onRetire).toHaveBeenCalledWith(target);
});

test("shows the empty state when every point of sale has a register", async () => {
  const screen = await render(sectionFor(loaded([offlinePointOfSale({ assigned: true })])));

  await expect
    .element(screen.getByText("Ningún punto de venta CAEA quedó sin caja."))
    .toBeVisible();
});

test("shows a placeholder while the points of sale load", async () => {
  const screen = await render(sectionFor({ status: "loading" }));

  await expect
    .element(screen.getByRole("table", { name: "Puntos de venta CAEA sin caja" }))
    .toHaveAttribute("aria-busy", "true");
});

test("shows a load failure, and Reintentar asks again", async () => {
  const retry = vi.fn();
  const screen = await render(sectionFor({ status: "failed", retry }));
  await expect
    .element(screen.getByText("No pudimos abrir los puntos de venta CAEA sin caja"))
    .toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  expect(retry).toHaveBeenCalledOnce();
});

test("has no accessibility violations with free and retired points of sale", async () => {
  const screen = await render(
    sectionFor(
      loaded([
        offlinePointOfSale(),
        offlinePointOfSale({ pointOfSaleNumber: 9, retiredAt: "2026-10-01T15:30:00.000Z" }),
      ]),
    ),
  );

  await expect.element(screen.getByRole("table")).toBeVisible();
  await expectNoAccessibilityViolations(document.body);
});
