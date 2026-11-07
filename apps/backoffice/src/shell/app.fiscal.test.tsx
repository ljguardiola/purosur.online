import type { Capability } from "@purosur/domain";
import { FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import {
  exceptionShareOf2026,
  fiscalAddresses,
} from "../fiscal/test-support/exception-share-fixtures";
import { fiscalTasks, unbilledDeferredSales } from "../fiscal/test-support/fiscal-task-fixtures";
import {
  authorizedReceiptDetail,
  issuedFiscalDocuments,
} from "../fiscal/test-support/issued-fiscal-documents-fixtures";
import { issuedFiscalDocumentsReport } from "../fiscal/test-support/issued-fiscal-documents-report-fixtures";
import { readDownloadedXlsx } from "../platform/spreadsheet/test-support/read-xlsx";
import { openSession } from "../sessions/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { registers } from "./test-support/report-fixtures";
import { opensOnlyScreens } from "./test-support/screen-routes";
import { spyOnDownloads } from "./test-support/spy-on-downloads";

opensOnlyScreens([
  "/",
  "/help",
  "/fiscal",
  "/fiscal/documents",
  "/fiscal/caea",
  "/fiscal/settings",
]);

beforeEach(resetPageState);

afterEach(() => {
  vi.restoreAllMocks();
});

const EVERY_FISCAL_CAPABILITY: Capability[] = [
  "fiscal_information",
  "fiscal_configuration_area",
  "contingency_ticket_rescue",
];

function servicesFor(capabilities: Capability[]) {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
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
  vi.mocked(services.fiscalTasksScreen.fetchFiscalTasks).mockResolvedValue({
    kind: "ok",
    value: fiscalTasks,
  });
  vi.mocked(services.fiscalStatusStrip.fetchFiscalTasks).mockResolvedValue({
    kind: "ok",
    value: fiscalTasks,
  });
  vi.mocked(services.fiscalStatusStrip.fetchUnbilledDeferredSales).mockResolvedValue({
    kind: "ok",
    value: unbilledDeferredSales,
  });
  vi.mocked(services.fiscalStatusStrip.fetchCurrentOfflineAuthorizationCode).mockResolvedValue({
    kind: "ok",
    value: { offline_authorization_code: null },
  });
  vi.mocked(services.fiscalStatusStrip.fetchFortnightPresentations).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  vi.mocked(services.unbilledDeferredSalesPill.fetchUnbilledDeferredSales).mockResolvedValue({
    kind: "ok",
    value: unbilledDeferredSales,
  });
  vi.mocked(services.issuedFiscalDocumentsScreen.fetchIssuedFiscalDocuments).mockResolvedValue({
    kind: "ok",
    value: issuedFiscalDocuments,
  });
  vi.mocked(services.issuedFiscalDocumentsScreen.fetchIssuedFiscalDocument).mockResolvedValue({
    kind: "ok",
    value: authorizedReceiptDetail,
  });
  vi.mocked(services.issuedFiscalDocumentsScreen.fetchFiscalRegisters).mockResolvedValue({
    kind: "ok",
    value: registers,
  });
  vi.mocked(
    services.issuedFiscalDocumentsScreen.fetchIssuedFiscalDocumentsReport,
  ).mockResolvedValue({
    kind: "ok",
    value: issuedFiscalDocumentsReport,
  });
  vi.mocked(services.caeaScreen.fetchFiscalAddresses).mockResolvedValue({
    kind: "ok",
    value: fiscalAddresses,
  });
  vi.mocked(services.caeaScreen.fetchExceptionShareYear).mockResolvedValue({
    kind: "ok",
    value: exceptionShareOf2026,
  });
  vi.mocked(services.caeaScreen.fetchRegisterPointsOfSale).mockResolvedValue({
    kind: "ok",
    value: [
      {
        registerId: "register-1",
        registerName: "Caja 1",
        pointOfSaleNumber: 12,
        fiscalAddressId: fiscalAddresses[0]?.id ?? null,
        version: 2,
        offlinePointOfSaleNumber: 13,
        offlineVersion: 4,
      },
    ],
  });
  vi.mocked(services.caeaScreen.fetchFortnightPresentations).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  vi.mocked(services.caeaScreen.fetchOfflinePointsOfSale).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  vi.mocked(services.fiscalSettingsScreen.fetchIssuerIdentification).mockResolvedValue({
    kind: "ok",
    value: {
      legalName: null,
      grossIncomeRegistration: null,
      activityStartDate: null,
      authorizedCuit: FICTIONAL_CUIT,
      taxStatus: "Responsable Monotributo",
      version: 1,
    },
  });
  vi.mocked(services.fiscalSettingsScreen.fetchFiscalAddresses).mockResolvedValue({
    kind: "ok",
    value: fiscalAddresses,
  });
  return services;
}

function location() {
  return window.location.pathname + window.location.search + window.location.hash;
}

test("opens Fiscal from the rail with the status strip and the four tabs for a person with every fiscal capability", async () => {
  const services = servicesFor(EVERY_FISCAL_CAPABILITY);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("link", { name: "Fiscal", exact: true }));

  await expect.element(screen.getByRole("heading", { name: "Fiscal", level: 1 })).toBeVisible();
  expect(location()).toBe("/fiscal");
  expect(document.title).toBe("Fiscal · Puro Sur");
  const tabs = screen.getByRole("tablist", { name: "Secciones de Fiscal" });
  await expect
    .element(tabs.getByRole("tab", { name: "Tareas fiscales", selected: true }))
    .toBeVisible();
  for (const name of ["Comprobantes", "CAEA y excepcionalidad", "Configuración"]) {
    await expect.element(tabs.getByRole("tab", { name })).toBeVisible();
  }
  await expect.element(screen.getByText("Tareas fiscales pendientes")).toBeVisible();
  await expect.element(screen.getByText("Ventas diferidas sin facturar").first()).toBeVisible();
  await expect.element(screen.getByText("CAEA vigente")).toBeVisible();
  await expect.element(screen.getByText("Informes quincenales pendientes")).toBeVisible();
  await expect.element(screen.getByText("Venta diferida vencida")).toBeVisible();
  await expect
    .element(screen.getByRole("link", { name: "Fiscal", exact: true }))
    .toHaveAttribute("aria-current", "page");
});

test("has no Caja y fiscal item in the rail", async () => {
  const services = servicesFor(EVERY_FISCAL_CAPABILITY);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("link", { name: "Fiscal", exact: true })).toBeVisible();
  expect(screen.getByRole("link", { name: "Caja y fiscal", exact: true }).query()).toBeNull();
});

test("hides the Fiscal item from a person without a fiscal capability, and sends them to Mi cuenta from /fiscal", async () => {
  const services = servicesFor(["reports_area"]);
  window.history.pushState(null, "", "/fiscal");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
  expect(location()).toBe("/?account=credentials");
  expect(screen.getByRole("link", { name: "Fiscal", exact: true }).query()).toBeNull();
  expect(services.fiscalStatusStrip.fetchFiscalTasks).not.toHaveBeenCalled();
});

test("opens Tareas fiscales from the pill of deferred sales not yet billed", async () => {
  const services = servicesFor(["fiscal_information"]);
  window.history.pushState(null, "", "/help");
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(screen.getByRole("link", { name: /ventas diferidas sin facturar/ }));

  await expect
    .element(screen.getByRole("tab", { name: "Tareas fiscales", selected: true }))
    .toBeVisible();
  expect(location()).toBe("/fiscal");
});

test("shows only CAEA y excepcionalidad, with only the rescue button and no strip, to a person with only the contingency ticket rescue", async () => {
  const services = servicesFor(["contingency_ticket_rescue"]);
  window.history.pushState(null, "", "/fiscal");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("tab", { name: "CAEA y excepcionalidad", selected: true }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Rescatar tickets de contingencia" }))
    .toBeVisible();
  expect(location()).toBe("/fiscal/caea");
  expect(screen.getByRole("tab").elements()).toHaveLength(1);
  expect(screen.getByRole("heading", { level: 2 }).query()).toBeNull();
  expect(screen.getByText("Tareas fiscales pendientes").query()).toBeNull();
  expect(services.caeaScreen.fetchFiscalAddresses).not.toHaveBeenCalled();
});

test("opens the rescue assistant in a dialog from the button, and closes it back to the tab", async () => {
  const services = servicesFor(["contingency_ticket_rescue"]);
  window.history.pushState(null, "", "/fiscal/caea");
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(screen.getByRole("button", { name: "Rescatar tickets de contingencia" }));

  const dialog = screen.getByRole("dialog", { name: "Rescate de tickets de contingencia" });
  await expect.element(dialog).toBeVisible();
  expect(location()).toBe("/fiscal/caea?assistant=contingency-ticket-rescue");
  await userEvent.click(dialog.getByRole("button", { name: "Volver" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(location()).toBe("/fiscal/caea");
});

test("drops the assistant from the URL of a person without the contingency ticket rescue", async () => {
  const services = servicesFor(["fiscal_information"]);
  window.history.pushState(null, "", "/fiscal/caea?assistant=contingency-ticket-rescue");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Excepcionalidad" })).toBeVisible();
  expect(location()).toBe("/fiscal/caea");
  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("shows each tab only to who holds its capability, and sends a hidden tab to the first one shown", async () => {
  const services = servicesFor(["fiscal_configuration_area"]);
  window.history.pushState(null, "", "/fiscal/documents");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("tab", { name: "CAEA y excepcionalidad", selected: true }))
    .toBeVisible();
  expect(location()).toBe("/fiscal/caea");
  expect(screen.getByRole("tab", { name: "Tareas fiscales" }).query()).toBeNull();
  expect(screen.getByRole("tab", { name: "Comprobantes" }).query()).toBeNull();
  await expect.element(screen.getByRole("tab", { name: "Configuración" })).toBeVisible();
  expect(services.issuedFiscalDocumentsScreen.fetchIssuedFiscalDocuments).not.toHaveBeenCalled();
});

test("shows Puntos de venta read-only, with the link to edit it in Cajas", async () => {
  const services = servicesFor(["fiscal_configuration_area"]);
  window.history.pushState(null, "", "/fiscal/caea");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Puntos de venta" })).toBeVisible();
  await expect.element(screen.getByText("00012")).toBeVisible();
  expect(screen.getByRole("button", { name: "Editar", exact: true }).query()).toBeNull();
  await expect
    .element(screen.getByRole("link", { name: "Se edita en Cajas" }))
    .toHaveAttribute("href", "/registers?register=register-1&tab=fiscal");
});

test("lists the issued documents of Comprobantes and keeps the filters in the URL", async () => {
  const services = servicesFor(["fiscal_information"]);
  window.history.pushState(null, "", "/fiscal/documents?kind=receipt");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByText("Factura C 00003-00001247")).toBeVisible();
  await expect
    .poll(
      () =>
        vi.mocked(services.issuedFiscalDocumentsScreen.fetchIssuedFiscalDocuments).mock.lastCall,
    )
    .toEqual([{ kind: "receipt", page: 1 }]);
  expect(location()).toBe("/fiscal/documents?kind=receipt");
});

test("downloads the spreadsheet of the documents of the range chosen in Comprobantes", async () => {
  const downloads = spyOnDownloads();
  const services = servicesFor(["fiscal_information"]);
  window.history.pushState(null, "", "/fiscal/documents?from=2026-10-01&to=2026-10-07");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByText("Factura C 00003-00001247")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Descargar planilla" }));

  await expect
    .poll(() => services.issuedFiscalDocumentsScreen.fetchIssuedFiscalDocumentsReport)
    .toHaveBeenCalledWith({ from: "2026-10-01", to: "2026-10-07" });
  await expect
    .poll(() => downloads.names)
    .toEqual(["comprobantes-emitidos-2026-10-01-2026-10-07.xlsx"]);
  const file = await readDownloadedXlsx(downloads.blobs[0]);
  expect(file.sheetNames).toEqual(["Resumen", "Comprobantes emitidos"]);
  expect(file.sheet(1).get("A2")?.value).toBe("Factura C");
});

test("opens the panel of a voucher from its action, writes it into the URL, and closes it", async () => {
  const services = servicesFor(["fiscal_information"]);
  window.history.pushState(null, "", "/fiscal/documents");
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(
    screen.getByRole("button", { name: "Ver el detalle de la Factura C 00003-00001247" }),
  );

  await expect
    .element(screen.getByRole("complementary", { name: /Factura C 00003-00001247/ }))
    .toBeVisible();
  expect(location()).toBe("/fiscal/documents?document=11-3-1247");
  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));
  await expect.poll(location).toBe("/fiscal/documents");
});

test("opens the panel of the voucher a URL names, and closes it when the cloud does not find the voucher", async () => {
  const services = servicesFor(["fiscal_information"]);
  vi.mocked(services.issuedFiscalDocumentsScreen.fetchIssuedFiscalDocument).mockResolvedValue({
    kind: "not_found",
  });
  window.history.pushState(null, "", "/fiscal/documents?document=11-3-9999");

  await render(<App help={emptyHelp} services={services} />);

  await expect.poll(location).toBe("/fiscal/documents");
});

test("drops a voucher key that names no voucher from the URL", async () => {
  const services = servicesFor(["fiscal_information"]);
  window.history.pushState(null, "", "/fiscal/documents?document=abc");

  await render(<App help={emptyHelp} services={services} />);

  await expect.poll(location).toBe("/fiscal/documents");
  expect(services.issuedFiscalDocumentsScreen.fetchIssuedFiscalDocument).not.toHaveBeenCalled();
});

test("shows the sections of Configuración to a person with fiscal configuration", async () => {
  const services = servicesFor(["fiscal_configuration_area"]);
  window.history.pushState(null, "", "/fiscal/settings");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("tab", { name: "Configuración", selected: true }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Emisor", level: 2, exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Domicilios", level: 2, exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Correcciones de reloj" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Nuevo domicilio fiscal" }))
    .toBeVisible();
});

test.each([
  ["/fiscal-tasks", ["fiscal_information"], "/fiscal"],
  [
    "/fiscal-documents?kind=credit_note&number=41",
    ["fiscal_information"],
    "/fiscal/documents?kind=credit_note&number=41",
  ],
  [
    "/exceptionality?fiscalAddress=fiscal-address-warehouse&year=2025",
    ["fiscal_information"],
    "/fiscal/caea?fiscalAddress=fiscal-address-warehouse&year=2025",
  ],
  ["/points-of-sale", ["fiscal_configuration_area"], "/fiscal/caea#points-of-sale"],
  ["/fiscal-settings", ["fiscal_configuration_area"], "/fiscal/settings"],
  [
    "/contingency-ticket-rescue",
    ["contingency_ticket_rescue"],
    "/fiscal/caea?assistant=contingency-ticket-rescue",
  ],
] as const)(
  "redirects the old address %s to its tab or section",
  async (old, capabilities, target) => {
    const services = servicesFor([...capabilities]);
    window.history.pushState(null, "", old);

    const screen = await render(<App help={emptyHelp} services={services} />);

    await expect
      .element(screen.getByRole("tablist", { name: "Secciones de Fiscal" }))
      .toBeVisible();
    await expect.poll(location).toBe(target);
  },
);

test("lands on the Puntos de venta section when the old address of the points of sale is opened", async () => {
  const services = servicesFor(["fiscal_configuration_area"]);
  window.history.pushState(null, "", "/points-of-sale");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Puntos de venta" })).toBeVisible();
  expect(window.location.hash).toBe("#points-of-sale");
  await expect
    .element(screen.getByRole("region", { name: "Puntos de venta" }))
    .toHaveAttribute("id", "points-of-sale");
});

test("opens the rescue assistant when the old rescue address is opened", async () => {
  const services = servicesFor(["contingency_ticket_rescue"]);
  window.history.pushState(null, "", "/contingency-ticket-rescue");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("dialog", { name: "Rescate de tickets de contingencia" }))
    .toBeVisible();
});
