import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { type ReportFilters, reportFiltersSearch } from "../shell/report-filters-search";
import { render } from "../shell/test-support/render-with-router";
import { dateSegments } from "../shell/test-support/report-dates";
import { FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import {
  createReportRegisterFilterServices,
  type ReportRegisterFilterServices,
  reportRegisterFieldForTests,
} from "../shell/test-support/report-register-filter";
import { IssuedFiscalDocumentsReportScreen } from "./issued-fiscal-documents-report-screen";
import type { IssuedFiscalDocumentsReportScreenServices } from "./issued-fiscal-documents-report-services";
import {
  issuedFiscalDocumentsReport,
  noIssuedFiscalDocumentsReport,
} from "./test-support/issued-fiscal-documents-report-fixtures";

const TABLE = "Comprobantes emitidos";

function createServices(): IssuedFiscalDocumentsReportScreenServices {
  const services = { fetchIssuedFiscalDocumentsReport: vi.fn() };
  services.fetchIssuedFiscalDocumentsReport.mockResolvedValue({
    kind: "ok",
    value: issuedFiscalDocumentsReport,
  });
  return services;
}

type Handlers = {
  filters?: ReportFilters;
  onSessionEnded?: () => void;
};

function ControlledScreen({
  services,
  filters: initial = reportFiltersSearch.parse({}),
  onSessionEnded = () => {},
  registerServices,
}: Handlers & {
  services: IssuedFiscalDocumentsReportScreenServices;
  registerServices: ReportRegisterFilterServices;
}) {
  const [filters, setFilters] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <IssuedFiscalDocumentsReportScreen
          services={services}
          filters={filters}
          onFiltersChange={setFilters}
          onSessionEnded={onSessionEnded}
          registerFilter={reportRegisterFieldForTests(registerServices, onSessionEnded)}
        />
      </main>
    </FieldSizeProvider>
  );
}

function renderScreen(
  services: IssuedFiscalDocumentsReportScreenServices,
  {
    registerServices = createReportRegisterFilterServices(),
    ...handlers
  }: Handlers & { registerServices?: ReportRegisterFilterServices } = {},
) {
  return render(
    <ControlledScreen services={services} registerServices={registerServices} {...handlers} />,
  );
}

function servicesAnswering(value: typeof issuedFiscalDocumentsReport) {
  const services = createServices();
  vi.mocked(services.fetchIssuedFiscalDocumentsReport).mockResolvedValue({ kind: "ok", value });
  return services;
}

function rowTexts(screen: Awaited<ReturnType<typeof renderScreen>>): string[][] {
  return screen
    .getByRole("table", { name: TABLE })
    .getByRole("row")
    .elements()
    .slice(1)
    .map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent ?? ""));
}

test("names the report", async () => {
  const screen = await renderScreen(createServices());

  await expect
    .element(screen.getByRole("heading", { name: "Comprobantes emitidos", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByText("Reportes · Fiscal", { exact: true })).toBeVisible();
  await expect.element(screen.getByRole("table", { name: TABLE })).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("totals the receipts, the credit notes subtracting, and what was issued under a CAEA", async () => {
  const screen = await renderScreen(createServices());

  const figureOf = (label: string) =>
    screen.getByText(label, { exact: true }).element().parentElement?.textContent;
  await expect.poll(() => figureOf("Facturas")).toContain("$ 20.000,00");
  expect(figureOf("Facturas")).toContain("17 facturas");
  expect(figureOf("Notas de crédito")).toContain("− $ 500,00");
  expect(figureOf("Notas de crédito")).toContain("1 nota");
  expect(figureOf("Total neto")).toContain("$ 19.500,00");
  expect(figureOf("Emitidos con CAEA")).toContain("3");
  expect(figureOf("Emitidos con CAEA")).toContain("16,7 % del total");
});

test("shows no share of the total when the cloud has none to give", async () => {
  const screen = await renderScreen(servicesAnswering(noIssuedFiscalDocumentsReport));

  const figure = screen.getByText("Emitidos con CAEA", { exact: true });
  await expect.poll(() => figure.element().parentElement?.textContent).toContain("—");
  expect(figure.element().parentElement?.textContent).not.toContain("%");
});

test("breaks the documents down by voucher type, point of sale and authorization kind", async () => {
  const screen = await renderScreen(createServices());

  const table = screen.getByRole("table", { name: TABLE });
  for (const header of ["Comprobante", "Punto de venta", "Autorización", "Cantidad", "Importe"]) {
    await expect.element(table.getByRole("columnheader", { name: header })).toBeVisible();
  }
  await expect.poll(() => rowTexts(screen)).toHaveLength(4);
  expect(rowTexts(screen)).toEqual([
    ["Factura C", "00005", "CAE", "12", "$ 15.000,00"],
    ["Factura C", "00005", "CAEA", "3", "$ 3.000,00"],
    ["Factura C", "00007", "CAE", "2", "$ 2.000,00"],
    ["Nota de crédito C", "00005", "CAE", "1", "− $ 500,00"],
  ]);
});

test("asks the cloud with no range when the URL has none, and shows the range it answered", async () => {
  const services = createServices();

  const screen = await renderScreen(services);

  await expect.poll(() => dateSegments(screen, "Desde")).toEqual(["1", "10", "2026"]);
  expect(dateSegments(screen, "Hasta")).toEqual(["7", "10", "2026"]);
  expect(services.fetchIssuedFiscalDocumentsReport).toHaveBeenCalledWith({});
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
    .poll(() => vi.mocked(services.fetchIssuedFiscalDocumentsReport).mock.lastCall)
    .toEqual([{ from: "2026-10-02", to: "2026-10-05", register_id: FRONT_REGISTER_ID }]);
});

test("asks the cloud again for the register chosen in the filters", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.poll(() => rowTexts(screen)).toHaveLength(4);

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  await expect
    .poll(() => vi.mocked(services.fetchIssuedFiscalDocumentsReport).mock.lastCall)
    .toEqual([{ register_id: FRONT_REGISTER_ID }]);
});

test("keeps the previous rows, marked as updating, while another register loads", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.poll(() => rowTexts(screen)).toHaveLength(4);
  vi.mocked(services.fetchIssuedFiscalDocumentsReport).mockReturnValue(new Promise(() => {}));

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  await expect
    .element(screen.getByRole("table", { name: TABLE }))
    .toHaveAttribute("aria-busy", "true");
  expect(rowTexts(screen)).toHaveLength(4);
});

test("shows placeholders while the report loads", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuedFiscalDocumentsReport).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("table", { name: TABLE }))
    .toHaveAttribute("aria-busy", "true");
  expect(screen.getByText("$ 19.500,00").query()).toBeNull();
});

test("says no documents were issued in the period when there are none", async () => {
  const screen = await renderScreen(servicesAnswering(noIssuedFiscalDocumentsReport));

  await expect
    .element(
      screen
        .getByRole("table", { name: TABLE })
        .getByText("No se emitieron comprobantes en este período"),
    )
    .toBeVisible();
  await expect.element(screen.getByText("$ 0,00").first()).toBeVisible();
});

test("says the chosen register issued none when a register is chosen and none were issued", async () => {
  const screen = await renderScreen(servicesAnswering(noIssuedFiscalDocumentsReport), {
    filters: reportFiltersSearch.parse({ register: FRONT_REGISTER_ID }),
  });

  await expect
    .element(screen.getByText("Esta caja no emitió comprobantes en este período"))
    .toBeVisible();
});

test("shows a failed load with a retry that loads the report again", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuedFiscalDocumentsReport)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: issuedFiscalDocumentsReport });
  const screen = await renderScreen(services);

  await expect
    .element(screen.getByText("No pudimos abrir el reporte de comprobantes emitidos"))
    .toBeVisible();
  expect(screen.getByRole("table").query()).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.poll(() => rowTexts(screen)).toHaveLength(4);
  expect(services.fetchIssuedFiscalDocumentsReport).toHaveBeenCalledTimes(2);
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuedFiscalDocumentsReport).mockResolvedValue({
    kind: "unauthenticated",
  });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when the report request comes back forbidden", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuedFiscalDocumentsReport).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
});
