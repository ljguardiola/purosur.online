import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { openSession } from "../sessions/test-support/open-session";
import { chiaExpiredLot, expiringLotList } from "../stock/test-support/expiring-lots-fixtures";
import { expiringLotsReport } from "../stock/test-support/expiring-lots-report-fixtures";
import { lossesByReasonReport } from "../stock/test-support/losses-by-reason-report-fixtures";
import {
  almonds,
  almondsAdjustment,
  almondsCount,
  honey,
  honeyLoss,
  stockBalanceList,
} from "../stock/test-support/stock-fixtures";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { shownEyebrow } from "./test-support/eyebrow";
import { opensOnlyScreens } from "./test-support/screen-routes";

const PAST_ACTIVITY_THROTTLE_WINDOW_MS = 120_000;

opensOnlyScreens(["/", "/help", "/stock", "/stock/expiries", "/stock/movements"]);

beforeEach(resetPageState);

function stockServices(capabilities: Capability[]) {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Villalba",
        isAdministrator: false,
        capabilities,
      }),
    ),
  });
  vi.mocked(services.ownCredentialsSection.fetchPasskeys).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  vi.mocked(services.stockBalancesScreen.fetchStockBalances).mockResolvedValue({
    kind: "ok",
    value: stockBalanceList([]),
  });
  vi.mocked(services.stockMovementsScreen.fetchStockMovements).mockResolvedValue({
    kind: "ok",
    value: { movements: [] },
  });
  vi.mocked(services.expiringLotsScreen.fetchExpiringLots).mockResolvedValue({
    kind: "ok",
    value: expiringLotList([]),
  });
  return services;
}

const SECTION_LABELS = ["Stock"];

function location() {
  return window.location.pathname + window.location.search;
}

function railLink(screen: Awaited<ReturnType<typeof render>>) {
  return screen.getByRole("navigation", { name: "Áreas" }).getByRole("link", { name: "Stock" });
}

function sectionLabels(screen: Awaited<ReturnType<typeof render>>) {
  return screen
    .getByRole("navigation", { name: "Stock" })
    .getByRole("link")
    .elements()
    .map((link) => link.textContent);
}

test("opens Stock from the rail with its three tabs for a person with every stock capability", async () => {
  const services = stockServices([
    "stock_area",
    "stock_balances",
    "stock_expiries",
    "stock_counts",
    "stock_movements",
  ]);
  window.history.pushState(null, "", "/help");
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(railLink(screen));

  await expect.element(screen.getByRole("heading", { name: "Stock", level: 1 })).toBeVisible();
  expect(location()).toBe("/stock");
  expect(document.title).toBe("Stock · Puro Sur");
  expect(shownEyebrow()).toBeNull();
  const tabs = screen.getByRole("tablist", { name: "Secciones de Stock" });
  await expect.element(tabs.getByRole("tab", { name: "Saldos", selected: true })).toBeVisible();
  for (const [index, name] of ["Saldos", "Vencimientos", "Movimientos"].entries()) {
    await expect.element(tabs.getByRole("tab").nth(index)).toHaveAccessibleName(name);
  }
  await expect.element(railLink(screen)).toHaveAttribute("aria-current", "page");
});

test("shows an Administrator the three tabs of Stock", async () => {
  const services = stockServices([]);
  vi.mocked(services.fetchSession).mockResolvedValue(openSession());
  window.history.pushState(null, "", "/stock");

  const screen = await render(<App help={emptyHelp} services={services} />);

  const tabs = screen.getByRole("tablist", { name: "Secciones de Stock" });
  await expect.element(tabs.getByRole("tab", { name: "Saldos" })).toBeVisible();
  await expect.element(tabs.getByRole("tab", { name: "Vencimientos" })).toBeVisible();
  await expect.element(tabs.getByRole("tab", { name: "Movimientos" })).toBeVisible();
});

test("shows the tab's list under the page's one title, with no title of its own", async () => {
  const services = stockServices(["stock_area", "stock_balances"]);
  window.history.pushState(null, "", "/stock");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("table", { name: "Saldos" })).toBeVisible();
  expect(screen.getByRole("heading", { level: 1 }).elements()).toHaveLength(1);
  expect(screen.getByRole("heading", { name: "Saldos" }).query()).toBeNull();
});

test("opens a panel with the lots and the movements of a product beside the list when its row is pressed on Saldos", async () => {
  const services = stockServices(["stock_area", "stock_balances", "stock_counts"]);
  vi.mocked(services.stockBalancesScreen.fetchStockBalances).mockResolvedValue({
    kind: "ok",
    value: stockBalanceList([almonds, honey]),
  });
  vi.mocked(services.stockBalancesScreen.fetchStockCounts).mockResolvedValue({
    kind: "ok",
    value: { counts: [almondsCount] },
  });
  window.history.pushState(null, "", "/stock");
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(screen.getByText(almonds.name));

  const panel = screen.getByRole("complementary", { name: almonds.name });
  await expect
    .element(panel.getByRole("table", { name: `Lotes de ${almonds.name}` }))
    .toBeVisible();
  await expect
    .element(panel.getByRole("table", { name: `Recuentos de ${almonds.name}` }))
    .toBeVisible();
  await expect.element(screen.getByRole("table", { name: "Saldos" })).toBeVisible();
  expect(location()).toBe(`/stock?product=${almonds.id}`);
  await userEvent.click(panel.getByRole("button", { name: "Cerrar" }));
  expect(screen.getByRole("complementary").query()).toBeNull();
  await expect.poll(location).toBe("/stock");
});

test.each([
  ["Vencimientos", "/stock/expiries", "Vencimientos"],
  ["Movimientos", "/stock/movements", "Movimientos"],
] as const)("opens %s from its tab", async (tab, path, table) => {
  const services = stockServices([
    "stock_area",
    "stock_balances",
    "stock_expiries",
    "stock_movements",
  ]);
  window.history.pushState(null, "", "/stock");
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(screen.getByRole("tab", { name: tab }));

  await expect.element(screen.getByRole("table", { name: table })).toBeVisible();
  expect(location()).toBe(path);
  await expect.element(screen.getByRole("tab", { name: tab, selected: true })).toBeVisible();
});

test.each([
  ["stock_balances", "/stock", ["Saldos"]],
  ["stock_expiries", "/stock/expiries", ["Vencimientos"]],
  ["stock_counts", "/stock/movements", ["Movimientos"]],
  ["stock_movements", "/stock/movements", ["Movimientos"]],
] as const)(
  "opens only the tab of %s, as the default, from the rail's Stock item",
  async (capability, path, tabs) => {
    const services = stockServices([capability, "stock_area"]);
    window.history.pushState(null, "", "/help");
    const screen = await render(<App help={emptyHelp} services={services} />);

    await userEvent.click(railLink(screen));

    await expect.element(screen.getByRole("heading", { name: "Stock", level: 1 })).toBeVisible();
    await expect.poll(location).toBe(path);
    const tabList = screen.getByRole("tablist", { name: "Secciones de Stock" });
    expect(tabList.getByRole("tab").elements()).toHaveLength(tabs.length);
    await expect.element(tabList.getByRole("tab").first()).toHaveAccessibleName(tabs[0]);
  },
);

test("shows the page without tabs to a person with only the initial inventory capability", async () => {
  const services = stockServices(["initial_inventory", "stock_area"]);
  window.history.pushState(null, "", "/stock");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Stock", level: 1 })).toBeVisible();
  expect(screen.getByRole("tablist").query()).toBeNull();
  expect(location()).toBe("/stock");
});

test.each([
  ["/stock", "stock_expiries", "/stock/expiries"],
  ["/stock/expiries", "stock_balances", "/stock"],
  ["/stock/movements", "stock_balances", "/stock"],
  ["/stock", "stock_counts", "/stock/movements"],
] as const)(
  "sends a person who may not open the tab at %s, holding only %s, to their first tab",
  async (path, capability, first) => {
    const services = stockServices([capability, "stock_area"]);
    window.history.pushState(null, "", path);

    const screen = await render(<App help={emptyHelp} services={services} />);

    await expect.element(screen.getByRole("heading", { name: "Stock", level: 1 })).toBeVisible();
    await expect.poll(location).toBe(first);
  },
);

test.each([
  ["/inventory?search=miel", "/stock?search=miel"],
  ["/expiring-lots?expiry=expired", "/stock/expiries?expiry=expired"],
  ["/inventory-counts?period=7&search=miel", "/stock/movements?period=7&search=miel&type=count"],
  [
    "/inventory-adjustments?period=90&search=miel",
    "/stock/movements?period=90&search=miel&type=adjustment%2Closs",
  ],
  ["/initial-inventory", "/stock?register=initial-inventory"],
] as const)("redirects the old address %s to %s", async (old, current) => {
  const services = stockServices([]);
  vi.mocked(services.fetchSession).mockResolvedValue(
    openSession({
      userId: "user-2",
      displayName: "Grace Villalba",
      isAdministrator: false,
      capabilities: [
        "stock_area",
        "stock_balances",
        "stock_expiries",
        "stock_counts",
        "stock_movements",
        "stock_losses",
        "stock_adjustments",
        "initial_inventory",
      ],
      stockMovementKinds: ["loss", "adjustment"],
    }),
  );
  window.history.pushState(null, "", old);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Stock", level: 1 })).toBeVisible();
  await expect.poll(location).toBe(current);
});

test.each([
  ["stock_balances", ["Stock"]],
  ["stock_expiries", ["Stock"]],
  ["stock_counts", ["Stock"]],
  ["stock_movements", ["Stock"]],
  ["initial_inventory", ["Stock"]],
] as const)(
  "lists only the sections %s allows in the section column",
  async (capability, labels) => {
    const services = stockServices([capability, "stock_area"]);
    window.history.pushState(null, "", "/help");
    const screen = await render(<App help={emptyHelp} services={services} />);

    await userEvent.click(railLink(screen));

    await expect.element(screen.getByRole("navigation", { name: "Stock" })).toBeVisible();
    expect(sectionLabels(screen)).toEqual(labels);
  },
);

test("lists every section of Stock in that order to an Administrator", async () => {
  const services = stockServices([]);
  vi.mocked(services.fetchSession).mockResolvedValue(openSession());
  window.history.pushState(null, "", "/stock");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Stock", level: 1 })).toBeVisible();
  expect(sectionLabels(screen)).toEqual(SECTION_LABELS);
  const stockLink = screen.getByRole("navigation", { name: "Stock" }).getByRole("link", {
    name: "Stock",
  });
  await expect.element(stockLink).toHaveAttribute("href", "/stock");
  await expect.element(stockLink).toHaveAttribute("aria-current", "page");
});

test("keeps the Stock link of the section column active on every tab", async () => {
  const services = stockServices([]);
  vi.mocked(services.fetchSession).mockResolvedValue(openSession());
  window.history.pushState(null, "", "/stock/movements");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("navigation", { name: "Stock" }).getByRole("link", { name: "Stock" }))
    .toHaveAttribute("aria-current", "page");
});

test("hides the Stock item in the rail for a user with only purchasing permissions", async () => {
  const services = stockServices(["suppliers", "purchases", "freights"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(railLink(screen).query()).toBeNull();
});

test("hides the Stock item in the rail for a user without the stock area", async () => {
  const services = stockServices(["stock_balances"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(railLink(screen).query()).toBeNull();
});

test("hides the Stock item in the rail for a user without a stock permission", async () => {
  const services = stockServices(["prices_area", "catalog_area"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(railLink(screen).query()).toBeNull();
});

test.each([
  ["/stock", "suppliers"],
  ["/stock/expiries", "suppliers"],
  ["/stock/movements", "suppliers"],
  ["/inventory", "suppliers"],
  ["/expiring-lots", "suppliers"],
  ["/inventory-counts", "suppliers"],
  ["/inventory-adjustments", "suppliers"],
  ["/initial-inventory", "suppliers"],
] as const)(
  "sends a user who may not open %s to the own account panel",
  async (path, capability) => {
    const services = stockServices([capability, "stock_area"]);
    window.history.pushState(null, "", path);

    const screen = await render(<App help={emptyHelp} services={services} />);

    await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
  },
);

async function registerMenuItems(screen: Awaited<ReturnType<typeof render>>) {
  await userEvent.click(screen.getByRole("button", { name: "Registrar" }));
  return screen
    .getByRole("menuitem")
    .elements()
    .map((item) => item.textContent);
}

test("offers the kinds of stock movement real use of the open tab reports the user may now record", async () => {
  const lossesOnly = openSession({
    userId: "user-2",
    displayName: "Grace Villalba",
    isAdministrator: false,
    capabilities: ["stock_losses", "stock_adjustments", "stock_movements", "stock_area"],
    stockMovementKinds: ["loss"],
  });
  const services = stockServices([]);
  vi.mocked(services.fetchSession).mockResolvedValue(lossesOnly);
  window.history.pushState(null, "", "/stock/movements");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("button", { name: "Registrar" })).toBeVisible();
  expect(await registerMenuItems(screen)).toEqual(["Pérdida"]);
  await userEvent.keyboard("{Escape}");

  vi.mocked(services.fetchSession).mockResolvedValue({
    ...lossesOnly,
    stockMovementKinds: ["loss", "adjustment"],
  });
  vi.setSystemTime(Date.now() + PAST_ACTIVITY_THROTTLE_WINDOW_MS);
  try {
    window.dispatchEvent(new KeyboardEvent("keydown"));

    await expect
      .poll(async () => {
        await userEvent.click(screen.getByRole("button", { name: "Registrar" }));
        const items = screen
          .getByRole("menuitem")
          .elements()
          .map((item) => item.textContent);
        await userEvent.keyboard("{Escape}");
        return items;
      })
      .toEqual(["Ajuste", "Pérdida"]);
  } finally {
    vi.useRealTimers();
  }
});

test("offers only Recuento on Registrar to a person with stock_counts but not stock_movements", async () => {
  const services = stockServices(["stock_area", "stock_counts"]);
  window.history.pushState(null, "", "/stock/movements");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("button", { name: "Registrar" })).toBeVisible();

  expect(await registerMenuItems(screen)).toEqual(["Recuento"]);
});

test("offers Registrar on every tab of Stock", async () => {
  const services = stockServices([
    "stock_area",
    "stock_balances",
    "stock_expiries",
    "stock_counts",
  ]);
  window.history.pushState(null, "", "/stock/expiries");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("button", { name: "Registrar" })).toBeVisible();
});

test("opens the initial inventory over Saldos from the old address and clears the address on Listo", async () => {
  const services = stockServices(["stock_area", "stock_balances", "initial_inventory"]);
  window.history.pushState(null, "", "/initial-inventory");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("dialog", { name: "Inventario inicial" })).toBeVisible();
  expect(location()).toBe("/stock?register=initial-inventory");
  await userEvent.click(screen.getByRole("button", { name: "Listo" }));
  await expect.poll(location).toBe("/stock");
  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("opens the initial inventory over the first tab from the old address for a person who may not see Saldos", async () => {
  const services = stockServices(["stock_area", "stock_counts", "initial_inventory"]);
  window.history.pushState(null, "", "/initial-inventory");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("dialog", { name: "Inventario inicial" })).toBeVisible();
  expect(location()).toBe("/stock/movements?register=initial-inventory");
});

test("lets a person holding only initial_inventory open the initial inventory from Registrar", async () => {
  const services = stockServices(["stock_area", "initial_inventory"]);
  window.history.pushState(null, "", "/stock");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("button", { name: "Registrar" })).toBeVisible();

  expect(await registerMenuItems(screen)).toEqual(["Inventario inicial"]);
  await userEvent.click(screen.getByRole("menuitem", { name: "Inventario inicial" }));

  await expect.element(screen.getByRole("dialog", { name: "Inventario inicial" })).toBeVisible();
  expect(location()).toBe("/stock?register=initial-inventory");
});

const STOCK_SCREENS = [
  ["/stock", "Stock"],
  ["/stock/expiries", "Stock"],
  ["/stock/movements", "Stock"],
] as const;

test.each(STOCK_SCREENS)("shows no open alerts count in %s's top bar", async (path, heading) => {
  const services = stockServices([]);
  vi.mocked(services.fetchSession).mockResolvedValue(openSession());
  window.history.pushState(null, "", path);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
  expect(services.homeScreen.fetchAlertsOverview).not.toHaveBeenCalled();
  expect(screen.getByText(/alertas? abiertas?/).query()).toBeNull();
});

test("writes an expired lot off from Vencimientos, recording it as a loss", async () => {
  const services = stockServices(["stock_area", "stock_expiries"]);
  vi.mocked(services.expiringLotsScreen.fetchExpiringLots).mockResolvedValue({
    kind: "ok",
    value: expiringLotList([chiaExpiredLot]),
  });
  vi.mocked(services.expiringLotsScreen.discardExpiredLot).mockResolvedValue({
    kind: "ok",
    value: { movementId: "movement-9", quantity: 1_200, balance: 0, superseded: false },
  });
  window.history.pushState(null, "", "/stock/expiries");
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(
    screen.getByRole("button", {
      name: "Dar de baja el lote Compra 03/10/2026 de Semillas de chía",
    }),
  );

  expect(services.expiringLotsScreen.discardExpiredLot).toHaveBeenCalledWith(chiaExpiredLot.id);
  await expect.element(screen.getByText("Lote dado de baja")).toBeVisible();
});

test("offers the period and the export of Vencimientos to a person with stock_expiries but not reports_area", async () => {
  const services = stockServices(["stock_area", "stock_expiries"]);
  vi.mocked(services.expiringLotsScreen.fetchExpiringLotsReport).mockResolvedValue({
    kind: "ok",
    value: expiringLotsReport([]),
  });
  window.history.pushState(null, "", "/stock/expiries");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("group", { name: /^Período/ })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Descargar planilla" })).toBeEnabled();
});

test("lists only the losses with Tipo Pérdida and groups them by reason with the range and the export", async () => {
  const services = stockServices([]);
  vi.mocked(services.fetchSession).mockResolvedValue(
    openSession({
      userId: "user-2",
      displayName: "Grace Villalba",
      isAdministrator: false,
      capabilities: ["stock_area", "stock_movements", "stock_losses", "stock_adjustments"],
      stockMovementKinds: ["loss", "adjustment"],
    }),
  );
  vi.mocked(services.stockMovementsScreen.fetchStockMovements).mockResolvedValue({
    kind: "ok",
    value: { movements: [honeyLoss, almondsAdjustment] },
  });
  vi.mocked(services.stockMovementsScreen.fetchLossesByReasonReport).mockResolvedValue({
    kind: "ok",
    value: lossesByReasonReport(),
  });
  window.history.pushState(null, "", "/stock/movements");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Pérdida" }));

  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();
  expect(screen.getByText("Almendras peladas").query()).toBeNull();
  await expect.poll(location).toBe("/stock/movements?type=loss");
  await userEvent.click(screen.getByText("Agrupar por motivo"));
  await expect.element(screen.getByRole("region", { name: "Mal estado" })).toBeVisible();
  await expect.element(screen.getByRole("group", { name: /^Período/ })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Descargar planilla" })).toBeEnabled();
  expect(location()).toBe("/stock/movements?type=loss&view=reason");
});

test("opens Movimientos for a person with stock_counts but not stock_movements without reading the movements", async () => {
  const services = stockServices(["stock_area", "stock_counts"]);
  vi.mocked(services.stockMovementsScreen.fetchStockCounts).mockResolvedValue({
    kind: "ok",
    value: { counts: [almondsCount] },
  });
  window.history.pushState(null, "", "/stock");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  await expect.poll(location).toBe("/stock/movements");
  expect(services.stockMovementsScreen.fetchStockMovements).not.toHaveBeenCalled();
});
