import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations, tokenRgb } from "@purosur/ui/test";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { readDownloadedXlsx } from "../platform/spreadsheet/test-support/read-xlsx";
import { type ReportPeriodFilters, reportPeriodSearch } from "../shell/report-filters-search";
import { render } from "../shell/test-support/render-with-router";
import { periodSegments, typePeriodEnd, typePeriodStart } from "../shell/test-support/report-dates";
import { spyOnDownloads } from "../shell/test-support/spy-on-downloads";
import { ReceiptDifferencesReportContent } from "./receipt-differences-report-content";
import type { ReceiptDifferencesReportContentServices } from "./receipt-differences-report-content-services";
import {
  emptyReceiptDifferencesReport,
  receiptDifferencesReport,
} from "./test-support/receipt-differences-report-fixtures";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createServices(): ReceiptDifferencesReportContentServices {
  const services = { fetchReceiptDifferencesReport: vi.fn() };
  services.fetchReceiptDifferencesReport.mockResolvedValue({
    kind: "ok",
    value: receiptDifferencesReport,
  });
  return services;
}

type Handlers = {
  filters?: ReportPeriodFilters;
  onFiltersChange?: (filters: ReportPeriodFilters) => void;
  onOpenOrder?: (orderId: string) => void;
  openOrder?: string;
  onSessionEnded?: () => void;
};

function ControlledContent({
  services,
  filters: initial = reportPeriodSearch.parse({}),
  onFiltersChange = () => {},
  onOpenOrder,
  openOrder,
  onSessionEnded = () => {},
}: Handlers & { services: ReceiptDifferencesReportContentServices }) {
  const [filters, setFilters] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <ReceiptDifferencesReportContent
          services={services}
          filters={filters}
          onFiltersChange={(next) => {
            onFiltersChange(next);
            setFilters(next);
          }}
          onOpenOrder={onOpenOrder}
          openOrder={openOrder}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>
  );
}

function renderContent(services: ReceiptDifferencesReportContentServices, handlers: Handlers = {}) {
  return render(<ControlledContent services={services} {...handlers} />);
}

type Screen = Awaited<ReturnType<typeof renderContent>>;

const TITLE = "Diferencias de recepción";

function differencesTable(screen: Screen) {
  return screen.getByRole("table", { name: TITLE, exact: true });
}

const ANDINA_ORDER = "90e00000-0000-4000-8000-0000000000b1";
const GRANOS_ORDER = "90e00000-0000-4000-8000-0000000000b2";

function emptyStateIconColor(title: Element): string {
  const icon = title.parentElement?.querySelector("svg");
  return icon ? getComputedStyle(icon).color : "";
}

test("counts the lines with a shortfall and with a price difference, and the net difference, from the cloud", async () => {
  const screen = await renderContent(createServices());

  await expect.element(screen.getByText(/^Líneas con faltante2$/)).toBeVisible();
  await expect.element(screen.getByText(/^Líneas con diferencia de precio2$/)).toBeVisible();
  await expect.element(screen.getByText(/^Diferencia de precio neta\$ 105,00$/)).toBeVisible();
});

test("writes a net price difference in favour of the buyer with a minus sign", async () => {
  const services = createServices();
  vi.mocked(services.fetchReceiptDifferencesReport).mockResolvedValue({
    kind: "ok",
    value: {
      ...receiptDifferencesReport,
      totals: { ...receiptDifferencesReport.totals, price_difference_cents: -4_500 },
    },
  });

  const screen = await renderContent(services);

  await expect.element(screen.getByText(/^Diferencia de precio neta− \$ 45,00$/)).toBeVisible();
});

test("writes a count of lines as a number reads in Spanish", async () => {
  const services = createServices();
  vi.mocked(services.fetchReceiptDifferencesReport).mockResolvedValue({
    kind: "ok",
    value: {
      ...receiptDifferencesReport,
      totals: { ...receiptDifferencesReport.totals, short_lines: 1_200 },
    },
  });

  const screen = await renderContent(services);

  await expect.element(screen.getByText(/^Líneas con faltante1\.200$/)).toBeVisible();
});

test("shows each supplier and month with the net price difference and no quantities", async () => {
  const screen = await renderContent(createServices());

  const table = differencesTable(screen);
  for (const name of [
    "Proveedor, mes y producto",
    "Recibido",
    "Faltante",
    "Diferencia de precio",
  ]) {
    await expect.element(table.getByRole("columnheader", { name })).toBeVisible();
  }
  const andina = table.getByRole("row", { name: /^Distribuidora Andina/ });
  await expect.element(andina.getByText("$ 150,00", { exact: true })).toBeVisible();
  expect(andina.getByText(/\d+ (u|kg)$/).elements()).toHaveLength(0);
  const october = table.getByRole("row", { name: /^octubre de 2026/ });
  await expect.element(october.getByText("$ 150,00", { exact: true })).toBeVisible();
  expect(october.getByText(/\d+ (u|kg)$/).elements()).toHaveLength(0);
  const granos = table.getByRole("row", { name: /^Granos del Sur/ });
  await expect.element(granos.getByText("− $ 45,00", { exact: true })).toBeVisible();
});

test("shows under each month its receipt lines with the product, the receipt day, what was received and what is missing", async () => {
  const screen = await renderContent(createServices());

  const table = differencesTable(screen);
  const honey = table.getByRole("row", { name: /^Miel pura de abeja 1 kg · 07\/10\/2026/ });
  await expect.element(honey.getByText("8 u", { exact: true })).toBeVisible();
  await expect.element(honey.getByText("2 u", { exact: true })).toBeVisible();
  await expect.element(honey.getByText("$ 150,00", { exact: true })).toBeVisible();
  const oats = table.getByRole("row", { name: /^Avena arrollada · 21\/10\/2026/ });
  await expect.element(oats.getByText("5 kg", { exact: true })).toBeVisible();
  await expect.element(oats.getByText("2,5 kg", { exact: true })).toBeVisible();
  const oil = table.getByRole("row", {
    name: /^Aceite de Almendras Vitora 30 ml · 30\/09\/2026/,
  });
  await expect.element(oil.getByText("0 u", { exact: true })).toBeVisible();
  await expect.element(oil.getByText("− $ 45,00", { exact: true })).toBeVisible();
});

test("shows a dash as the price difference of a line the supplier's list did not price", async () => {
  const screen = await renderContent(createServices());

  const oats = differencesTable(screen).getByRole("row", { name: /^Avena arrollada/ });

  await expect.element(oats.getByText("—", { exact: true })).toBeVisible();
});

test("lists the suppliers, months and lines in the order the cloud answered them", async () => {
  const screen = await renderContent(createServices());
  await expect.element(differencesTable(screen).getByText("Granos del Sur")).toBeVisible();

  const labels = differencesTable(screen)
    .getByRole("row")
    .elements()
    .map(
      (row) =>
        /Distribuidora Andina|Granos del Sur|septiembre de 2026|octubre de 2026|Miel pura|Avena|Aceite/.exec(
          row.textContent ?? "",
        )?.[0],
    )
    .filter((label) => label !== undefined);
  expect(labels).toEqual([
    "Distribuidora Andina",
    "octubre de 2026",
    "Miel pura",
    "Avena",
    "Granos del Sur",
    "septiembre de 2026",
    "Aceite",
  ]);
});

test("asks the cloud for no range when the URL has none, and shows the range it answered", async () => {
  const services = createServices();

  const screen = await renderContent(services);

  await expect.poll(() => periodSegments(screen).slice(0, 3)).toEqual(["1", "9", "2026"]);
  expect(periodSegments(screen).slice(3)).toEqual(["4", "11", "2026"]);
  expect(services.fetchReceiptDifferencesReport).toHaveBeenCalledWith({});
});

test("asks the cloud for the range the URL names", async () => {
  const services = createServices();

  await renderContent(services, {
    filters: reportPeriodSearch.parse({ from: "2026-10-02", to: "2026-10-05" }),
  });

  await expect
    .poll(() => vi.mocked(services.fetchReceiptDifferencesReport).mock.lastCall)
    .toEqual([{ from: "2026-10-02", to: "2026-10-05" }]);
});

test("asks the cloud again for the range typed in the filters and reports it", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  const screen = await renderContent(services, { onFiltersChange });
  await expect.element(screen.getByText("Granos del Sur")).toBeVisible();

  await typePeriodStart(screen, "01102026");
  await typePeriodEnd(screen, "07102026");

  await expect
    .poll(() => vi.mocked(services.fetchReceiptDifferencesReport).mock.lastCall)
    .toEqual([{ from: "2026-10-01", to: "2026-10-07" }]);
  expect(onFiltersChange).toHaveBeenLastCalledWith({ from: "2026-10-01", to: "2026-10-07" });
});

test("keeps the previous report in view, marked as updating, while another range loads", async () => {
  const services = createServices();
  const screen = await renderContent(services);
  await expect.element(screen.getByText("Granos del Sur")).toBeVisible();
  vi.mocked(services.fetchReceiptDifferencesReport).mockReturnValue(new Promise(() => {}));

  await typePeriodStart(screen, "01102026");
  await typePeriodEnd(screen, "07102026");

  await expect.element(differencesTable(screen)).toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText("Granos del Sur")).toBeVisible();
});

test("shows placeholders while the report loads", async () => {
  const services = createServices();
  vi.mocked(services.fetchReceiptDifferencesReport).mockReturnValue(new Promise(() => {}));

  const screen = await renderContent(services);

  await expect.element(differencesTable(screen)).toHaveAttribute("aria-busy", "true");
  await expect
    .element(screen.getByText("Líneas con faltante", { exact: true }).first())
    .toBeVisible();
  expect(screen.getByText("$ 105,00").query()).toBeNull();
});

test("says there are no differences when there are none", async () => {
  const services = createServices();
  vi.mocked(services.fetchReceiptDifferencesReport).mockResolvedValue({
    kind: "ok",
    value: emptyReceiptDifferencesReport,
  });

  const screen = await renderContent(services);

  const empty = differencesTable(screen).getByText(
    "No hay diferencias de recepción en este período",
  );
  await expect.element(empty).toBeVisible();
  await expect.element(screen.getByText(/^Líneas con faltante0$/)).toBeVisible();
  expect(emptyStateIconColor(empty.element())).toBe(tokenRgb("text-accent"));
});

test("says there are no differences in the chosen period as a filtered result", async () => {
  const services = createServices();
  vi.mocked(services.fetchReceiptDifferencesReport).mockResolvedValue({
    kind: "ok",
    value: emptyReceiptDifferencesReport,
  });

  const screen = await renderContent(services, {
    filters: reportPeriodSearch.parse({ from: "2026-10-02", to: "2026-10-05" }),
  });

  const empty = differencesTable(screen).getByText(
    "No hay diferencias de recepción en este período",
  );
  await expect.element(empty).toBeVisible();
  expect(emptyStateIconColor(empty.element())).toBe(tokenRgb("text-subtle"));
});

test("shows a failed load with a retry that loads the report again, and no figures", async () => {
  const services = createServices();
  vi.mocked(services.fetchReceiptDifferencesReport)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: receiptDifferencesReport });
  const screen = await renderContent(services);

  await expect.element(screen.getByRole("button", { name: "Reintentar" }).first()).toBeVisible();
  expect(screen.getByText("Líneas con faltante", { exact: true }).query()).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }).first());

  await expect.element(screen.getByText("Granos del Sur")).toBeVisible();
  expect(services.fetchReceiptDifferencesReport).toHaveBeenCalledTimes(2);
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.fetchReceiptDifferencesReport).mockResolvedValue({
    kind: "unauthenticated",
  });
  const onSessionEnded = vi.fn();

  await renderContent(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("opens the own account panel when the cloud refuses the report", async () => {
  const services = createServices();
  vi.mocked(services.fetchReceiptDifferencesReport).mockResolvedValue({ kind: "forbidden" });

  await renderContent(services);

  await expect
    .poll(() => window.location.pathname + window.location.search)
    .toBe("/?account=credentials");
});

test("downloads a spreadsheet of the lines shown, for the period the report answered", async () => {
  const downloads = spyOnDownloads();
  const screen = await renderContent(createServices());
  await expect.element(differencesTable(screen).getByText("Granos del Sur")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Descargar planilla" }));

  await expect
    .poll(() => downloads.names)
    .toEqual(["diferencias-de-recepcion-2026-09-01-2026-11-04.xlsx"]);
  const file = await readDownloadedXlsx(downloads.blobs[0]);
  expect(file.sheetNames).toEqual(["Resumen", "Diferencias de recepción"]);
  expect(file.sheet(0).get("B4")?.value).toBe("2");
  expect(file.sheet(0).get("B6")?.value).toBe("105");
  expect(file.sheet(1).get("A2")?.value).toBe("Distribuidora Andina");
  expect(file.sheet(1).get("D4")?.value).toBe("Aceite de Almendras Vitora 30 ml");
});

test("has its download disabled while the report loads and after loading fails", async () => {
  const services = createServices();
  vi.mocked(services.fetchReceiptDifferencesReport).mockReturnValue(new Promise(() => {}));
  const loading = await renderContent(services);
  await expect.element(loading.getByRole("button", { name: "Descargar planilla" })).toBeDisabled();
  await loading.unmount();

  vi.mocked(services.fetchReceiptDifferencesReport).mockResolvedValue({ kind: "failed" });
  const failed = await renderContent(services);
  await expect.element(failed.getByRole("button", { name: "Reintentar" })).toBeVisible();
  await expect.element(failed.getByRole("button", { name: "Descargar planilla" })).toBeDisabled();
});

test("opens the order of each line from its button", async () => {
  const onOpenOrder = vi.fn();
  const screen = await renderContent(createServices(), { onOpenOrder });
  const table = differencesTable(screen);
  await expect.element(table.getByText("Granos del Sur")).toBeVisible();

  await userEvent.click(
    table
      .getByRole("row", { name: /^Aceite de Almendras Vitora 30 ml · 30\/09\/2026/ })
      .getByRole("button", { name: "Abrir el pedido" }),
  );
  expect(onOpenOrder).toHaveBeenLastCalledWith(GRANOS_ORDER);

  await userEvent.click(
    table
      .getByRole("row", { name: /^Avena arrollada · 21\/10\/2026/ })
      .getByRole("button", { name: "Abrir el pedido" }),
  );
  expect(onOpenOrder).toHaveBeenLastCalledWith(ANDINA_ORDER);
});

test("offers no way to open an order from a supplier or a month", async () => {
  const screen = await renderContent(createServices(), { onOpenOrder: vi.fn() });
  const table = differencesTable(screen);
  await expect.element(table.getByText("Granos del Sur")).toBeVisible();

  expect(
    table
      .getByRole("row", { name: /^Distribuidora Andina/ })
      .getByRole("button", { name: "Abrir el pedido" })
      .query(),
  ).toBeNull();
  expect(
    table
      .getByRole("row", { name: /^octubre de 2026/ })
      .first()
      .getByRole("button", { name: "Abrir el pedido" })
      .query(),
  ).toBeNull();
});

test("presents no row as one to press", async () => {
  const onOpenOrder = vi.fn();
  const screen = await renderContent(createServices(), { onOpenOrder });
  const table = differencesTable(screen);
  const supplier = table.getByRole("row", { name: /^Distribuidora Andina/ });
  await expect.element(supplier).toBeVisible();

  const cursors = table
    .getByRole("row")
    .elements()
    .slice(1)
    .map((row) => getComputedStyle(row).cursor);
  expect(cursors.filter((cursor) => cursor === "pointer")).toEqual([]);
  await userEvent.click(supplier);
  expect(onOpenOrder).not.toHaveBeenCalled();
});

test("marks the lines of the open order", async () => {
  const screen = await renderContent(createServices(), {
    onOpenOrder: vi.fn(),
    openOrder: GRANOS_ORDER,
  });
  const table = differencesTable(screen);
  const oil = table.getByRole("row", { name: /^Aceite de Almendras Vitora 30 ml/ });
  await expect.element(oil).toBeVisible();

  expect(getComputedStyle(oil.element()).backgroundColor).toBe(tokenRgb("action-subtle"));
  expect(
    getComputedStyle(table.getByRole("row", { name: /^Avena arrollada/ }).element())
      .backgroundColor,
  ).not.toBe(tokenRgb("action-subtle"));
});

test("offers no way to open an order when it is given none", async () => {
  const screen = await renderContent(createServices());
  const table = differencesTable(screen);
  await expect.element(table.getByText("Granos del Sur")).toBeVisible();

  expect(table.getByRole("columnheader", { name: "Acciones" }).query()).toBeNull();
  expect(table.getByRole("button", { name: "Abrir el pedido" }).elements()).toHaveLength(0);
});

test("has no accessibility violations with the lines' open actions", async () => {
  const screen = await renderContent(createServices(), { onOpenOrder: vi.fn() });
  await expect.element(differencesTable(screen).getByText("Granos del Sur")).toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});
