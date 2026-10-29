import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { pricesPastReviewDeadlineReport } from "../pricing/test-support/prices-past-review-deadline-report-fixtures";
import { openSession } from "../sessions/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens(["/", "/account", "/help", "/reports", "/reports/prices-past-review-deadline"]);

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
  vi.mocked(
    services.pricesPastReviewDeadlineReportScreen.fetchPricesPastReviewDeadlineReport,
  ).mockResolvedValue({
    kind: "ok",
    value: pricesPastReviewDeadlineReport(),
  });
  return services;
}

test("opens the report from the list and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(
    screen.getByRole("main").getByRole("link", { name: "Precios sin revisar" }),
  );

  await expect
    .element(screen.getByRole("heading", { name: "Precios sin revisar", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/reports/prices-past-review-deadline");
  await expect.element(screen.getByRole("table").getByText("Queso cremoso")).toBeVisible();
  expect(
    services.pricesPastReviewDeadlineReportScreen.fetchPricesPastReviewDeadlineReport,
  ).toHaveBeenCalledWith({});
  expect(document.title).toBe("Precios sin revisar · Puro Sur");
});

test("offers the report in the reports side column", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/prices-past-review-deadline");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(
      screen.getByRole("link", { name: "Precios sin revisar", includeHidden: false }).first(),
    )
    .toBeVisible();
});

test("keeps the period in the URL and asks the cloud for it", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(
    null,
    "",
    "/reports/prices-past-review-deadline?from=2026-12-01&to=2026-12-31",
  );

  await render(<App help={emptyHelp} services={services} />);

  await expect
    .poll(() => services.pricesPastReviewDeadlineReportScreen.fetchPricesPastReviewDeadlineReport)
    .toHaveBeenCalledWith({ from: "2026-12-01", to: "2026-12-31" });
  expect(window.location.search).toBe("?from=2026-12-01&to=2026-12-31");
});

test("writes a URL with a period the cloud would refuse without it", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(
    null,
    "",
    "/reports/prices-past-review-deadline?from=2026-12-31&to=2026-12-01",
  );

  await render(<App help={emptyHelp} services={services} />);

  await expect.poll(() => window.location.search).toBe("");
  expect(
    services.pricesPastReviewDeadlineReportScreen.fetchPricesPastReviewDeadlineReport,
  ).toHaveBeenCalledWith({});
  expect(
    services.pricesPastReviewDeadlineReportScreen.fetchPricesPastReviewDeadlineReport,
  ).toHaveBeenCalledTimes(1);
});

test("sends a user without the reports permission to Mi cuenta", async () => {
  const services = reportsServices(["stock_area"]);
  window.history.pushState(null, "", "/reports/prices-past-review-deadline");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(
    services.pricesPastReviewDeadlineReportScreen.fetchPricesPastReviewDeadlineReport,
  ).not.toHaveBeenCalled();
});
