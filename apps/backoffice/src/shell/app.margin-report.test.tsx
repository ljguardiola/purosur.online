import { beforeEach, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { FRONT_REGISTER_ID } from "./test-support/report-fixtures";
import { reportsServices } from "./test-support/reports-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens(["/", "/help", "/reports/margin"]);

beforeEach(resetPageState);

test("opens the report at its address and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/margin");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Margen por producto y por categoría", level: 1 }))
    .toBeVisible();
  await expect
    .element(
      screen
        .getByRole("table", { name: "Margen por producto y por categoría" })
        .getByText("Fiambres"),
    )
    .toBeVisible();
  expect(services.marginReportScreen.fetchMarginReport).toHaveBeenCalledWith({
    group: "category",
  });
  expect(document.title).toBe("Margen por producto y por categoría · Puro Sur");
});

test("keeps the grouping, the period and the register in the URL and asks the cloud for them", async () => {
  const services = reportsServices(["reports_area"]);
  const search = `?from=2026-10-01&group=product&register=${FRONT_REGISTER_ID}&to=2026-10-31`;
  window.history.pushState(null, "", `/reports/margin${search}`);

  await render(<App help={emptyHelp} services={services} />);

  await expect
    .poll(() => services.marginReportScreen.fetchMarginReport)
    .toHaveBeenCalledWith({
      group: "product",
      from: "2026-10-01",
      to: "2026-10-31",
      register_id: FRONT_REGISTER_ID,
    });
  expect(window.location.search).toBe(search);
});

test("writes a URL with a period the cloud would refuse without it", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/margin?from=2026-10-31&to=2026-10-01");

  await render(<App help={emptyHelp} services={services} />);

  await expect.poll(() => window.location.search).toBe("");
  expect(services.marginReportScreen.fetchMarginReport).toHaveBeenCalledWith({
    group: "category",
  });
  expect(services.marginReportScreen.fetchMarginReport).toHaveBeenCalledTimes(1);
});

test("sends a user without the reports permission to Mi cuenta", async () => {
  const services = reportsServices(["stock_area"]);
  window.history.pushState(null, "", "/reports/margin");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
  expect(services.marginReportScreen.fetchMarginReport).not.toHaveBeenCalled();
});
