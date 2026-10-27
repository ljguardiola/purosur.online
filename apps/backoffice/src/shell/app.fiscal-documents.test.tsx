import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import {
  issuedFiscalDocuments,
  noIssuedFiscalDocuments,
} from "../fiscal/test-support/issued-fiscal-documents-fixtures";
import { openSession } from "../sessions/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { registers } from "./test-support/report-fixtures";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens([
  "/",
  "/account",
  "/help",
  "/fiscal-documents",
  "/fiscal-tasks",
  "/points-of-sale",
]);

beforeEach(resetPageState);

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
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.issuedFiscalDocumentsScreen.fetchIssuedFiscalDocuments).mockResolvedValue({
    kind: "ok",
    value: issuedFiscalDocuments,
  });
  vi.mocked(services.issuedFiscalDocumentsScreen.fetchFiscalRegisters).mockResolvedValue({
    kind: "ok",
    value: registers,
  });
  return services;
}

test("opens the issued documents for a user who only sees fiscal information, first in the FISCAL group", async () => {
  const services = servicesFor(["fiscal_information"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("link", { name: "Caja" }));
  const sections = screen.getByRole("navigation", { name: "Caja y fiscal" });
  await userEvent.click(sections.getByRole("link", { name: "Comprobantes" }));

  await expect
    .element(screen.getByRole("heading", { name: "Comprobantes y notas de crédito", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/fiscal-documents");
  expect(document.title).toBe("Comprobantes · Puro Sur");
  await expect.element(screen.getByText("Factura C 00003-00001247")).toBeVisible();
  await expect.element(sections.getByText("FISCAL", { exact: true })).toBeVisible();
  await expect
    .element(sections.getByRole("link", { name: "Comprobantes" }))
    .toHaveAttribute("aria-current", "page");
  expect(sections.getByRole("link", { name: "Puntos de venta" }).query()).toBeNull();
});

test("lists the issued documents before the points of sale and the fiscal settings", async () => {
  const services = servicesFor(["cash_area", "fiscal_information"]);
  window.history.pushState(null, "", "/fiscal-documents");

  const screen = await render(<App help={emptyHelp} services={services} />);

  const sections = screen.getByRole("navigation", { name: "Caja y fiscal" });
  await expect.element(sections.getByRole("link", { name: "Comprobantes" })).toBeVisible();
  const labels = sections
    .getByRole("link")
    .all()
    .map((link) => link.element().textContent?.trim());
  expect(labels).toEqual([
    "Tareas fiscales",
    "Comprobantes",
    "Puntos de venta",
    "Configuración fiscal",
  ]);
});

test("does not offer the issued documents to a user who cannot see fiscal information", async () => {
  const services = servicesFor(["cash_area"]);
  window.history.pushState(null, "", "/points-of-sale");

  const screen = await render(<App help={emptyHelp} services={services} />);

  const sections = screen.getByRole("navigation", { name: "Caja y fiscal" });
  await expect.element(sections.getByRole("link", { name: "Puntos de venta" })).toBeVisible();
  expect(sections.getByRole("link", { name: "Comprobantes" }).query()).toBeNull();
});

test("sends a user who cannot see fiscal information and opens /fiscal-documents to Mi cuenta, without loading it", async () => {
  const services = servicesFor(["cash_area"]);
  window.history.pushState(null, "", "/fiscal-documents");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(services.issuedFiscalDocumentsScreen.fetchIssuedFiscalDocuments).not.toHaveBeenCalled();
});

test("offers the registers of the fiscal listing, not those of the reports, in the Caja filter", async () => {
  const services = servicesFor(["fiscal_information"]);
  window.history.pushState(null, "", "/fiscal-documents");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));

  await expect.element(screen.getByRole("option", { name: "Caja del fondo" })).toBeVisible();
  expect(services.issuedFiscalDocumentsScreen.fetchFiscalRegisters).toHaveBeenCalled();
  expect(services.reportRegisterFilter.fetchReportRegisters).not.toHaveBeenCalled();
});

test("keeps the filters in the URL and asks the cloud again when one changes", async () => {
  const services = servicesFor(["fiscal_information"]);
  window.history.pushState(null, "", "/fiscal-documents?kind=receipt&page=2");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .poll(
      () =>
        vi.mocked(services.issuedFiscalDocumentsScreen.fetchIssuedFiscalDocuments).mock.lastCall,
    )
    .toEqual([{ kind: "receipt", page: 2 }]);
  vi.mocked(services.issuedFiscalDocumentsScreen.fetchIssuedFiscalDocuments).mockResolvedValue({
    kind: "ok",
    value: noIssuedFiscalDocuments,
  });
  await userEvent.click(screen.getByRole("button", { name: /Tipo:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Notas de crédito" }));

  await expect
    .poll(() => new URLSearchParams(window.location.search).get("kind"))
    .toBe("credit_note");
  expect(new URLSearchParams(window.location.search).has("page")).toBe(false);
});

test("rewrites a URL with values the listing does not offer as the same URL written its own way", async () => {
  const services = servicesFor(["fiscal_information"]);
  window.history.pushState(null, "", "/fiscal-documents?kind=ALL&page=1");

  await render(<App help={emptyHelp} services={services} />);

  await expect.poll(() => window.location.search).toBe("");
});
