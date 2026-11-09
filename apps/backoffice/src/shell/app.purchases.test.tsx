import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { readDownloadedXlsx } from "../platform/spreadsheet/test-support/read-xlsx";
import { quarterFreightReport } from "../purchasing/test-support/freight-report-fixtures";
import { envioDesdeBuenosAires } from "../purchasing/test-support/freights";
import { compraDeMiel } from "../purchasing/test-support/purchases";
import { quarterPurchasesReport } from "../purchasing/test-support/purchases-report-fixtures";
import { openSession } from "../sessions/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";
import { spyOnDownloads } from "./test-support/spy-on-downloads";

opensOnlyScreens(["/", "/help", "/purchases", "/purchases/freights"]);

beforeEach(resetPageState);

function purchasesServices(capabilities: Capability[]) {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Villalba",
        isAdministrator: false,
        capabilities: ["purchasing_area", ...capabilities],
      }),
    ),
  });
  vi.mocked(services.ownCredentialsSection.fetchPasskeys).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  vi.mocked(services.purchasesListScreen.fetchPurchases).mockResolvedValue({
    kind: "ok",
    value: [compraDeMiel],
  });
  vi.mocked(services.purchasesListScreen.fetchPurchasesReport).mockResolvedValue({
    kind: "ok",
    value: quarterPurchasesReport,
  });
  vi.mocked(services.freightsListScreen.fetchFreights).mockResolvedValue({
    kind: "ok",
    value: { items: [envioDesdeBuenosAires], count: 1, totalCents: 1_850_000 },
  });
  vi.mocked(services.freightsListScreen.fetchFreightReport).mockResolvedValue({
    kind: "ok",
    value: quarterFreightReport,
  });
  return services;
}

function location() {
  return window.location.pathname + window.location.search;
}

async function expectTabs(screen: Awaited<ReturnType<typeof render>>, names: string[]) {
  const tabs = screen.getByRole("tablist", { name: "Secciones de Compras" }).getByRole("tab");
  await expect.element(tabs.first()).toBeVisible();
  expect(tabs.elements()).toHaveLength(names.length);
  for (const [index, name] of names.entries()) {
    await expect.element(tabs.nth(index)).toHaveAccessibleName(name);
  }
}

test("opens Compras with the tabs Compras and Fletes for a person with purchases and freights", async () => {
  const services = purchasesServices(["purchases", "freights"]);
  window.history.pushState(null, "", "/purchases");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Compras", level: 1 })).toBeVisible();
  expect(document.title).toBe("Compras · Puro Sur");
  await expect.element(screen.getByRole("tab", { name: "Compras", selected: true })).toBeVisible();
  await expectTabs(screen, ["Compras", "Fletes"]);
  await expect.element(screen.getByRole("table", { name: "Compras", exact: true })).toBeVisible();
  expect(screen.getByRole("heading", { level: 1 }).elements()).toHaveLength(1);
});

test("opens Fletes from its tab", async () => {
  const services = purchasesServices(["purchases", "freights"]);
  window.history.pushState(null, "", "/purchases");
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(screen.getByRole("tab", { name: "Fletes" }));

  await expect.element(screen.getByRole("table", { name: "Fletes", exact: true })).toBeVisible();
  expect(location()).toBe("/purchases/freights");
  expect(screen.getByRole("heading", { level: 1 }).elements()).toHaveLength(1);
});

test("opens on Fletes, without the Compras tab, for a person with only freights", async () => {
  const services = purchasesServices(["freights"]);
  window.history.pushState(null, "", "/purchases");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Compras", level: 1 })).toBeVisible();
  await expect.element(screen.getByRole("tab", { name: "Fletes", selected: true })).toBeVisible();
  await expectTabs(screen, ["Fletes"]);
  await expect.poll(location).toBe("/purchases/freights");
  expect(services.purchasesListScreen.fetchPurchases).not.toHaveBeenCalled();
});

test("sends a person with only purchases away from Fletes to Compras", async () => {
  const services = purchasesServices(["purchases"]);
  window.history.pushState(null, "", "/purchases/freights");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("table", { name: "Compras", exact: true })).toBeVisible();
  await expect.poll(location).toBe("/purchases");
  await expectTabs(screen, ["Compras"]);
});

test("shows one Compras item in the Compras column, active on both tabs", async () => {
  const services = purchasesServices(["purchases", "freights"]);
  window.history.pushState(null, "", "/purchases/freights");

  const screen = await render(<App help={emptyHelp} services={services} />);

  const links = screen.getByRole("navigation", { name: "Compras" }).getByRole("link");
  await expect.element(links.first()).toBeVisible();
  expect(links.elements().map((link) => link.textContent)).toEqual(["Compras"]);
  await expect.element(links.first()).toHaveAttribute("aria-current", "page");
});

test("redirects the old Flete address to its tab, keeping its search", async () => {
  const services = purchasesServices(["purchases", "freights"]);
  window.history.pushState(null, "", "/freights?period=365&search=expreso");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Fletes", selected: true })).toBeVisible();
  await expect.poll(location).toBe("/purchases/freights?period=365&search=expreso");
});

test("keeps the supplier of the old Flete address on the tab", async () => {
  const services = purchasesServices(["freights"]);
  const supplierId = envioDesdeBuenosAires.purchases[0]?.supplier.id ?? "";
  window.history.pushState(null, "", `/freights?supplier=${supplierId}`);

  await render(<App help={emptyHelp} services={services} />);

  await expect.poll(location).toBe(`/purchases/freights?supplier=${supplierId}`);
  await vi.waitFor(() =>
    expect(services.freightsListScreen.fetchFreights).toHaveBeenCalledWith(
      expect.objectContaining({ supplierId }),
    ),
  );
});

test("groups the freights by month, with the range in the address, and exports the months", async () => {
  const downloads = spyOnDownloads();
  const services = purchasesServices(["freights"]);
  window.history.pushState(null, "", "/purchases/freights");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("table", { name: "Fletes", exact: true })).toBeVisible();

  await userEvent.click(screen.getByText("Agrupar por mes", { exact: true }));

  const table = screen.getByRole("table", { name: "Flete por período", exact: true });
  await expect.element(table.getByText("octubre de 2026")).toBeVisible();
  expect(location()).toBe("/purchases/freights?byMonth=true");
  await expect.element(screen.getByRole("group", { name: /^Período/ })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Descargar planilla" }));

  await expect.poll(() => downloads.names).toHaveLength(1);
  const file = await readDownloadedXlsx(downloads.blobs[0]);
  expect(file.sheetNames[0]).toBe("Resumen");
});

test("exports the freights of the range in the address", async () => {
  const services = purchasesServices(["freights"]);
  window.history.pushState(
    null,
    "",
    "/purchases/freights?byMonth=true&from=2026-09-01&to=2026-10-31",
  );

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(
      screen
        .getByRole("table", { name: "Flete por período", exact: true })
        .getByText("octubre de 2026"),
    )
    .toBeVisible();
  expect(services.freightsListScreen.fetchFreightReport).toHaveBeenCalledWith({
    from: "2026-09-01",
    to: "2026-10-31",
  });
  await expect.element(screen.getByRole("button", { name: "Descargar planilla" })).toBeEnabled();
});

test("groups the purchases by supplier, showing each supplier's totals with the export", async () => {
  const services = purchasesServices(["purchases"]);
  window.history.pushState(null, "", "/purchases");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("table", { name: "Compras", exact: true })).toBeVisible();

  await userEvent.click(screen.getByText("Agrupar por proveedor", { exact: true }));

  const table = screen.getByRole("table", { name: "Compras por proveedor", exact: true });
  const dairy = table.getByRole("row", { name: /^Lácteos del Sur/ });
  await expect.element(dairy.getByText("$ 1.750,50", { exact: true })).toBeVisible();
  const bakery = table.getByRole("row", { name: /^Panificados Norte/ });
  await expect.element(bakery.getByText("$ 825,00", { exact: true })).toBeVisible();
  expect(location()).toBe("/purchases?bySupplier=true");
  await expect.element(screen.getByRole("button", { name: "Descargar planilla" })).toBeEnabled();
});

test("takes the supplier out of the address when it opens grouped by supplier", async () => {
  const services = purchasesServices(["purchases"]);
  const supplierId = compraDeMiel.supplier.id;
  window.history.pushState(null, "", `/purchases?bySupplier=true&supplier=${supplierId}`);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("table", { name: "Compras por proveedor", exact: true }))
    .toBeVisible();
  await expect.poll(location).toBe("/purchases?bySupplier=true");
});

test("takes the supplier out of the address when it opens grouped by month", async () => {
  const services = purchasesServices(["freights"]);
  const supplierId = envioDesdeBuenosAires.purchases[0]?.supplier.id ?? "";
  window.history.pushState(null, "", `/purchases/freights?byMonth=true&supplier=${supplierId}`);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("table", { name: "Flete por período", exact: true }))
    .toBeVisible();
  await expect.poll(location).toBe("/purchases/freights?byMonth=true");
});

test("opens Registrar compra beside the filters", async () => {
  const services = purchasesServices(["purchases"]);
  window.history.pushState(null, "", "/purchases");
  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("button", { name: "Registrar compra" })).toBeVisible();
});

test("opens a purchase's panel with its lines, lots, linked freights and corrections while the list stays visible", async () => {
  await page.viewport(1280, 900);
  const services = purchasesServices(["purchases", "freights"]);
  window.history.pushState(null, "", "/purchases");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("table", { name: "Compras", exact: true })).toBeVisible();

  await userEvent.click(screen.getByRole("cell", { name: "Distribuidora Andina" }));

  const panel = screen.getByRole("complementary", { name: "Compra a Distribuidora Andina" });
  await expect.element(panel.getByText("Miel pura de abeja 1 kg")).toBeVisible();
  await expect.element(panel.getByText("Compra 14/09/2026")).toBeVisible();
  await expect.element(panel.getByText("Flete de la miel")).toBeVisible();
  await expect
    .element(panel.getByRole("button", { name: "Corregir el costo de Miel pura de abeja 1 kg" }))
    .toBeVisible();
  await expect.element(screen.getByRole("table", { name: "Compras", exact: true })).toBeVisible();
  expect(location()).toBe(`/purchases?purchase=${compraDeMiel.id}`);
});

test("opens a purchase's panel from the address and takes the purchase out of it when the panel closes", async () => {
  const services = purchasesServices(["purchases"]);
  window.history.pushState(null, "", `/purchases?purchase=${compraDeMiel.id}`);
  const screen = await render(<App help={emptyHelp} services={services} />);
  const panel = screen.getByRole("complementary", { name: "Compra a Distribuidora Andina" });
  await expect.element(panel).toBeVisible();

  await userEvent.click(panel.getByRole("button", { name: "Cerrar" }));

  await expect.poll(location).toBe("/purchases");
  expect(screen.getByRole("complementary").query()).toBeNull();
});

test("takes an unknown purchase out of the address instead of opening a panel", async () => {
  const services = purchasesServices(["purchases"]);
  window.history.pushState(null, "", "/purchases?purchase=c0a00000-0000-4000-8000-0000000000ff");
  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("table", { name: "Compras", exact: true })).toBeVisible();

  await expect.poll(location).toBe("/purchases");
  expect(screen.getByRole("complementary").query()).toBeNull();
});

test("corrects a line's cost from the panel with its own modal, confirming and reading the purchases again", async () => {
  const services = purchasesServices(["purchases"]);
  vi.mocked(services.purchasesListScreen.correctPurchaseLineCost).mockResolvedValue({
    kind: "ok",
    purchase: compraDeMiel,
  });
  window.history.pushState(null, "", `/purchases?purchase=${compraDeMiel.id}`);
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(
    screen.getByRole("button", { name: "Corregir el costo de Miel pura de abeja 1 kg" }),
  );
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("heading", { name: "Miel pura de abeja 1 kg" }))
    .toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el costo" }));

  await expect.element(screen.getByText("Costo corregido")).toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();
  await expect
    .poll(() => vi.mocked(services.purchasesListScreen.fetchPurchases).mock.calls.length)
    .toBe(2);
});
