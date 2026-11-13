import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { readDownloadedXlsx } from "../platform/spreadsheet/test-support/read-xlsx";
import { render } from "../shell/test-support/render-with-router";
import { periodSegments } from "../shell/test-support/report-dates";
import { FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import {
  createReportRegisterFilterServices,
  type ReportRegisterFilterServices,
  reportRegisterFieldForTests,
} from "../shell/test-support/report-register-filter";
import { spyOnDownloads } from "../shell/test-support/spy-on-downloads";
import {
  type IssuedFiscalDocumentsFilters,
  issuedFiscalDocumentsFilters,
} from "./issued-fiscal-documents-filters";
import { IssuedFiscalDocumentsScreen } from "./issued-fiscal-documents-screen";
import type { IssuedFiscalDocumentsScreenServices } from "./issued-fiscal-documents-services";
import {
  authorizedReceiptDetail,
  issuedFiscalDocuments,
  noIssuedFiscalDocuments,
  pagedIssuedFiscalDocuments,
} from "./test-support/issued-fiscal-documents-fixtures";
import { issuedFiscalDocumentsReport } from "./test-support/issued-fiscal-documents-report-fixtures";
import { createIssuedFiscalDocumentsServices } from "./test-support/issued-fiscal-documents-screen-services";

afterEach(() => {
  vi.restoreAllMocks();
});

function createServices(): IssuedFiscalDocumentsScreenServices {
  const services = createIssuedFiscalDocumentsServices();
  vi.mocked(services.fetchIssuedFiscalDocuments).mockResolvedValue({
    kind: "ok",
    value: issuedFiscalDocuments,
  });
  vi.mocked(services.fetchIssuedFiscalDocumentsReport).mockResolvedValue({
    kind: "ok",
    value: issuedFiscalDocumentsReport,
  });
  return services;
}

type Handlers = {
  filters?: IssuedFiscalDocumentsFilters;
  onFiltersChange?: (filters: IssuedFiscalDocumentsFilters) => void;
  onSessionEnded?: () => void;
  openDocument?: string;
  onOpenDocumentChange?: (document: string | undefined) => void;
};

function ControlledScreen({
  services,
  filters: initial = issuedFiscalDocumentsFilters.parse({}),
  onFiltersChange = () => {},
  onSessionEnded = () => {},
  openDocument: initialDocument,
  onOpenDocumentChange = () => {},
  registerServices,
}: Handlers & {
  services: IssuedFiscalDocumentsScreenServices;
  registerServices: ReportRegisterFilterServices;
}) {
  const [filters, setFilters] = useState(initial);
  const [openDocument, setOpenDocument] = useState(initialDocument);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <IssuedFiscalDocumentsScreen
          services={services}
          filters={filters}
          onFiltersChange={(next) => {
            onFiltersChange(next);
            setFilters(next);
          }}
          onSessionEnded={onSessionEnded}
          openDocument={openDocument}
          onOpenDocumentChange={(document) => {
            onOpenDocumentChange(document);
            setOpenDocument(document);
          }}
          registerFilter={reportRegisterFieldForTests(registerServices, onSessionEnded)}
        />
      </main>
    </FieldSizeProvider>
  );
}

function renderScreen(
  services: IssuedFiscalDocumentsScreenServices,
  {
    registerServices = createReportRegisterFilterServices(),
    ...handlers
  }: Handlers & { registerServices?: ReportRegisterFilterServices } = {},
) {
  return render(
    <ControlledScreen services={services} registerServices={registerServices} {...handlers} />,
  );
}

test("has no title of its own", async () => {
  const screen = await renderScreen(createServices());

  await expect
    .element(screen.getByRole("table", { name: "Comprobantes y notas de crédito" }))
    .toBeVisible();
  expect(screen.getByRole("heading", { level: 1 }).query()).toBeNull();
});

test("shows each document with its issue moment, voucher, authorization, state and total", async () => {
  const screen = await renderScreen(createServices());

  const table = screen.getByRole("table", { name: "Comprobantes y notas de crédito" });
  for (const header of ["Emitido", "Comprobante", "Autorización", "Estado", "Total"]) {
    await expect.element(table.getByRole("columnheader", { name: header })).toBeVisible();
  }
  const receipt = table.getByRole("row", { name: /Factura C 00003-00001247/ });
  await expect.element(receipt.getByText("12/09/2026")).toBeVisible();
  await expect.element(receipt.getByText("12:04")).toBeVisible();
  await expect.element(receipt.getByText("Caja principal", { exact: true })).toBeVisible();
  await expect.element(receipt.getByText("CAE 75123456789012")).toBeVisible();
  await expect.element(receipt.getByText("Autorizado")).toBeVisible();
  await expect.element(receipt.getByText("Vence el 26/09/2026")).toBeVisible();
  await expect.element(receipt.getByText("$ 17.502,75")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("shows a credit note with the voucher it cancels", async () => {
  const screen = await renderScreen(createServices());

  const row = screen.getByRole("row", { name: /Nota de crédito C 00003-00000041/ });
  await expect
    .element(row.getByText("Caja principal · Anula la Factura C 00003-00001246"))
    .toBeVisible();
  await expect.element(row.getByText("$ 3.200,00")).toBeVisible();
});

test("marks a document issued in contingency and shows its fortnight authorization", async () => {
  const screen = await renderScreen(createServices());

  const row = screen.getByRole("row", { name: /Factura C 00007-00000088/ });
  await expect.element(row.getByText("Caja del fondo · en contingencia")).toBeVisible();
  await expect.element(row.getByText("CAEA 36251478963214")).toBeVisible();
  await expect.element(row.getByText("Quincena 16 al 30/09")).toBeVisible();
});

test("shows a document the cloud has not authorized yet as being asked to ARCA", async () => {
  const screen = await renderScreen(createServices());

  const row = screen.getByRole("row", { name: /Factura C 00003-00001248/ });
  await expect.element(row.getByText("Sin autorización todavía")).toBeVisible();
  await expect.element(row.getByText("Consultando a ARCA")).toBeVisible();
  await expect.element(row.getByText("No se reintenta sin consultar")).toBeVisible();
});

test("counts the documents with the period the cloud answered for", async () => {
  const screen = await renderScreen(createServices());

  await expect
    .element(screen.getByText("4 comprobantes · del 01/09/2026 al 30/09/2026"))
    .toBeVisible();
  await expect.poll(() => periodSegments(screen).slice(0, 3)).toEqual(["1", "9", "2026"]);
  expect(periodSegments(screen).slice(3)).toEqual(["30", "9", "2026"]);
});

test("offers to open the detail of each document, named after its voucher", async () => {
  const screen = await renderScreen(createServices());
  await expect.element(screen.getByText("Factura C 00003-00001247")).toBeVisible();

  const table = screen.getByRole("table", { name: "Comprobantes y notas de crédito" });
  for (const voucher of [
    "Factura C 00003-00001247",
    "Nota de crédito C 00003-00000041",
    "Factura C 00007-00000088",
    "Factura C 00003-00001248",
  ]) {
    await expect
      .element(table.getByRole("button", { name: `Ver el detalle de la ${voucher}` }))
      .toBeVisible();
  }
});

test("reports the voucher of the document whose action was pressed, to open its panel", async () => {
  const onOpenDocumentChange = vi.fn();
  const screen = await renderScreen(createServices(), { onOpenDocumentChange });

  await userEvent.click(
    screen.getByRole("button", { name: "Ver el detalle de la Factura C 00003-00001247" }),
  );

  expect(onOpenDocumentChange).toHaveBeenCalledWith("11-3-1247");
});

test("shows the panel of the open voucher, asking the cloud for it", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuedFiscalDocument).mockResolvedValue({
    kind: "ok",
    value: authorizedReceiptDetail,
  });
  const screen = await renderScreen(services, { openDocument: "11-3-1247" });

  await expect
    .element(screen.getByRole("complementary", { name: /Factura C 00003-00001247/ }))
    .toBeVisible();
  expect(services.fetchIssuedFiscalDocument).toHaveBeenCalledWith({
    voucher_type: 11,
    point_of_sale: 3,
    number: 1247,
  });
});

test("closes the panel and keeps the list", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuedFiscalDocument).mockResolvedValue({
    kind: "ok",
    value: authorizedReceiptDetail,
  });
  const onOpenDocumentChange = vi.fn();
  const screen = await renderScreen(services, { openDocument: "11-3-1247", onOpenDocumentChange });
  await expect.element(screen.getByRole("complementary")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

  expect(onOpenDocumentChange).toHaveBeenCalledWith(undefined);
  await expect.poll(() => screen.getByRole("complementary").query()).toBeNull();
  await expect.element(screen.getByText("Factura C 00003-00001247")).toBeVisible();
});

test("closes the panel of a voucher the cloud does not find", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuedFiscalDocument).mockResolvedValue({ kind: "not_found" });
  const onOpenDocumentChange = vi.fn();
  await renderScreen(services, { openDocument: "11-3-9999", onOpenDocumentChange });

  await expect.poll(() => onOpenDocumentChange.mock.lastCall).toEqual([undefined]);
});

test("downloads the spreadsheet of the documents of the period and register the filters name", async () => {
  const downloads = spyOnDownloads();
  const services = createServices();
  const screen = await renderScreen(services, {
    filters: issuedFiscalDocumentsFilters.parse({ from: "2026-10-01", to: "2026-10-07" }),
  });
  await expect.element(screen.getByText("Factura C 00003-00001247")).toBeVisible();
  await expect
    .poll(() => vi.mocked(services.fetchIssuedFiscalDocumentsReport).mock.lastCall)
    .toEqual([{ from: "2026-10-01", to: "2026-10-07" }]);

  await userEvent.click(screen.getByRole("button", { name: "Descargar planilla" }));

  await expect
    .poll(() => downloads.names)
    .toEqual(["comprobantes-emitidos-2026-10-01-2026-10-07.xlsx"]);
  const file = await readDownloadedXlsx(downloads.blobs[0]);
  expect(file.sheetNames).toEqual(["Resumen", "Comprobantes emitidos"]);
  expect(file.sheet(1).get("A2")?.value).toBe("Factura C");
  expect(file.sheet(1).get("E2")?.value).toBe("15000");
});

test("has its download disabled while the report loads", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuedFiscalDocumentsReport).mockReturnValue(new Promise(() => {}));
  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("button", { name: "Descargar planilla" })).toBeDisabled();
});

test("asks the cloud for the first page with no filter when the URL has none", async () => {
  const services = createServices();

  await renderScreen(services);

  await expect
    .poll(() => vi.mocked(services.fetchIssuedFiscalDocuments).mock.lastCall)
    .toEqual([{ page: 1 }]);
});

test("asks the cloud for every filter the URL carries", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuedFiscalDocuments).mockResolvedValue({
    kind: "ok",
    value: { ...issuedFiscalDocuments, total: 3 * issuedFiscalDocuments.page_size },
  });

  await renderScreen(services, {
    filters: issuedFiscalDocumentsFilters.parse({
      from: "2026-09-02",
      to: "2026-09-05",
      register: FRONT_REGISTER_ID,
      kind: "credit_note",
      number: "41",
      page: "2",
    }),
  });

  await expect
    .poll(() => vi.mocked(services.fetchIssuedFiscalDocuments).mock.lastCall)
    .toEqual([
      {
        from: "2026-09-02",
        to: "2026-09-05",
        register_id: FRONT_REGISTER_ID,
        kind: "credit_note",
        number: 41,
        page: 2,
      },
    ]);
});

test("asks the cloud again for the kind chosen, from the first page", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuedFiscalDocuments).mockResolvedValue({
    kind: "ok",
    value: pagedIssuedFiscalDocuments,
  });
  const screen = await renderScreen(services, {
    filters: issuedFiscalDocumentsFilters.parse({ page: "3" }),
  });
  await expect.element(screen.getByText("Factura C 00003-00001247")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Tipo:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Notas de crédito" }));

  await expect
    .poll(() => vi.mocked(services.fetchIssuedFiscalDocuments).mock.lastCall)
    .toEqual([{ kind: "credit_note", page: 1 }]);
});

test("offers every kind, with all of them chosen to begin with", async () => {
  const screen = await renderScreen(createServices());

  await expect
    .element(screen.getByRole("button", { name: /Tipo:/ }))
    .toHaveTextContent("Tipo: Todos");
  await userEvent.click(screen.getByRole("button", { name: /Tipo:/ }));
  for (const name of ["Todos", "Facturas", "Notas de crédito"]) {
    await expect.element(screen.getByRole("option", { name })).toBeVisible();
  }
});

test("asks the cloud again for the register chosen in the filters", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Factura C 00003-00001247")).toBeVisible();

  await userEvent.click(screen.getByRole("combobox", { name: /Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  await expect
    .poll(() => vi.mocked(services.fetchIssuedFiscalDocuments).mock.lastCall)
    .toEqual([{ register_id: FRONT_REGISTER_ID, page: 1 }]);
});

test("searches by the document number typed, from the first page", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(services, { onFiltersChange });
  await expect.element(screen.getByText("Factura C 00003-00001247")).toBeVisible();

  await userEvent.fill(screen.getByRole("searchbox", { name: "Buscar por número" }), "1247");

  await expect
    .poll(() => vi.mocked(services.fetchIssuedFiscalDocuments).mock.lastCall)
    .toEqual([{ number: 1247, page: 1 }]);
  expect(onFiltersChange).toHaveBeenLastCalledWith(expect.objectContaining({ number: "1247" }));
});

test("searches by a document number typed as the list shows it", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(services, { onFiltersChange });
  await expect.element(screen.getByText("Factura C 00003-00001247")).toBeVisible();

  await userEvent.fill(screen.getByRole("searchbox", { name: "Buscar por número" }), "00001247");

  await expect
    .poll(() => vi.mocked(services.fetchIssuedFiscalDocuments).mock.lastCall)
    .toEqual([{ number: 1247, page: 1 }]);
  expect(onFiltersChange).toHaveBeenLastCalledWith(expect.objectContaining({ number: "1247" }));
  await expect
    .element(screen.getByRole("searchbox", { name: "Buscar por número" }))
    .toHaveValue("00001247");
});

test("keeps what is typed without asking the cloud while it is not a document number", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Factura C 00003-00001247")).toBeVisible();
  const calls = vi.mocked(services.fetchIssuedFiscalDocuments).mock.calls.length;

  await userEvent.fill(screen.getByRole("searchbox", { name: "Buscar por número" }), "12a");

  await expect
    .element(screen.getByRole("searchbox", { name: "Buscar por número" }))
    .toHaveValue("12a");
  expect(vi.mocked(services.fetchIssuedFiscalDocuments).mock.calls).toHaveLength(calls);
});

test("shows the pages when the cloud has more documents than a page and asks for the one pressed", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuedFiscalDocuments).mockResolvedValue({
    kind: "ok",
    value: pagedIssuedFiscalDocuments,
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText(/131 comprobantes/)).toBeVisible();

  await userEvent.click(
    screen.getByRole("navigation", { name: "Páginas de comprobantes" }).getByRole("button", {
      name: /^(Página )?2$/,
    }),
  );

  await expect
    .poll(() => vi.mocked(services.fetchIssuedFiscalDocuments).mock.lastCall)
    .toEqual([{ page: 2 }]);
});

test("shows no pages when every document fits in one", async () => {
  const screen = await renderScreen(createServices());
  await expect.element(screen.getByText("Factura C 00003-00001247")).toBeVisible();

  expect(screen.getByRole("navigation", { name: "Páginas de comprobantes" }).query()).toBeNull();
});

test("brings a page past the last one back to the last page that has documents", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuedFiscalDocuments).mockImplementation(async (query) => ({
    kind: "ok",
    value: query.page === 1 ? issuedFiscalDocuments : { ...issuedFiscalDocuments, documents: [] },
  }));
  const onFiltersChange = vi.fn();

  const screen = await renderScreen(services, {
    filters: issuedFiscalDocumentsFilters.parse({ page: "3" }),
    onFiltersChange,
  });

  await expect.element(screen.getByText("Factura C 00003-00001247")).toBeVisible();
  expect(onFiltersChange).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
  expect(screen.getByText("No hay comprobantes en este período").query()).toBeNull();
});

test("keeps the previous rows, marked as updating, while the next page loads", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuedFiscalDocuments).mockResolvedValue({
    kind: "ok",
    value: pagedIssuedFiscalDocuments,
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Factura C 00003-00001247")).toBeVisible();
  vi.mocked(services.fetchIssuedFiscalDocuments).mockReturnValue(new Promise(() => {}));

  await userEvent.click(
    screen.getByRole("navigation", { name: "Páginas de comprobantes" }).getByRole("button", {
      name: /^(Página )?2$/,
    }),
  );

  await expect
    .element(screen.getByRole("table", { name: "Comprobantes y notas de crédito" }))
    .toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText("Factura C 00003-00001247")).toBeVisible();
});

test("shows placeholders while the documents load", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuedFiscalDocuments).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("table", { name: "Comprobantes y notas de crédito" }))
    .toHaveAttribute("aria-busy", "true");
  expect(screen.getByText(/comprobantes ·/).query()).toBeNull();
});

test("says there are no documents in the period when there are none", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuedFiscalDocuments).mockResolvedValue({
    kind: "ok",
    value: noIssuedFiscalDocuments,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No hay comprobantes en este período")).toBeVisible();
});

test("says no document matches when a filter is chosen and none does", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuedFiscalDocuments).mockResolvedValue({
    kind: "ok",
    value: noIssuedFiscalDocuments,
  });

  const screen = await renderScreen(services, {
    filters: issuedFiscalDocumentsFilters.parse({ kind: "credit_note" }),
  });

  await expect
    .element(screen.getByText("No hay comprobantes que coincidan con los filtros"))
    .toBeVisible();
});

test("shows a failed load with a retry that loads the documents again", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuedFiscalDocuments)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: issuedFiscalDocuments });
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Factura C 00003-00001247")).toBeVisible();
  expect(services.fetchIssuedFiscalDocuments).toHaveBeenCalledTimes(2);
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuedFiscalDocuments).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("opens the own account panel when the request comes back forbidden", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuedFiscalDocuments).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect
    .poll(() => window.location.pathname + window.location.search)
    .toBe("/?account=credentials");
});
