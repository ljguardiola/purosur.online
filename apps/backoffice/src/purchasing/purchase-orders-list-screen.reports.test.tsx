import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { readDownloadedXlsx } from "../platform/spreadsheet/test-support/read-xlsx";
import { periodSegments, typePeriodEnd, typePeriodStart } from "../shell/test-support/report-dates";
import { spyOnDownloads } from "../shell/test-support/spy-on-downloads";
import { pendingPurchaseOrdersReport } from "./test-support/pending-purchase-orders-report-fixtures";
import { ORDER_ID } from "./test-support/purchase-orders";
import {
  createServices,
  renderScreen,
  type Screen,
} from "./test-support/purchase-orders-list-screen";
import { receiptDifferencesReport } from "./test-support/receipt-differences-report-fixtures";

beforeEach(async () => {
  await page.viewport(1280, 900);
  window.history.pushState(null, "", "/");
});

afterEach(() => {
  vi.restoreAllMocks();
});

const ANDINA_ORDER = "90e00000-0000-4000-8000-0000000000b1";
const GRANOS_ORDER = "90e00000-0000-4000-8000-0000000000b2";

function pendingTable(screen: Screen) {
  return screen.getByRole("table", { name: "Pedidos pendientes de recibir", exact: true });
}

function differencesTable(screen: Screen) {
  return screen.getByRole("table", { name: "Diferencias de recepción", exact: true });
}

async function choosePendingReceipt(screen: Screen) {
  await userEvent.click(screen.getByRole("button", { name: /^Estado:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Pendientes de recibir" }));
}

test("offers Pendientes de recibir among the states and reports the choice", async () => {
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(createServices(), { onFiltersChange });
  await expect.element(screen.getByRole("table", { name: "Pedidos de compra" })).toBeVisible();

  await choosePendingReceipt(screen);

  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toMatchObject({ state: "PENDING_RECEIPT" });
});

test("shows the pending orders of the report, with their totals, instead of the orders list", async () => {
  const services = createServices();
  const screen = await renderScreen(services, { filters: { state: "PENDING_RECEIPT" } });

  const row = pendingTable(screen).getByRole("row", { name: /^Distribuidora Andina 07\/10\/2026/ });
  await expect.element(row.getByText("Enviado")).toBeVisible();
  await expect.element(pendingTable(screen).getByText("Granos del Sur")).toBeVisible();
  await expect.element(screen.getByText(/^Pedidos pendientes3$/)).toBeVisible();
  await expect.element(screen.getByText(/\$ 7\.550,50$/)).toBeVisible();
  expect(services.fetchPendingPurchaseOrdersReport).toHaveBeenCalledWith({});
  expect(services.fetchPurchaseOrders).not.toHaveBeenCalled();
  expect(screen.getByRole("table", { name: "Pedidos de compra" }).query()).toBeNull();
});

test("shows the range the report answered and asks for the one in the URL", async () => {
  const services = createServices();
  const screen = await renderScreen(services, { filters: { state: "PENDING_RECEIPT" } });

  await expect.poll(() => periodSegments(screen).slice(0, 3)).toEqual(["5", "10", "2026"]);
  expect(periodSegments(screen).slice(3)).toEqual(["4", "11", "2026"]);
  await screen.unmount();

  await renderScreen(services, {
    filters: { state: "PENDING_RECEIPT", from: "2026-10-02", to: "2026-10-05" },
  });
  await expect
    .poll(() => vi.mocked(services.fetchPendingPurchaseOrdersReport).mock.lastCall)
    .toEqual([{ from: "2026-10-02", to: "2026-10-05" }]);
});

test("reports a typed range together with the state and asks the report again", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(services, {
    filters: { state: "PENDING_RECEIPT" },
    onFiltersChange,
  });
  await expect.element(pendingTable(screen).getByText("Granos del Sur")).toBeVisible();

  await typePeriodStart(screen, "01102026");
  await typePeriodEnd(screen, "07102026");

  await expect
    .poll(() => vi.mocked(services.fetchPendingPurchaseOrdersReport).mock.lastCall)
    .toEqual([{ from: "2026-10-01", to: "2026-10-07" }]);
  expect(onFiltersChange).toHaveBeenLastCalledWith({
    state: "PENDING_RECEIPT",
    differences: false,
    from: "2026-10-01",
    to: "2026-10-07",
  });
});

test("lists the other states with no date range", async () => {
  const screen = await renderScreen(createServices(), { filters: { state: "SENT" } });
  await expect.element(screen.getByRole("table", { name: "Pedidos de compra" })).toBeVisible();

  expect(screen.getByRole("group", { name: /^Período/ }).query()).toBeNull();
  expect(screen.getByRole("button", { name: "Descargar planilla" }).query()).toBeNull();
});

test("downloads a spreadsheet of the pending orders for the period the report answered", async () => {
  const downloads = spyOnDownloads();
  const screen = await renderScreen(createServices(), { filters: { state: "PENDING_RECEIPT" } });
  await expect.element(pendingTable(screen).getByText("Granos del Sur")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Descargar planilla" }));

  await expect
    .poll(() => downloads.names)
    .toEqual(["pedidos-pendientes-de-recibir-2026-10-05-2026-11-04.xlsx"]);
  const file = await readDownloadedXlsx(downloads.blobs[0]);
  expect(file.sheetNames).toEqual(["Resumen", "Pedidos pendientes de recibir"]);
  expect(file.sheet(1).get("A2")?.value).toBe("Distribuidora Andina");
});

test("opens a pending order from its row and from its button", async () => {
  const onOpenOrderChange = vi.fn();
  const screen = await renderScreen(createServices(), {
    filters: { state: "PENDING_RECEIPT" },
    onOpenOrderChange,
  });
  await expect.element(pendingTable(screen).getByText("Granos del Sur")).toBeVisible();

  await userEvent.click(
    pendingTable(screen).getByRole("button", { name: "Abrir el pedido de Granos del Sur" }),
  );
  expect(onOpenOrderChange).toHaveBeenLastCalledWith(GRANOS_ORDER);

  await userEvent.click(
    pendingTable(screen).getByRole("row", { name: /^Distribuidora Andina 07\/10\/2026/ }),
  );
  expect(onOpenOrderChange).toHaveBeenLastCalledWith(ANDINA_ORDER);
});

test("keeps the pending orders in view beside the open order's panel", async () => {
  const screen = await renderScreen(createServices(), {
    filters: { state: "PENDING_RECEIPT" },
    openOrder: ORDER_ID,
  });

  await expect
    .element(screen.getByRole("complementary", { name: "Pedido a Distribuidora Andina" }))
    .toBeVisible();
  await expect.element(pendingTable(screen).getByText("Granos del Sur")).toBeVisible();
});

test("shows placeholders while the pending orders load and says when there are none", async () => {
  const services = createServices();
  vi.mocked(services.fetchPendingPurchaseOrdersReport).mockReturnValue(new Promise(() => {}));
  const loading = await renderScreen(services, { filters: { state: "PENDING_RECEIPT" } });
  await expect.element(pendingTable(loading)).toHaveAttribute("aria-busy", "true");
  await expect.element(loading.getByRole("button", { name: "Descargar planilla" })).toBeDisabled();
  await loading.unmount();

  vi.mocked(services.fetchPendingPurchaseOrdersReport).mockResolvedValue({
    kind: "ok",
    value: { ...pendingPurchaseOrdersReport, orders: [] },
  });
  const empty = await renderScreen(services, { filters: { state: "PENDING_RECEIPT" } });
  await expect
    .element(empty.getByText("No hay pedidos pendientes de recibir en este período"))
    .toBeVisible();
});

test("shows a failed load of the pending orders with a retry that loads them again", async () => {
  const services = createServices();
  vi.mocked(services.fetchPendingPurchaseOrdersReport).mockResolvedValueOnce({ kind: "failed" });
  const screen = await renderScreen(services, { filters: { state: "PENDING_RECEIPT" } });

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(pendingTable(screen).getByText("Granos del Sur")).toBeVisible();
  expect(services.fetchPendingPurchaseOrdersReport).toHaveBeenCalledTimes(2);
});

test("ends the session when the cloud says it is over while reading the pending orders", async () => {
  const services = createServices();
  vi.mocked(services.fetchPendingPurchaseOrdersReport).mockResolvedValue({
    kind: "unauthenticated",
  });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { filters: { state: "PENDING_RECEIPT" }, onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("offers the filter Con diferencias de recepción and reports it", async () => {
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(createServices(), { onFiltersChange });
  await expect.element(screen.getByRole("table", { name: "Pedidos de compra" })).toBeVisible();

  await userEvent.click(screen.getByText("Con diferencias de recepción", { exact: true }));

  await expect.poll(() => onFiltersChange.mock.lastCall?.[0]).toMatchObject({ differences: true });
});

test("shows the receipt differences by supplier and month with their lines and totals", async () => {
  const services = createServices();
  const screen = await renderScreen(services, { filters: { differences: true } });

  const table = differencesTable(screen);
  await expect.element(table.getByRole("row", { name: /^Distribuidora Andina/ })).toBeVisible();
  await expect.element(table.getByRole("row", { name: /^octubre de 2026/ }).first()).toBeVisible();
  await expect
    .element(table.getByRole("row", { name: /^Miel pura de abeja 1 kg · 07\/10\/2026/ }))
    .toBeVisible();
  await expect.element(screen.getByText(/^Diferencia de precio neta/)).toBeVisible();
  expect(services.fetchReceiptDifferencesReport).toHaveBeenCalledWith({});
  expect(services.fetchPurchaseOrders).not.toHaveBeenCalled();
  expect(services.fetchPendingPurchaseOrdersReport).not.toHaveBeenCalled();
});

test("hides the state and supplier filters while the differences are shown", async () => {
  const screen = await renderScreen(createServices(), {
    filters: { state: "SENT", differences: true },
    supplierFilter: { supplierId: "90e00000-0000-4000-8000-0000000000a1", onClear: () => {} },
  });
  await expect.element(differencesTable(screen)).toBeVisible();

  expect(screen.getByRole("button", { name: /^Estado:/ }).query()).toBeNull();
  expect(screen.getByRole("button", { name: /^Proveedor/ }).query()).toBeNull();
});

test("asks the differences for the range in the URL and reports a typed one with the toggle on", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(services, {
    filters: { differences: true },
    onFiltersChange,
  });
  await expect.poll(() => periodSegments(screen).slice(0, 3)).toEqual(["1", "9", "2026"]);

  await typePeriodStart(screen, "01102026");
  await typePeriodEnd(screen, "07102026");

  await expect
    .poll(() => vi.mocked(services.fetchReceiptDifferencesReport).mock.lastCall)
    .toEqual([{ from: "2026-10-01", to: "2026-10-07" }]);
  expect(onFiltersChange).toHaveBeenLastCalledWith({
    state: "ALL",
    differences: true,
    from: "2026-10-01",
    to: "2026-10-07",
  });
});

test("opens the order of a difference line from its button", async () => {
  const onOpenOrderChange = vi.fn();
  const screen = await renderScreen(createServices(), {
    filters: { differences: true },
    onOpenOrderChange,
  });
  const line = differencesTable(screen).getByRole("row", {
    name: /^Aceite de Almendras Vitora 30 ml · 30\/09\/2026/,
  });
  await expect.element(line).toBeVisible();

  await userEvent.click(line.getByRole("button", { name: "Abrir el pedido" }));
  expect(onOpenOrderChange).toHaveBeenLastCalledWith(GRANOS_ORDER);

  await userEvent.click(
    differencesTable(screen)
      .getByRole("row", { name: /^Avena arrollada · 21\/10\/2026/ })
      .getByRole("button", { name: "Abrir el pedido" }),
  );
  expect(onOpenOrderChange).toHaveBeenLastCalledWith(ANDINA_ORDER);
});

test("opens no order from a supplier or a month row", async () => {
  const onOpenOrderChange = vi.fn();
  const screen = await renderScreen(createServices(), {
    filters: { differences: true },
    onOpenOrderChange,
  });
  const supplier = differencesTable(screen).getByRole("row", { name: /^Distribuidora Andina/ });
  await expect.element(supplier).toBeVisible();

  await userEvent.click(supplier);

  expect(onOpenOrderChange).not.toHaveBeenCalled();
});

test("downloads a spreadsheet of the differences for the period the report answered", async () => {
  const downloads = spyOnDownloads();
  const screen = await renderScreen(createServices(), { filters: { differences: true } });
  await expect.element(differencesTable(screen).getByText("Granos del Sur")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Descargar planilla" }));

  await expect
    .poll(() => downloads.names)
    .toEqual(["diferencias-de-recepcion-2026-09-01-2026-11-04.xlsx"]);
  const file = await readDownloadedXlsx(downloads.blobs[0]);
  expect(file.sheetNames).toEqual(["Resumen", "Diferencias de recepción"]);
});

test("shows placeholders while the differences load, and a failed load with a retry", async () => {
  const services = createServices();
  vi.mocked(services.fetchReceiptDifferencesReport).mockReturnValue(new Promise(() => {}));
  const loading = await renderScreen(services, { filters: { differences: true } });
  await expect.element(differencesTable(loading)).toHaveAttribute("aria-busy", "true");
  await loading.unmount();

  vi.mocked(services.fetchReceiptDifferencesReport).mockResolvedValueOnce({ kind: "failed" });
  vi.mocked(services.fetchReceiptDifferencesReport).mockResolvedValue({
    kind: "ok",
    value: receiptDifferencesReport,
  });
  const failed = await renderScreen(services, { filters: { differences: true } });
  await userEvent.click(failed.getByRole("button", { name: "Reintentar" }));
  await expect.element(differencesTable(failed).getByText("Granos del Sur")).toBeVisible();
});

test("says there are no differences when there are none", async () => {
  const services = createServices();
  vi.mocked(services.fetchReceiptDifferencesReport).mockResolvedValue({
    kind: "ok",
    value: { ...receiptDifferencesReport, suppliers: [] },
  });

  const screen = await renderScreen(services, { filters: { differences: true } });

  await expect
    .element(screen.getByText("No hay diferencias de recepción en este período"))
    .toBeVisible();
});

test("turning the differences off returns to the orders of the chosen state", async () => {
  const services = createServices();
  const screen = await renderScreen(services, {
    filters: { state: "DRAFT", differences: true },
  });
  await expect.element(differencesTable(screen)).toBeVisible();

  await userEvent.click(screen.getByText("Con diferencias de recepción", { exact: true }));

  await expect.element(screen.getByRole("table", { name: "Pedidos de compra" })).toBeVisible();
  expect(services.fetchPurchaseOrders).toHaveBeenCalledWith("DRAFT");
  await expectNoAccessibilityViolations(screen.container);
});
