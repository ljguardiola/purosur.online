import type { BuyerIdentificationThreshold } from "@purosur/domain";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { FiscalConfigurationScreen } from "./fiscal-configuration-screen";
import type { FiscalConfigurationScreenServices } from "./fiscal-configuration-services";
import { fiscalKey } from "./fiscal-queries";
import type { IssuerIdentification } from "./issuer-identification-api";

const inEffect: BuyerIdentificationThreshold = {
  id: "threshold-1",
  amount: 1_000_000_000,
  validFrom: "2026-01-01",
};

function createServices(
  overrides: Partial<FiscalConfigurationScreenServices> = {},
): FiscalConfigurationScreenServices {
  return {
    fetchIssuerIdentification: vi.fn(),
    saveIssuerIdentification: vi.fn(),
    fetchBuyerIdentificationThresholds: vi
      .fn()
      .mockResolvedValue({ kind: "ok", value: [inEffect] }),
    recordBuyerIdentificationThreshold: vi.fn(),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

type FetchOutcome = Awaited<
  ReturnType<FiscalConfigurationScreenServices["fetchIssuerIdentification"]>
>;

function FetchesInFlight() {
  return <output aria-label="Lecturas en curso">{useIsFetching()}</output>;
}

function RefreshFiscal() {
  const client = useQueryClient();
  return (
    <button type="button" onClick={() => void client.invalidateQueries({ queryKey: fiscalKey })}>
      Refrescar
    </button>
  );
}

function refreshFiscal(screen: Awaited<ReturnType<typeof renderScreen>>) {
  (screen.getByRole("button", { name: "Refrescar" }).element() as HTMLElement).click();
}

const complete: IssuerIdentification = {
  legalName: "Comercio de Prueba",
  grossIncomeRegistration: "0000000-00",
  activityStartDate: "2019-03-01",
  authorizedCuit: "20-00000000-1",
  taxStatus: "Responsable Monotributo",
  version: 1,
};

const incomplete: IssuerIdentification = {
  legalName: null,
  grossIncomeRegistration: null,
  activityStartDate: null,
  authorizedCuit: "20-00000000-1",
  taxStatus: "Responsable Monotributo",
  version: 1,
};

const aDayOfOctober = () => new Date("2026-10-15T12:00:00-03:00");

function renderScreen(
  services: FiscalConfigurationScreenServices,
  onSessionEnded: () => void = () => {},
  now: () => Date = aDayOfOctober,
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <FiscalConfigurationScreen services={services} onSessionEnded={onSessionEnded} now={now} />
        <FetchesInFlight />
        <RefreshFiscal />
      </main>
    </FieldSizeProvider>,
  );
}

test("shows the breadcrumb, heading, and the complete issuer identification", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({ kind: "ok", value: complete });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Caja y fiscal · Fiscal")).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Configuración fiscal", level: 1 }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Identificación del emisor", level: 2 }))
    .toBeVisible();
  await expect.element(screen.getByText("Comercio de Prueba")).toBeVisible();
  await expect.element(screen.getByText("20-00000000-1")).toBeVisible();
  await expect.element(screen.getByText("Responsable Monotributo")).toBeVisible();
  await expect.element(screen.getByText("0000000-00")).toBeVisible();
  await expect.element(screen.getByText("01/03/2019")).toBeVisible();
  await expect
    .element(screen.getByText("Lo imprime cada factura y nota de crédito."))
    .toBeVisible();
  expect(screen.getByText("Sin cargar").query()).toBeNull();
});

test("shows the incomplete notice and Sin cargar for each missing value", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({
    kind: "ok",
    value: incomplete,
  });

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByText("Las cajas no están emitiendo facturas ni notas de crédito"))
    .toBeVisible();
  await expect
    .element(
      screen.getByText("Hasta que se carguen los datos que faltan. Las ventas se siguen cobrando."),
    )
    .toBeVisible();
  expect(screen.getByText("Sin cargar").elements().length).toBe(3);
  await expect.element(screen.getByText("20-00000000-1")).toBeVisible();
  await expect.element(screen.getByText("Responsable Monotributo")).toBeVisible();
});

test("shows a placeholder instead of a loading line while the issuer identification loads", async () => {
  const services = createServices();
  const firstLoad = deferred<FetchOutcome>();
  vi.mocked(services.fetchIssuerIdentification).mockReturnValue(firstLoad.promise);

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Cargando…")).toHaveTextContent("Cargando…");
  expect(screen.container.querySelector('[aria-hidden="true"]')?.children.length).toBeGreaterThan(
    0,
  );
  expect(screen.container.querySelector("p[role=status]")).toBeNull();
  expect(screen.getByText("Sin cargar").query()).toBeNull();
  firstLoad.resolve({ kind: "ok", value: complete });
  await expect.element(screen.getByText("Comercio de Prueba")).toBeVisible();
});

test("shows a load failure, and Reintentar goes back to the placeholder before loading again", async () => {
  const services = createServices();
  const retry = deferred<FetchOutcome>();
  vi.mocked(services.fetchIssuerIdentification)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir la configuración fiscal")).toBeVisible();
  await expect.element(screen.getByText("Probá de nuevo en unos minutos.")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByText("No pudimos abrir la configuración fiscal"))
    .not.toBeInTheDocument();
  await expect.element(screen.getByText("Cargando…")).toHaveTextContent("Cargando…");
  retry.resolve({ kind: "ok", value: complete });
  await expect.element(screen.getByText("Comercio de Prueba")).toBeVisible();
});

test("shows the rate-limited notice with the time to wait and a retry action", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
});

test("Editar is disabled while the issuer identification loads and after it fails to load", async () => {
  const services = createServices();
  const firstLoad = deferred<FetchOutcome>();
  vi.mocked(services.fetchIssuerIdentification).mockReturnValueOnce(firstLoad.promise);
  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("button", { name: "Editar" })).toBeDisabled();

  firstLoad.resolve({ kind: "failed" });
  await expect.element(screen.getByText("No pudimos abrir la configuración fiscal")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Editar" })).toBeDisabled();
});

test("sends to Mi cuenta when the load comes back forbidden", async () => {
  window.history.pushState(null, "", "/fiscal-settings");
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
  window.history.pushState(null, "", "/");
});

test("ends the session when the load finds it closed", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("Editar opens the issuer identification modal with the loaded values", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({ kind: "ok", value: complete });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Comercio de Prueba")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Editar" }));

  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("heading", { name: "Identificación del emisor" }))
    .toBeVisible();
  await expect
    .element(dialog.getByRole("textbox", { name: /^Razón social/ }))
    .toHaveValue("Comercio de Prueba");
});

test("saves the edit directly, without the authorization modal, when the session already has one, and shows what the read after it returns", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification)
    .mockResolvedValueOnce({ kind: "ok", value: complete })
    .mockResolvedValueOnce({
      kind: "ok",
      value: { ...complete, legalName: "Nueva Razón Social SRL", version: 2 },
    });
  vi.mocked(services.saveIssuerIdentification).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Razón social/ }),
    "Nueva Razón Social SRL",
  );

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.saveIssuerIdentification).mock.calls.length).toBe(1);
  expect(services.saveIssuerIdentification).toHaveBeenCalledWith({
    legal_name: "Nueva Razón Social SRL",
    gross_income_registration: "0000000-00",
    activity_start_date: "2019-03-01",
    version: 1,
  });
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Nueva Razón Social SRL")).toBeVisible();
  expect(services.fetchIssuerIdentification).toHaveBeenCalledTimes(2);
});

test("keeps the modal open and Guardar disabled while the issuer identification is read again after a save", async () => {
  const services = createServices();
  const refresh = deferred<FetchOutcome>();
  vi.mocked(services.fetchIssuerIdentification)
    .mockResolvedValueOnce({ kind: "ok", value: complete })
    .mockReturnValueOnce(refresh.promise);
  vi.mocked(services.saveIssuerIdentification).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.fetchIssuerIdentification).mock.calls.length).toBe(2);
  await expect.element(dialog.getByRole("button", { name: "Guardar los cambios" })).toBeDisabled();
  await expect.element(dialog).toBeVisible();
  refresh.resolve({ kind: "ok", value: { ...complete, legalName: "Leída SRL", version: 2 } });
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Leída SRL")).toBeVisible();
});

test("shows a load failure instead of the data when reading the issuer identification again after a save fails", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification)
    .mockResolvedValueOnce({ kind: "ok", value: complete })
    .mockResolvedValueOnce({ kind: "failed" });
  vi.mocked(services.saveIssuerIdentification).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(screen.getByText("No pudimos abrir la configuración fiscal")).toBeVisible();
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(screen.getByText("Comercio de Prueba").query()).toBeNull();
});

test("a second save sends the version the read after the first save returned", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification)
    .mockResolvedValueOnce({ kind: "ok", value: complete })
    .mockResolvedValueOnce({ kind: "ok", value: { ...complete, version: 2 } });
  vi.mocked(services.saveIssuerIdentification).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Guardar los cambios" }),
  );
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();

  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Guardar los cambios" }),
  );

  await expect.poll(() => vi.mocked(services.saveIssuerIdentification).mock.calls.length).toBe(2);
  expect(services.saveIssuerIdentification).toHaveBeenLastCalledWith(
    expect.objectContaining({ version: 2 }),
  );
});

test("shows a load failure instead of the modal when Recargar cannot read the issuer identification", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification)
    .mockResolvedValueOnce({ kind: "ok", value: complete })
    .mockResolvedValueOnce({ kind: "failed" });
  vi.mocked(services.saveIssuerIdentification).mockResolvedValueOnce({ kind: "stale_version" });
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await expect
    .element(dialog.getByText("La identificación del emisor cambió mientras la editabas"))
    .toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect.element(screen.getByText("No pudimos abrir la configuración fiscal")).toBeVisible();
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
});

test("keeps the modal closed once Reintentar loads the data a failed Recargar could not read", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification)
    .mockResolvedValueOnce({ kind: "ok", value: complete })
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: { ...complete, version: 2 } });
  vi.mocked(services.saveIssuerIdentification).mockResolvedValueOnce({ kind: "stale_version" });
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await expect
    .element(dialog.getByText("La identificación del emisor cambió mientras la editabas"))
    .toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));
  await expect.element(screen.getByText("No pudimos abrir la configuración fiscal")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Comercio de Prueba")).toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("keeps what Recargar brought on the screen after Cancelar, so reopening saves with the reloaded version", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValueOnce({
    kind: "ok",
    value: complete,
  });
  vi.mocked(services.saveIssuerIdentification).mockResolvedValueOnce({ kind: "stale_version" });
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await expect
    .element(dialog.getByText("La identificación del emisor cambió mientras la editabas"))
    .toBeVisible();

  const reloaded: IssuerIdentification = { ...complete, legalName: "Recargado SRL", version: 5 };
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValueOnce({
    kind: "ok",
    value: reloaded,
  });
  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));
  await expect
    .element(dialog.getByRole("textbox", { name: /^Razón social/ }))
    .toHaveValue("Recargado SRL");
  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();

  await expect.element(screen.getByText("Recargado SRL")).toBeVisible();

  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({
    kind: "ok",
    value: { ...reloaded, version: 6 },
  });
  vi.mocked(services.saveIssuerIdentification).mockResolvedValueOnce({ kind: "ok" });
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Guardar los cambios" }),
  );

  await expect.poll(() => vi.mocked(services.saveIssuerIdentification).mock.calls.length).toBe(2);
  expect(services.saveIssuerIdentification).toHaveBeenLastCalledWith({
    legal_name: "Recargado SRL",
    gross_income_registration: "0000000-00",
    activity_start_date: "2019-03-01",
    version: 5,
  });
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
});

test("keeps every value of the form, edited or not, when a refresh lands with different data while an edit is unsaved", async () => {
  const services = createServices();
  const refresh = deferred<FetchOutcome>();
  vi.mocked(services.fetchIssuerIdentification)
    .mockResolvedValueOnce({ kind: "ok", value: complete })
    .mockReturnValueOnce(refresh.promise);
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  const dialog = screen.getByRole("dialog");
  const legalName = dialog.getByRole("textbox", { name: /^Razón social/ });
  await userEvent.fill(legalName, "Editada SRL");
  refreshFiscal(screen);
  await expect.element(screen.getByLabelText("Lecturas en curso")).toHaveTextContent("1");

  refresh.resolve({
    kind: "ok",
    value: { ...complete, grossIncomeRegistration: "999", version: 2 },
  });

  await expect.element(screen.getByLabelText("Lecturas en curso")).toHaveTextContent("0");
  await expect.element(legalName).toHaveValue("Editada SRL");
  await expect
    .element(dialog.getByRole("textbox", { name: /^Ingresos Brutos/ }))
    .toHaveValue("0000000-00");
});

test("shows the refreshed data in the modal over values the person has not edited", async () => {
  const services = createServices();
  const refresh = deferred<FetchOutcome>();
  vi.mocked(services.fetchIssuerIdentification)
    .mockResolvedValueOnce({ kind: "ok", value: complete })
    .mockReturnValueOnce(refresh.promise);
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  const dialog = screen.getByRole("dialog");
  refreshFiscal(screen);

  refresh.resolve({ kind: "ok", value: { ...complete, legalName: "Refrescada SRL", version: 2 } });

  await expect
    .element(dialog.getByRole("textbox", { name: /^Razón social/ }))
    .toHaveValue("Refrescada SRL");
});

test("after an unsaved edit and a refresh, the save sends the version the form was last seeded from", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification)
    .mockResolvedValueOnce({ kind: "ok", value: complete })
    .mockResolvedValueOnce({ kind: "ok", value: { ...complete, version: 2 } });
  vi.mocked(services.saveIssuerIdentification).mockResolvedValueOnce({ kind: "stale_version" });
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Razón social/ }), "Editada SRL");
  refreshFiscal(screen);
  await expect.poll(() => vi.mocked(services.fetchIssuerIdentification).mock.calls.length).toBe(2);
  await expect.element(screen.getByLabelText("Lecturas en curso")).toHaveTextContent("0");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.saveIssuerIdentification).mock.calls.length).toBe(1);
  expect(services.saveIssuerIdentification).toHaveBeenCalledWith(
    expect.objectContaining({ legal_name: "Editada SRL", version: 1 }),
  );
});

test("has no accessibility violations once loaded", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({ kind: "ok", value: complete });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("heading", { name: "Configuración fiscal", level: 1 }))
    .toBeVisible();

  await expectNoAccessibilityViolations(document.body);
});

test("shows the buyer-identification threshold in effect today under the issuer identification", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({ kind: "ok", value: complete });
  vi.mocked(services.fetchBuyerIdentificationThresholds).mockResolvedValue({
    kind: "ok",
    value: [inEffect],
  });

  const screen = await renderScreen(services);

  const headings = screen.getByRole("heading", { level: 2 }).elements();
  expect(headings.map((heading) => heading.textContent)).toEqual([
    "Identificación del emisor",
    "Umbral de identificación del comprador",
  ]);
  await expect.element(screen.getByText("$ 10.000.000,00")).toBeVisible();
});

test("counts the threshold in effect from the screen's clock", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({ kind: "ok", value: complete });
  vi.mocked(services.fetchBuyerIdentificationThresholds).mockResolvedValue({
    kind: "ok",
    value: [inEffect],
  });

  const screen = await renderScreen(
    services,
    () => {},
    () => new Date("2025-12-31T12:00:00-03:00"),
  );

  await expect.element(screen.getByText("Sin cargar")).toBeVisible();
  await expect.element(screen.getByText("Próximo")).toBeVisible();
});

test("a threshold that fails to load leaves the issuer identification on screen, and each section retries on its own", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({ kind: "ok", value: complete });
  vi.mocked(services.fetchBuyerIdentificationThresholds)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: [inEffect] });

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByText("No pudimos abrir el umbral de identificación del comprador"))
    .toBeVisible();
  await expect.element(screen.getByText("Comercio de Prueba")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Cargar un umbral nuevo" }))
    .toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Editar" })).toBeEnabled();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("$ 10.000.000,00")).toBeVisible();
  expect(services.fetchIssuerIdentification).toHaveBeenCalledTimes(1);
});

test("the issuer identification failing to load leaves the threshold on screen", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({ kind: "failed" });
  vi.mocked(services.fetchBuyerIdentificationThresholds).mockResolvedValue({
    kind: "ok",
    value: [inEffect],
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir la configuración fiscal")).toBeVisible();
  await expect.element(screen.getByText("$ 10.000.000,00")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Cargar un umbral nuevo" }))
    .toBeEnabled();
});

test("ends the session when the thresholds read finds it closed", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({ kind: "ok", value: complete });
  vi.mocked(services.fetchBuyerIdentificationThresholds).mockResolvedValue({
    kind: "unauthenticated",
  });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("Cargar un umbral nuevo opens its own modal, and Editar opens the issuer one", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({ kind: "ok", value: complete });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Comercio de Prueba")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Cargar un umbral nuevo" }));

  await expect
    .element(screen.getByRole("dialog").getByRole("heading", { name: "Cargar un umbral nuevo" }))
    .toBeVisible();
  expect(
    screen.getByRole("heading", { name: "Identificación del emisor", level: 2 }).query(),
  ).not.toBeNull();
  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();

  await userEvent.click(screen.getByRole("button", { name: "Editar" }));

  await expect
    .element(screen.getByRole("dialog").getByRole("heading", { name: "Identificación del emisor" }))
    .toBeVisible();
});

test("recording a threshold closes the modal, shows the threshold the read after it returns, and says it was loaded", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({ kind: "ok", value: complete });
  vi.mocked(services.fetchBuyerIdentificationThresholds)
    .mockResolvedValueOnce({ kind: "ok", value: [inEffect] })
    .mockResolvedValue({
      kind: "ok",
      value: [{ id: "threshold-2", amount: 1_500_000_000, validFrom: "2026-12-01" }, inEffect],
    });
  vi.mocked(services.recordBuyerIdentificationThreshold).mockResolvedValue({
    kind: "ok",
    value: { id: "threshold-2", amount: 1_500_000_000, validFrom: "2026-12-01" },
  });
  await page.viewport(1440, 1000);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("$ 10.000.000,00")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Cargar un umbral nuevo" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Importe/ }), "15.000.000,00");
  await userEvent.click(
    dialog
      .getByRole("group", { name: /^Vigente desde/ })
      .getByRole("spinbutton")
      .first(),
  );
  await userEvent.keyboard("01122026");

  await userEvent.click(dialog.getByRole("button", { name: "Cargar el umbral" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Próximo")).toBeVisible();
  await expect.element(screen.getByText("$ 15.000.000,00")).toBeVisible();
  await expect.element(screen.getByText("Umbral cargado")).toBeVisible();
  await expect.element(screen.getByText("Rige desde el 01/12/2026.")).toBeVisible();
  expect(services.fetchBuyerIdentificationThresholds).toHaveBeenCalledTimes(2);
  expect(services.fetchIssuerIdentification).toHaveBeenCalledTimes(2);
});

test("a refresh of the fiscal data reads the thresholds again without hiding them", async () => {
  const services = createServices();
  const refresh =
    deferred<
      Awaited<ReturnType<FiscalConfigurationScreenServices["fetchBuyerIdentificationThresholds"]>>
    >();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({ kind: "ok", value: complete });
  vi.mocked(services.fetchBuyerIdentificationThresholds)
    .mockResolvedValueOnce({ kind: "ok", value: [inEffect] })
    .mockReturnValueOnce(refresh.promise);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("$ 10.000.000,00")).toBeVisible();

  refreshFiscal(screen);
  await expect.element(screen.getByLabelText("Lecturas en curso")).toHaveTextContent("1");

  expect(screen.getByText("$ 10.000.000,00").query()).not.toBeNull();
  expect(screen.getByText("Cargando…").query()).toBeNull();
  await expect
    .element(screen.getByRole("button", { name: "Cargar un umbral nuevo" }))
    .toBeEnabled();
  refresh.resolve({ kind: "ok", value: [{ ...inEffect, amount: 2_000_000_000 }] });
  await expect.element(screen.getByText("$ 20.000.000,00")).toBeVisible();
});
