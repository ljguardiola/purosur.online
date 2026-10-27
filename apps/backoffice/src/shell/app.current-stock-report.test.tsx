import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { openSession } from "../sessions/test-support/open-session";
import {
  almondsProduct,
  currentStockReport,
  NUTS_CATEGORY_ID,
} from "../stock/test-support/current-stock-report-fixtures";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens(["/", "/account", "/help", "/reports", "/reports/current-stock"]);

beforeEach(resetPageState);

function reportsServices(capabilities: Capability[]) {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Lucía Ferreyra",
        isAdministrator: false,
        capabilities,
      }),
    ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.currentStockReportScreen.fetchCurrentStockReport).mockResolvedValue({
    kind: "ok",
    value: currentStockReport([almondsProduct]),
  });
  return services;
}

test("opens the current stock report from the list and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(
    screen.getByRole("main").getByRole("link", { name: "Stock actual valorizado" }),
  );

  await expect
    .element(screen.getByRole("heading", { name: "Stock actual valorizado", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/reports/current-stock");
  await expect.element(screen.getByRole("table").getByText("Almendras peladas")).toBeVisible();
  expect(services.currentStockReportScreen.fetchCurrentStockReport).toHaveBeenCalledWith({});
  expect(document.title).toBe("Stock actual valorizado · Puro Sur");
});

test("offers the report in the reports side column", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/current-stock");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(
      screen.getByRole("link", { name: "Stock actual valorizado", includeHidden: false }).first(),
    )
    .toBeVisible();
});

test("keeps the category in the URL and asks the cloud for it", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", `/reports/current-stock?category=${NUTS_CATEGORY_ID}`);

  await render(<App help={emptyHelp} services={services} />);

  await expect
    .poll(() => services.currentStockReportScreen.fetchCurrentStockReport)
    .toHaveBeenCalledWith({ category_id: NUTS_CATEGORY_ID });
  expect(window.location.search).toBe(`?category=${NUTS_CATEGORY_ID}`);
});

test("writes a URL with a category that is not an id without it", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/current-stock?category=frutos-secos");

  await render(<App help={emptyHelp} services={services} />);

  await expect.poll(() => window.location.search).toBe("");
  expect(services.currentStockReportScreen.fetchCurrentStockReport).toHaveBeenCalledWith({});
});

test("sends a user without the reports permission to Mi cuenta", async () => {
  const services = reportsServices(["stock_area"]);
  window.history.pushState(null, "", "/reports/current-stock");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(services.currentStockReportScreen.fetchCurrentStockReport).not.toHaveBeenCalled();
});
