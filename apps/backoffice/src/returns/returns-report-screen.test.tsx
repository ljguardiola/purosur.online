import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { type Locator, userEvent } from "vitest/browser";
import { readDownloadedXlsx } from "../platform/spreadsheet/test-support/read-xlsx";
import { type ReportFilters, reportFiltersSearch } from "../shell/report-filters-search";
import { render } from "../shell/test-support/render-with-router";
import { dateSegments } from "../shell/test-support/report-dates";
import { BACK_REGISTER_ID, FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import {
  createReportRegisterFilterServices,
  type ReportRegisterFilterServices,
  reportRegisterFieldForTests,
} from "../shell/test-support/report-register-filter";
import { spyOnDownloads } from "../shell/test-support/spy-on-downloads";
import { ReturnsReportScreen } from "./returns-report-screen";
import type { ReturnsReportScreenServices } from "./returns-report-services";
import {
  noReturnsReport,
  noScannedReturnsReport,
  noVoidsReport,
  returnsReport,
} from "./test-support/returns-fixtures";

afterEach(() => {
  vi.restoreAllMocks();
});

const TYPED_TABLE = "Devoluciones iniciadas con el número tipeado";
const SCANNED_TABLE = "Devoluciones iniciadas escaneando el QR";
const VOIDS_TABLE = "Anulaciones";
const BY_CASHIER_TABLE = "Anulaciones y devoluciones por cajero";
const BY_AUTHORIZER_TABLE = "Anulaciones y devoluciones por quién autorizó";

function cellUnder(table: Locator, row: Locator, header: string) {
  return row.getByRole("cell").nth(
    table
      .getByRole("columnheader")
      .elements()
      .findIndex((columnHeader) => columnHeader.textContent === header),
  );
}

function createServices(): ReturnsReportScreenServices {
  const services = { fetchReturnsReport: vi.fn() };
  services.fetchReturnsReport.mockResolvedValue({ kind: "ok", value: returnsReport });
  return services;
}

type Handlers = {
  filters?: ReportFilters;
  onFiltersChange?: (filters: ReportFilters) => void;
  onSessionEnded?: () => void;
};

function ControlledScreen({
  services,
  filters: initial = reportFiltersSearch.parse({}),
  onFiltersChange = () => {},
  onSessionEnded = () => {},
  registerServices,
}: Handlers & {
  services: ReturnsReportScreenServices;
  registerServices: ReportRegisterFilterServices;
}) {
  const [filters, setFilters] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <ReturnsReportScreen
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
  services: ReturnsReportScreenServices,
  {
    registerServices = createReportRegisterFilterServices(),
    ...handlers
  }: Handlers & { registerServices?: ReportRegisterFilterServices } = {},
) {
  return render(
    <ControlledScreen services={services} registerServices={registerServices} {...handlers} />,
  );
}

function servicesAnswering(value: typeof returnsReport) {
  const services = createServices();
  vi.mocked(services.fetchReturnsReport).mockResolvedValue({ kind: "ok", value });
  return services;
}

test("names the report", async () => {
  const screen = await renderScreen(createServices());

  await expect
    .element(screen.getByRole("heading", { name: "Anulaciones y devoluciones", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByText("Reportes · Caja", { exact: true })).toBeVisible();
  await expect
    .element(screen.getByRole("table", { name: TYPED_TABLE }).getByText("Beto"))
    .toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("counts the voids with what they voided, the returns with what was refunded, the exchanged lines and those started by hand", async () => {
  const screen = await renderScreen(createServices());

  const figureOf = (label: string) =>
    [...screen.container.querySelectorAll("div")].find(
      (figure) => figure.children.length > 1 && figure.firstElementChild?.textContent === label,
    )?.textContent;
  await expect.poll(() => figureOf("Anulaciones")).toContain("2");
  expect(figureOf("Anulaciones")).toContain("$ 8.300,00");
  expect(figureOf("Devoluciones")).toContain("3");
  expect(figureOf("Reintegrado")).toContain("$ 5.750,00");
  expect(figureOf("Cambios")).toContain("1");
  expect(figureOf("Iniciadas a mano")).toContain("2");
});

test("shows the summaries and the voids before the returns, each under its own heading", async () => {
  const screen = await renderScreen(createServices());

  await expect
    .element(screen.getByRole("table", { name: BY_CASHIER_TABLE }).getByText("Carla"))
    .toBeVisible();
  const headings = screen
    .getByRole("heading", { level: 2 })
    .elements()
    .map((heading) => heading.textContent);
  expect(headings).toEqual([
    "Por cajero",
    "Por quién autorizó",
    "Anulaciones",
    "Iniciadas con el número tipeado",
    "Iniciadas escaneando el QR",
  ]);
});

test("summarizes each cashier with their voids, returns, refunded and exchanged lines and those started by hand", async () => {
  const screen = await renderScreen(createServices());

  const table = screen.getByRole("table", { name: BY_CASHIER_TABLE });
  for (const header of [
    "Cajero",
    "Anulaciones",
    "Anulado",
    "Devoluciones",
    "Reintegrado",
    "Líneas reintegradas",
    "Líneas cambiadas",
    "Iniciadas a mano",
  ]) {
    await expect.element(table.getByRole("columnheader", { name: header })).toBeVisible();
  }
  const carla = table.getByRole("row", { name: /Carla/ });
  await expect.element(cellUnder(table, carla, "Anulaciones")).toHaveTextContent("1");
  await expect.element(cellUnder(table, carla, "Anulado")).toHaveTextContent("$ 5.200,00");
  await expect.element(cellUnder(table, carla, "Devoluciones")).toHaveTextContent("1");
  await expect.element(cellUnder(table, carla, "Reintegrado")).toHaveTextContent("$ 3.450,00");
  await expect.element(cellUnder(table, carla, "Líneas reintegradas")).toHaveTextContent("2");
  await expect.element(cellUnder(table, carla, "Líneas cambiadas")).toHaveTextContent("0");
  await expect.element(cellUnder(table, carla, "Iniciadas a mano")).toHaveTextContent("1");
  const dora = table.getByRole("row", { name: /Dora/ });
  await expect.element(cellUnder(table, dora, "Líneas cambiadas")).toHaveTextContent("1");
});

test("calls a cashier without a name Sin identificar and a void without a cashier Sin dato in the cashier summary", async () => {
  const screen = await renderScreen(createServices());

  const table = screen.getByRole("table", { name: BY_CASHIER_TABLE });
  await expect.element(table.getByRole("row", { name: /Sin identificar/ })).toBeVisible();
  const unknown = table.getByRole("row", { name: /Sin dato/ });
  await expect.element(cellUnder(table, unknown, "Anulado")).toHaveTextContent("$ 3.100,00");
});

test("summarizes each authorizer and calls the returns and voids nobody authorized Sin autorización", async () => {
  const screen = await renderScreen(createServices());

  const table = screen.getByRole("table", { name: BY_AUTHORIZER_TABLE });
  await expect.element(table.getByRole("columnheader", { name: "Autorizó" })).toBeVisible();
  const beto = table.getByRole("row", { name: /Beto/ });
  await expect.element(cellUnder(table, beto, "Anulado")).toHaveTextContent("$ 5.200,00");
  await expect.element(cellUnder(table, beto, "Reintegrado")).toHaveTextContent("$ 3.450,00");
  const nobody = table.getByRole("row", { name: /Sin autorización/ });
  await expect.element(cellUnder(table, nobody, "Anulaciones")).toHaveTextContent("1");
  await expect.element(cellUnder(table, nobody, "Devoluciones")).toHaveTextContent("2");
  await expect.element(cellUnder(table, nobody, "Líneas cambiadas")).toHaveTextContent("1");
});

test("shows each void with its day and time, register, sale, cashier, authorizer and total", async () => {
  const screen = await renderScreen(createServices());

  const table = screen.getByRole("table", { name: VOIDS_TABLE });
  for (const header of ["Fecha", "Caja", "Venta", "Cajero", "Autorizó", "Total"]) {
    await expect.element(table.getByRole("columnheader", { name: header })).toBeVisible();
  }
  const row = table.getByRole("row", { name: /Operación 000020/ });
  await expect.element(row.getByText("05/10/2026")).toBeVisible();
  await expect.element(row.getByText("10:15")).toBeVisible();
  await expect.element(row.getByText("Caja principal")).toBeVisible();
  await expect.element(row.getByText("Comprobante 00005-00000052")).toBeVisible();
  await expect.element(row.getByText("Carla")).toBeVisible();
  await expect.element(row.getByText("Beto")).toBeVisible();
  await expect.element(row.getByText("$ 5.200,00", { exact: true })).toBeVisible();
});

test("marks a void with no cashier as Sin dato and one nobody authorized with a dash", async () => {
  const screen = await renderScreen(createServices());

  const table = screen.getByRole("table", { name: VOIDS_TABLE });
  const row = table.getByRole("row", { name: /Caja del fondo/ });
  await expect.element(cellUnder(table, row, "Cajero")).toHaveTextContent("Sin dato");
  await expect.element(cellUnder(table, row, "Autorizó")).toHaveTextContent("—");
  await expect.element(cellUnder(table, row, "Total")).toHaveTextContent("$ 3.100,00");
});

test("shows each return with its day and time, register, sale, cashier, authorizer, lines and refund", async () => {
  const screen = await renderScreen(createServices());

  const table = screen.getByRole("table", { name: TYPED_TABLE });
  for (const header of [
    "Fecha",
    "Caja",
    "Venta",
    "Cajero",
    "Autorizó",
    "Líneas devueltas",
    "Reintegrado",
  ]) {
    await expect.element(table.getByRole("columnheader", { name: header })).toBeVisible();
  }
  const row = table.getByRole("row", { name: /Yerba 1 kg/ });
  await expect.element(row.getByText("07/10/2026")).toBeVisible();
  await expect.element(row.getByText("11:30")).toBeVisible();
  await expect.element(row.getByText("Caja principal")).toBeVisible();
  await expect.element(row.getByText("Operación 000012")).toBeVisible();
  await expect.element(row.getByText("Comprobante 00005-00000041")).toBeVisible();
  await expect.element(row.getByText("Carla")).toBeVisible();
  await expect.element(row.getByText("Beto")).toBeVisible();
  await expect.element(row.getByText("$ 3.450,00", { exact: true })).toBeVisible();
});

test("writes each returned line with its quantity, reason, what happens to the goods and whether it was refunded or exchanged", async () => {
  const screen = await renderScreen(createServices());

  const row = screen.getByRole("table", { name: TYPED_TABLE }).getByRole("row", {
    name: /Yerba 1 kg/,
  });
  await expect.element(row.getByText("Yerba 1 kg × 2 u")).toBeVisible();
  await expect.element(row.getByText("Defecto · se descarta · Reintegro")).toBeVisible();
  await expect.element(row.getByText("Queso cremoso × 0,350 kg")).toBeVisible();
  await expect
    .element(row.getByText("Arrepentimiento · vuelve a la venta · Reintegro"))
    .toBeVisible();
});

test("marks a return nobody authorized, and calls a cashier without a name Sin identificar", async () => {
  const screen = await renderScreen(createServices());

  const table = screen.getByRole("table", { name: TYPED_TABLE });
  const row = table.getByRole("row", { name: /Aceite 900 ml/ });
  await expect.element(row).toBeVisible();
  await expect.element(cellUnder(table, row, "Cajero")).toHaveTextContent("Sin identificar");
  await expect.element(cellUnder(table, row, "Autorizó")).toHaveTextContent("—");
});

test("shows no operation or invoice for a sale without them", async () => {
  const screen = await renderScreen(createServices());

  const row = screen.getByRole("table", { name: TYPED_TABLE }).getByRole("row", {
    name: /Aceite 900 ml/,
  });
  expect(row.getByText(/Operación|Comprobante/).query()).toBeNull();
});

test("shows the scanned returns in their own table", async () => {
  const screen = await renderScreen(createServices());

  const row = screen.getByRole("table", { name: SCANNED_TABLE }).getByRole("row", {
    name: /Azúcar 1 kg/,
  });
  await expect.element(row.getByText("06/10/2026")).toBeVisible();
  await expect.element(row.getByText("Caja del fondo")).toBeVisible();
  await expect.element(row.getByText("Operación 000009")).toBeVisible();
  await expect.element(row.getByText("Dora")).toBeVisible();
  await expect.element(row.getByText("Azúcar 1 kg × 3 u")).toBeVisible();
  await expect.element(row.getByText("$ 1.500,00", { exact: true })).toBeVisible();
  await expect.element(row.getByText("Fideos 500 g × 1 u")).toBeVisible();
  await expect.element(row.getByText("Arrepentimiento · vuelve a la venta · Cambio")).toBeVisible();
  expect(
    screen.getByRole("table", { name: TYPED_TABLE }).getByText("Azúcar 1 kg").query(),
  ).toBeNull();
});

test("asks the cloud with no range when the URL has none, and shows the range it answered", async () => {
  const services = createServices();

  const screen = await renderScreen(services);

  await expect.poll(() => dateSegments(screen, "Desde")).toEqual(["1", "10", "2026"]);
  expect(dateSegments(screen, "Hasta")).toEqual(["7", "10", "2026"]);
  expect(services.fetchReturnsReport).toHaveBeenCalledWith({});
});

test("asks the cloud for the range and the register the URL names", async () => {
  const services = createServices();

  await renderScreen(services, {
    filters: reportFiltersSearch.parse({
      from: "2026-10-02",
      to: "2026-10-05",
      register: FRONT_REGISTER_ID,
    }),
  });

  await expect
    .poll(() => vi.mocked(services.fetchReturnsReport).mock.lastCall)
    .toEqual([{ from: "2026-10-02", to: "2026-10-05", register_id: FRONT_REGISTER_ID }]);
});

test("asks the cloud again for the register chosen in the filters", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("table", { name: TYPED_TABLE }).getByText("Beto"))
    .toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  await expect
    .poll(() => vi.mocked(services.fetchReturnsReport).mock.lastCall)
    .toEqual([{ register_id: FRONT_REGISTER_ID }]);
});

test("keeps the previous rows, marked as updating, while another register loads", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("table", { name: TYPED_TABLE }).getByText("Beto"))
    .toBeVisible();
  vi.mocked(services.fetchReturnsReport).mockReturnValue(new Promise(() => {}));

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  await expect
    .element(screen.getByRole("table", { name: TYPED_TABLE }))
    .toHaveAttribute("aria-busy", "true");
  await expect
    .element(screen.getByRole("table", { name: TYPED_TABLE }).getByText("Beto"))
    .toBeVisible();
});

test("shows placeholders while the report loads", async () => {
  const services = createServices();
  vi.mocked(services.fetchReturnsReport).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("table", { name: TYPED_TABLE }))
    .toHaveAttribute("aria-busy", "true");
  await expect
    .element(screen.getByRole("table", { name: SCANNED_TABLE }))
    .toHaveAttribute("aria-busy", "true");
  expect(screen.getByText("$ 5.750,00").query()).toBeNull();
  for (const table of [BY_CASHIER_TABLE, BY_AUTHORIZER_TABLE, VOIDS_TABLE]) {
    await expect
      .element(screen.getByRole("table", { name: table }))
      .toHaveAttribute("aria-busy", "true");
  }
});

test("gives each table its own empty text when its group has no returns", async () => {
  const screen = await renderScreen(servicesAnswering(noScannedReturnsReport));

  await expect
    .element(screen.getByRole("table", { name: TYPED_TABLE }).getByText("Beto"))
    .toBeVisible();
  await expect
    .element(
      screen
        .getByRole("table", { name: SCANNED_TABLE })
        .getByText("No hay devoluciones en este período"),
    )
    .toBeVisible();
  expect(screen.getByText("No hay devoluciones en este período").elements()).toHaveLength(1);
});

test("says there are no returns in either group when there are none", async () => {
  const screen = await renderScreen(servicesAnswering(noReturnsReport));

  for (const table of [TYPED_TABLE, SCANNED_TABLE]) {
    await expect
      .element(
        screen.getByRole("table", { name: table }).getByText("No hay devoluciones en este período"),
      )
      .toBeVisible();
  }
  for (const table of [BY_CASHIER_TABLE, BY_AUTHORIZER_TABLE]) {
    await expect
      .element(
        screen
          .getByRole("table", { name: table })
          .getByText("No hay anulaciones ni devoluciones en este período"),
      )
      .toBeVisible();
  }
  await expect
    .element(
      screen
        .getByRole("table", { name: VOIDS_TABLE })
        .getByText("No hay anulaciones en este período"),
    )
    .toBeVisible();
});

test("says there are no voids when there are returns but no voids", async () => {
  const screen = await renderScreen(servicesAnswering(noVoidsReport));

  await expect
    .element(
      screen
        .getByRole("table", { name: VOIDS_TABLE })
        .getByText("No hay anulaciones en este período"),
    )
    .toBeVisible();
  await expect
    .element(screen.getByRole("table", { name: BY_CASHIER_TABLE }).getByText("Carla"))
    .toBeVisible();
});

test("says the chosen register made no returns when a register is chosen and none were made", async () => {
  const screen = await renderScreen(servicesAnswering(noReturnsReport), {
    filters: reportFiltersSearch.parse({ register: FRONT_REGISTER_ID }),
  });

  for (const table of [TYPED_TABLE, SCANNED_TABLE]) {
    await expect
      .element(
        screen
          .getByRole("table", { name: table })
          .getByText("No hay devoluciones de esta caja en este período"),
      )
      .toBeVisible();
  }
  await expect
    .element(
      screen
        .getByRole("table", { name: VOIDS_TABLE })
        .getByText("No hay anulaciones de esta caja en este período"),
    )
    .toBeVisible();
  for (const table of [BY_CASHIER_TABLE, BY_AUTHORIZER_TABLE]) {
    await expect
      .element(
        screen
          .getByRole("table", { name: table })
          .getByText("No hay anulaciones ni devoluciones de esta caja en este período"),
      )
      .toBeVisible();
  }
});

test("shows a failed load with a retry that loads the report again", async () => {
  const services = createServices();
  vi.mocked(services.fetchReturnsReport)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: returnsReport });
  const screen = await renderScreen(services);

  await expect
    .element(screen.getByText("No pudimos abrir el reporte de anulaciones y devoluciones"))
    .toBeVisible();
  expect(screen.getByRole("table").query()).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByRole("table", { name: TYPED_TABLE }).getByText("Beto"))
    .toBeVisible();
  expect(services.fetchReturnsReport).toHaveBeenCalledTimes(2);
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.fetchReturnsReport).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when the report request comes back forbidden", async () => {
  const services = createServices();
  vi.mocked(services.fetchReturnsReport).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("downloads a spreadsheet with a sheet for the voids, the summaries and each way a return starts, for the register and period applied", async () => {
  const downloads = spyOnDownloads();
  const screen = await renderScreen(createServices(), {
    filters: reportFiltersSearch.parse({ register: BACK_REGISTER_ID }),
  });
  await expect
    .element(screen.getByRole("combobox", { name: /^Caja:/ }))
    .toHaveValue("Caja del fondo");
  await expect
    .element(screen.getByRole("table", { name: TYPED_TABLE }).getByText("Beto"))
    .toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Descargar planilla" }));

  await expect
    .poll(() => downloads.names)
    .toEqual(["anulaciones-y-devoluciones-2026-10-01-2026-10-07.xlsx"]);
  const file = await readDownloadedXlsx(downloads.blobs[0]);
  expect(file.sheetNames).toEqual([
    "Resumen",
    "Anulaciones",
    "Por cajero",
    "Por quién autorizó",
    "Iniciadas con el número tipeado",
    "Iniciadas escaneando el QR",
  ]);
  expect(file.sheet(0).get("B4")?.value).toBe("Caja del fondo");
  expect(file.sheet(0).get("B5")?.value).toBe("2");
  expect(file.sheet(0).get("B6")?.value).toBe("8300");
  const typed = file.sheet(4);
  expect(typed.get("A2")).toMatchObject({ numberFormat: "dd/mm/yyyy hh:mm" });
  expect(typed.get("G2")?.value).toBe("Yerba 1 kg");
  expect(typed.get("L2")?.value).toBe("Reintegro");
  expect(typed.get("H2")?.value).toBe("2");
  expect(typed.get("I3")?.value).toBe("0.35");
  expect(typed.get("M4")?.value).toBe("800");
  expect(file.sheet(5).get("G2")?.value).toBe("Azúcar 1 kg");
  expect(file.sheet(5).get("L3")?.value).toBe("Cambio");
});

test("has its download disabled while the report loads and after loading fails", async () => {
  const services = createServices();
  vi.mocked(services.fetchReturnsReport).mockReturnValue(new Promise(() => {}));
  const loading = await renderScreen(services);
  await expect.element(loading.getByRole("button", { name: "Descargar planilla" })).toBeDisabled();
  await loading.unmount();

  vi.mocked(services.fetchReturnsReport).mockResolvedValue({ kind: "failed" });
  const failed = await renderScreen(services);
  await expect.element(failed.getByRole("button", { name: "Reintentar" })).toBeVisible();
  await expect.element(failed.getByRole("button", { name: "Descargar planilla" })).toBeDisabled();
});
