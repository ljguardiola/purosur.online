import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { readDownloadedXlsx } from "../platform/spreadsheet/test-support/read-xlsx";
import { render } from "../shell/test-support/render-with-router";
import { periodSegments } from "../shell/test-support/report-dates";
import { BACK_REGISTER_ID, FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import {
  createReportRegisterFilterServices,
  type ReportRegisterFilterServices,
  reportRegisterFieldForTests,
} from "../shell/test-support/report-register-filter";
import { spyOnDownloads } from "../shell/test-support/spy-on-downloads";
import { type ManualDiscountsFilters, manualDiscountsFilters } from "./manual-discounts-filters";
import { ManualDiscountsScreen } from "./manual-discounts-screen";
import type { ManualDiscountsScreenServices } from "./manual-discounts-services";
import {
  ANA_USER_ID,
  BETO_USER_ID,
  manualDiscountsReport,
  noManualDiscountsReport,
  singleManualDiscountReport,
} from "./test-support/sales-fixtures";

function createServices(): ManualDiscountsScreenServices {
  const services = { fetchManualDiscounts: vi.fn() };
  services.fetchManualDiscounts.mockResolvedValue({ kind: "ok", value: manualDiscountsReport });
  return services;
}

type Handlers = {
  filters?: ManualDiscountsFilters;
  onFiltersChange?: (filters: ManualDiscountsFilters) => void;
  onSessionEnded?: () => void;
};

function ControlledScreen({
  services,
  filters: initial = manualDiscountsFilters.parse({}),
  onFiltersChange = () => {},
  onSessionEnded = () => {},
  registerServices,
}: Handlers & {
  services: ManualDiscountsScreenServices;
  registerServices: ReportRegisterFilterServices;
}) {
  const [filters, setFilters] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <ManualDiscountsScreen
          services={services}
          filters={filters}
          onFiltersChange={(next) => {
            onFiltersChange(next);
            setFilters(next);
          }}
          onSessionEnded={onSessionEnded}
          registerFilter={reportRegisterFieldForTests(registerServices, onSessionEnded)}
        />
      </main>
    </FieldSizeProvider>
  );
}

function renderScreen(
  services: ManualDiscountsScreenServices,
  {
    registerServices = createReportRegisterFilterServices(),
    ...handlers
  }: Handlers & {
    registerServices?: ReportRegisterFilterServices;
  } = {},
) {
  return render(
    <ControlledScreen services={services} registerServices={registerServices} {...handlers} />,
  );
}

function servicesAnswering(value: typeof manualDiscountsReport) {
  const services = createServices();
  vi.mocked(services.fetchManualDiscounts).mockResolvedValue({ kind: "ok", value });
  return services;
}

test("names the report and the figures of the period", async () => {
  const screen = await renderScreen(createServices());

  await expect
    .element(
      screen.getByRole("heading", { name: "Descuentos manuales y sobre el total", level: 1 }),
    )
    .toBeVisible();
  await expect.element(screen.getByText("Reportes · Ventas", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Descontado").first()).toBeVisible();
  await expect.element(screen.getByText("$ 1.550,00")).toBeVisible();
  await expect.element(screen.getByText("Descuentos", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("4", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("3 de línea · 1 sobre el total")).toBeVisible();
  await expect.element(screen.getByText("Más autorizó")).toBeVisible();
  await expect.element(screen.getByText("2 descuentos")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("names the person who authorized the most discounts", async () => {
  const screen = await renderScreen(createServices());

  await expect
    .poll(() => screen.getByText("Más autorizó").element().parentElement?.textContent)
    .toContain("Ana");
});

test("calls a most authorized person without a name Sin identificar", async () => {
  const services = servicesAnswering({
    ...manualDiscountsReport,
    totals: {
      ...manualDiscountsReport.totals,
      most_authorized: { id: ANA_USER_ID, name: null, count: 2 },
    },
  });

  const screen = await renderScreen(services);

  await expect
    .poll(() => screen.getByText("Más autorizó").element().parentElement?.textContent)
    .toContain("Sin identificar");
});

test("counts a single discount as 1 descuento", async () => {
  const screen = await renderScreen(servicesAnswering(singleManualDiscountReport));

  await expect.element(screen.getByText("1 descuento", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("0 de línea · 1 sobre el total")).toBeVisible();
});

test("shows each discount with its day and time, its sale, its kind, its reason, who authorized it and its amount", async () => {
  const screen = await renderScreen(createServices());

  const table = screen.getByRole("table", { name: "Descuentos manuales y sobre el total" });
  for (const header of ["Fecha", "Venta", "Tipo", "Motivo", "Autorizó", "Descontado"]) {
    await expect.element(table.getByRole("columnheader", { name: header })).toBeVisible();
  }
  const row = table.getByRole("row", { name: /Cliente frecuente/ });
  await expect.element(row.getByText("07/10/2026")).toBeVisible();
  await expect.element(row.getByText("11:30")).toBeVisible();
  await expect.element(row.getByText("Operación 000012")).toBeVisible();
  await expect.element(row.getByText("Beto")).toBeVisible();
  await expect.element(row.getByText("$ 700,00", { exact: true })).toBeVisible();
});

test("writes an amount discount on the total with its amount", async () => {
  const screen = await renderScreen(createServices());

  const row = screen.getByRole("table").getByRole("row", { name: /Cliente frecuente/ });
  await expect.element(row.getByText("Sobre el total · $ 700,00")).toBeVisible();
});

test("writes a percent discount on the total with its percent", async () => {
  const [saleRow] = manualDiscountsReport.rows;
  const services = servicesAnswering({
    ...singleManualDiscountReport,
    rows: [
      {
        ...(saleRow as (typeof manualDiscountsReport)["rows"][number]),
        adjustment: { kind: "PERCENT", value: 15 },
      },
    ],
  });

  const screen = await renderScreen(services);

  const row = screen.getByRole("table").getByRole("row", { name: /Cliente frecuente/ });
  await expect.element(row.getByText("Sobre el total · 15 %")).toBeVisible();
});

test("names the product of a line discount under its sale", async () => {
  const screen = await renderScreen(createServices());

  const row = screen.getByRole("table").getByRole("row", { name: /Envase dañado/ });
  await expect.element(row.getByText("Operación 000011")).toBeVisible();
  await expect.element(row.getByText("Yerba 1 kg")).toBeVisible();
  await expect.element(row.getByText("Ana")).toBeVisible();
  await expect.element(row.getByText("$ 200,00")).toBeVisible();
});

test("writes a percent discount on a line with its percent", async () => {
  const screen = await renderScreen(createServices());

  const row = screen.getByRole("table").getByRole("row", { name: /Envase dañado/ });
  await expect.element(row.getByText("De línea · 10 %")).toBeVisible();
});

test("writes an amount discount on a line with its amount", async () => {
  const screen = await renderScreen(createServices());

  const row = screen.getByRole("table").getByRole("row", { name: /Regateo/ });
  await expect.element(row.getByText("De línea · $ 500,00")).toBeVisible();
});

test("writes a new price on a line as Precio nuevo, and shows no operation for a sale without one", async () => {
  const screen = await renderScreen(createServices());

  const row = screen.getByRole("table").getByRole("row", { name: /Vencimiento cercano/ });
  await expect.element(row.getByText("Precio nuevo")).toBeVisible();
  await expect.element(row.getByText("Aceite 900 ml")).toBeVisible();
  await expect.element(row.getByText("—", { exact: true })).toBeVisible();
  expect(row.getByText(/Operación/).query()).toBeNull();
});

test("calls an authorizer without a name Sin identificar", async () => {
  const screen = await renderScreen(createServices());

  const row = screen.getByRole("table").getByRole("row", { name: /Vencimiento cercano/ });
  await expect.element(row.getByText("Sin identificar")).toBeVisible();
});

test("shows the discounts in the order the cloud answers, the most recent first", async () => {
  const screen = await renderScreen(createServices());
  await expect.element(screen.getByRole("table").getByText("Cliente frecuente")).toBeVisible();

  const reasons = screen
    .getByRole("table")
    .getByRole("row")
    .elements()
    .map((row) =>
      ["Cliente frecuente", "Envase dañado", "Regateo", "Vencimiento cercano"].find((reason) =>
        row.textContent?.includes(reason),
      ),
    )
    .filter((reason) => reason !== undefined);
  expect(reasons).toEqual(["Cliente frecuente", "Envase dañado", "Regateo", "Vencimiento cercano"]);
});

test("asks the cloud with no range when the URL has none, and shows the range it answered", async () => {
  const services = createServices();

  const screen = await renderScreen(services);

  await expect.poll(() => periodSegments(screen).slice(0, 3)).toEqual(["1", "10", "2026"]);
  expect(periodSegments(screen).slice(3)).toEqual(["7", "10", "2026"]);
  expect(services.fetchManualDiscounts).toHaveBeenCalledWith({});
});

test("asks the cloud for the range, the register and the authorizer the URL names", async () => {
  const services = createServices();

  await renderScreen(services, {
    filters: manualDiscountsFilters.parse({
      from: "2026-10-02",
      to: "2026-10-05",
      register: FRONT_REGISTER_ID,
      authorizedBy: ANA_USER_ID,
    }),
  });

  await expect
    .poll(() => vi.mocked(services.fetchManualDiscounts).mock.lastCall)
    .toEqual([
      {
        from: "2026-10-02",
        to: "2026-10-05",
        register_id: FRONT_REGISTER_ID,
        authorized_by: ANA_USER_ID,
      },
    ]);
});

test("asks the cloud again for the register chosen in the filters", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("table").getByText("Cliente frecuente")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  await expect
    .poll(() => vi.mocked(services.fetchManualDiscounts).mock.lastCall)
    .toEqual([{ register_id: FRONT_REGISTER_ID }]);
});

test("offers the people who authorized a discount and asks the cloud again for the one chosen", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("table").getByText("Cliente frecuente")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Autorizante:/ }));
  const options = screen
    .getByRole("option")
    .elements()
    .map((option) => option.textContent);
  await userEvent.click(screen.getByRole("option", { name: "Ana" }));

  expect(options).toEqual(["Todos", "Ana", "Beto", "Sin identificar"]);
  await expect
    .poll(() => vi.mocked(services.fetchManualDiscounts).mock.lastCall)
    .toEqual([{ authorized_by: ANA_USER_ID }]);
});

test("keeps the previous rows, marked as updating, while another authorizer loads", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("table").getByText("Cliente frecuente")).toBeVisible();
  vi.mocked(services.fetchManualDiscounts).mockReturnValue(new Promise(() => {}));

  await userEvent.click(screen.getByRole("button", { name: /Autorizante:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Ana" }));

  await expect
    .element(screen.getByRole("table", { name: "Descuentos manuales y sobre el total" }))
    .toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByRole("table").getByText("Cliente frecuente")).toBeVisible();
  await expect.element(screen.getByText("$ 1.550,00")).toBeVisible();
});

test("leaves out who authorized the most while the report shows one person", async () => {
  const services = servicesAnswering(singleManualDiscountReport);

  const screen = await renderScreen(services, {
    filters: manualDiscountsFilters.parse({ authorizedBy: BETO_USER_ID }),
  });

  await expect.element(screen.getByRole("table").getByText("Cliente frecuente")).toBeVisible();
  await expect.element(screen.getByText("Descuentos", { exact: true })).toBeVisible();
  expect(screen.getByText("Más autorizó").query()).toBeNull();
  expect(screen.getByText("1 descuento", { exact: true }).query()).toBeNull();
});

test("leaves out who authorized the most while the report for one person loads", async () => {
  const services = createServices();
  vi.mocked(services.fetchManualDiscounts).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services, {
    filters: manualDiscountsFilters.parse({ authorizedBy: BETO_USER_ID }),
  });

  await expect.element(screen.getByText("Descuentos", { exact: true })).toBeVisible();
  expect(screen.getByText("Más autorizó").query()).toBeNull();
});

test("shows placeholders while the report loads", async () => {
  const services = createServices();
  vi.mocked(services.fetchManualDiscounts).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("table", { name: "Descuentos manuales y sobre el total" }))
    .toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText("Más autorizó")).toBeVisible();
  expect(screen.getByText("$ 1.550,00").query()).toBeNull();
});

test("says there are no discounts in the period, with nobody who authorized the most, when there are none", async () => {
  const screen = await renderScreen(servicesAnswering(noManualDiscountsReport));

  await expect.element(screen.getByText("No hay descuentos en este período")).toBeVisible();
  await expect.element(screen.getByText("$ 0,00")).toBeVisible();
  await expect.element(screen.getByText("0 de línea · 0 sobre el total")).toBeVisible();
  expect(screen.getByText("—", { exact: true }).elements()).toHaveLength(1);
});

test("says no discount matches the filters when a register is chosen and none were made", async () => {
  const screen = await renderScreen(servicesAnswering(noManualDiscountsReport), {
    filters: manualDiscountsFilters.parse({ register: FRONT_REGISTER_ID }),
  });

  await expect
    .element(screen.getByText("No hay descuentos con estos filtros en este período"))
    .toBeVisible();
});

test("shows a failed load with a retry that loads the report again", async () => {
  const services = createServices();
  vi.mocked(services.fetchManualDiscounts)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: manualDiscountsReport });
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByRole("table").getByText("Cliente frecuente")).toBeVisible();
  expect(services.fetchManualDiscounts).toHaveBeenCalledTimes(2);
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.fetchManualDiscounts).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when the report request comes back forbidden", async () => {
  const services = createServices();
  vi.mocked(services.fetchManualDiscounts).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect
    .poll(() => window.location.pathname + window.location.search)
    .toBe("/?account=credentials");
});

test("shows every discount on one page, with no pages", async () => {
  const screen = await renderScreen(createServices());
  await expect.element(screen.getByRole("table").getByText("Cliente frecuente")).toBeVisible();

  expect(screen.getByRole("navigation", { name: /Páginas/ }).query()).toBeNull();
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("downloads a spreadsheet of the discounts shown, with the applied register and authorizer", async () => {
  const downloads = spyOnDownloads();
  const screen = await renderScreen(createServices(), {
    filters: manualDiscountsFilters.parse({
      register: BACK_REGISTER_ID,
      authorizedBy: BETO_USER_ID,
    }),
  });
  await expect
    .element(screen.getByRole("combobox", { name: /^Caja:/ }))
    .toHaveValue("Caja del fondo");
  await expect.element(screen.getByText("Cliente frecuente")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Descargar planilla" }));

  await expect
    .poll(() => downloads.names)
    .toEqual(["descuentos-manuales-y-sobre-el-total-2026-10-01-2026-10-07.xlsx"]);
  const file = await readDownloadedXlsx(downloads.blobs[0]);
  expect(file.sheetNames).toEqual(["Resumen", "Descuentos manuales"]);
  const summary = file.sheet(0);
  expect(summary.get("B4")?.value).toBe("Caja del fondo");
  expect(summary.get("B5")?.value).toBe("Beto");
  expect(summary.get("B6")?.value).toBe("1550");
  const discounts = file.sheet(1);
  expect(discounts.get("A2")).toMatchObject({ numberFormat: "dd/mm/yyyy hh:mm" });
  expect(discounts.get("B2")?.value).toBe("Operación 000012");
  expect(discounts.get("D2")?.value).toBe("Sobre el total");
  expect(discounts.get("E2")).toMatchObject({ value: "700", numberFormat: '"$" #,##0.00' });
  expect(discounts.get("H2")?.value).toBe("700");
});

test("has its download disabled while the report loads and after loading fails", async () => {
  const services = createServices();
  vi.mocked(services.fetchManualDiscounts).mockReturnValue(new Promise(() => {}));
  const loading = await renderScreen(services);
  await expect.element(loading.getByRole("button", { name: "Descargar planilla" })).toBeDisabled();
  await loading.unmount();

  vi.mocked(services.fetchManualDiscounts).mockResolvedValue({ kind: "failed" });
  const failed = await renderScreen(services);
  await expect.element(failed.getByRole("button", { name: "Reintentar" })).toBeVisible();
  await expect.element(failed.getByRole("button", { name: "Descargar planilla" })).toBeDisabled();
});
