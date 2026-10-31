import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { openSession } from "../sessions/test-support/open-session";
import { categoryMarginReport } from "../stock/test-support/margin-report-fixtures";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { FRONT_REGISTER_ID } from "./test-support/report-fixtures";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens(["/", "/account", "/help", "/reports", "/reports/margin"]);

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
  vi.mocked(services.marginReportScreen.fetchMarginReport).mockResolvedValue({
    kind: "ok",
    value: categoryMarginReport,
  });
  return services;
}

test("opens the report from the list and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(
    screen.getByRole("main").getByRole("link", { name: "Margen por producto y por categoría" }),
  );

  await expect
    .element(screen.getByRole("heading", { name: "Margen por producto y por categoría", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/reports/margin");
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

test("offers the report in the reports side column", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/margin");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(
      screen
        .getByRole("link", { name: "Margen por producto y por categoría", includeHidden: false })
        .first(),
    )
    .toBeVisible();
});

test("keeps the grouping, the period and the register in the URL and asks the cloud for them", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(
    null,
    "",
    `/reports/margin?group=product&from=2026-10-01&to=2026-10-31&register=${FRONT_REGISTER_ID}`,
  );

  await render(<App help={emptyHelp} services={services} />);

  await expect
    .poll(() => services.marginReportScreen.fetchMarginReport)
    .toHaveBeenCalledWith({
      group: "product",
      from: "2026-10-01",
      to: "2026-10-31",
      register_id: FRONT_REGISTER_ID,
    });
  expect(window.location.search).toBe(
    `?from=2026-10-01&to=2026-10-31&register=${FRONT_REGISTER_ID}&group=product`,
  );
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

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(services.marginReportScreen.fetchMarginReport).not.toHaveBeenCalled();
});
