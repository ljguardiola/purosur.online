import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { openSession } from "../sessions/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens([
  "/",
  "/help",
  "/reports/sales-by-payment-method",
  "/fiscal/documents",
  "/products/prices",
  "/stock",
  "/stock/expiries",
  "/stock/movements",
  "/purchases",
  "/purchases/freights",
  "/purchase-orders",
]);

beforeEach(resetPageState);

const REGISTER_ID = "11111111-1111-4111-8111-111111111111";
const PERIOD = "from=2026-10-01&to=2026-10-07";

function servicesFor(capabilities: Capability[] | "administrator") {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      capabilities === "administrator"
        ? openSession()
        : openSession({
            userId: "user-2",
            displayName: "Lucía Ferreyra",
            isAdministrator: false,
            capabilities,
          }),
    ),
  });
  vi.mocked(services.ownCredentialsSection.fetchPasskeys).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  return services;
}

function landedSearch() {
  return Object.fromEntries(
    [...new URLSearchParams(window.location.search)].map(([key, value]) => {
      try {
        return [key, JSON.parse(value)];
      } catch {
        return [key, value];
      }
    }),
  );
}

const PERIOD_SEARCH = { from: "2026-10-01", to: "2026-10-07" };

test.each([
  {
    retired: `/reports/hand-confirmed-payments?${PERIOD}&register=${REGISTER_ID}&method=TRANSFER`,
    path: "/reports/sales-by-payment-method",
    search: { ...PERIOD_SEARCH, register: REGISTER_ID, method: "TRANSFER", handConfirmed: true },
  },
  {
    retired: `/reports/fiscal-documents?${PERIOD}&register=${REGISTER_ID}`,
    path: "/fiscal/documents",
    search: { ...PERIOD_SEARCH, register: REGISTER_ID },
  },
  {
    retired: `/reports/prices-past-review-deadline?${PERIOD}`,
    path: "/products/prices",
    search: PERIOD_SEARCH,
  },
  {
    retired: "/reports/current-stock?category=category-1&sortBy=lots&sort=descending",
    path: "/stock",
    search: { category: "category-1", sortBy: "lots", sort: "descending" },
  },
  {
    retired: `/reports/expiring-lots?${PERIOD}`,
    path: "/stock/expiries",
    search: PERIOD_SEARCH,
  },
  {
    retired: `/reports/losses-by-reason?${PERIOD}`,
    path: "/stock/movements",
    search: { ...PERIOD_SEARCH, type: "loss", view: "reason" },
  },
  {
    retired: `/reports/purchases-by-supplier?${PERIOD}`,
    path: "/purchases",
    search: { ...PERIOD_SEARCH, bySupplier: true },
  },
  {
    retired: `/reports/freight-by-period?${PERIOD}`,
    path: "/purchases/freights",
    search: { ...PERIOD_SEARCH, byMonth: true },
  },
  {
    retired: `/reports/pending-purchase-orders?${PERIOD}`,
    path: "/purchase-orders",
    search: { ...PERIOD_SEARCH, state: "PENDING_RECEIPT" },
  },
  {
    retired: `/reports/receipt-differences?${PERIOD}`,
    path: "/purchase-orders",
    search: { ...PERIOD_SEARCH, differences: true },
  },
])("redirects $retired to $path keeping what its destination filters by", async (target) => {
  const services = servicesFor("administrator");
  window.history.pushState(null, "", target.retired);

  await render(<App help={emptyHelp} services={services} />);

  await expect.poll(() => window.location.pathname).toBe(target.path);
  expect(landedSearch()).toEqual(target.search);
});

test("redirects a retired report with no period to its destination without one", async () => {
  const services = servicesFor("administrator");
  window.history.pushState(null, "", "/reports/expiring-lots");

  await render(<App help={emptyHelp} services={services} />);

  await expect.poll(() => window.location.pathname).toBe("/stock/expiries");
  expect(window.location.search).toBe("");
});

test("leaves the decision to the destination's own guard for someone who only sees the reports", async () => {
  const services = servicesFor(["reports_area"]);
  window.history.pushState(null, "", `/reports/expiring-lots?${PERIOD}`);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
  expect(services.expiringLotsScreen.fetchExpiringLots).not.toHaveBeenCalled();
});
