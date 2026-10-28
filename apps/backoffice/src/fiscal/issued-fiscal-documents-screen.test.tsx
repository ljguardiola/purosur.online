import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { dateSegments } from "../shell/test-support/report-dates";
import { FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import {
  createReportRegisterFilterServices,
  type ReportRegisterFilterServices,
  reportRegisterFieldForTests,
} from "../shell/test-support/report-register-filter";
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
import { createIssuedFiscalDocumentsServices } from "./test-support/issued-fiscal-documents-screen-services";

function createServices(): IssuedFiscalDocumentsScreenServices {
  const services = createIssuedFiscalDocumentsServices();
  vi.mocked(services.fetchIssuedFiscalDocuments).mockResolvedValue({
    kind: "ok",
    value: issuedFiscalDocuments,
  });
  return services;
}

type Handlers = {
  filters?: IssuedFiscalDocumentsFilters;
  onFiltersChange?: (filters: IssuedFiscalDocumentsFilters) => void;
  onSessionEnded?: () => void;
};

function ControlledScreen({
  services,
  filters: initial = issuedFiscalDocumentsFilters.parse({}),
  onFiltersChange = () => {},
  onSessionEnded = () => {},
  registerServices,
}: Handlers & {
  services: IssuedFiscalDocumentsScreenServices;
  registerServices: ReportRegisterFilterServices;
}) {
  const [filters, setFilters] = useState(initial);
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

test("names the screen and its area", async () => {
  const screen = await renderScreen(createServices());

  await expect
    .element(screen.getByRole("heading", { name: "Comprobantes y notas de crédito", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByText("Caja y fiscal · Fiscal", { exact: true })).toBeVisible();
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
  await expect.poll(() => dateSegments(screen, "Desde")).toEqual(["1", "9", "2026"]);
  expect(dateSegments(screen, "Hasta")).toEqual(["30", "9", "2026"]);
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

test("opens the detail of the document whose action was pressed, asking the cloud for its voucher", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuedFiscalDocument).mockResolvedValue({
    kind: "ok",
    value: authorizedReceiptDetail,
  });
  const screen = await renderScreen(services);

  await userEvent.click(
    screen.getByRole("button", { name: "Ver el detalle de la Factura C 00003-00001247" }),
  );

  expect(services.fetchIssuedFiscalDocument).toHaveBeenCalledWith({
    voucher_type: 11,
    point_of_sale: 3,
    number: 1247,
  });
  await expect
    .element(screen.getByRole("dialog", { name: /Factura C 00003-00001247/ }))
    .toBeVisible();
});

test("closes the detail and keeps the list", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuedFiscalDocument).mockResolvedValue({
    kind: "ok",
    value: authorizedReceiptDetail,
  });
  const screen = await renderScreen(services);
  await userEvent.click(
    screen.getByRole("button", { name: "Ver el detalle de la Factura C 00003-00001247" }),
  );
  await expect.element(screen.getByRole("dialog")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Volver" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Factura C 00003-00001247")).toBeVisible();
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

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
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

test("navigates to Mi cuenta when the request comes back forbidden", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuedFiscalDocuments).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
});
