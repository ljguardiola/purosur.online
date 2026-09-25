import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import {
  FiscalConfigurationScreen,
  type FiscalConfigurationScreenServices,
} from "./FiscalConfigurationScreen";
import type { IssuerIdentification } from "./issuerIdentificationApi";

function createServices(
  overrides: Partial<FiscalConfigurationScreenServices> = {},
): FiscalConfigurationScreenServices {
  return {
    fetchIssuerIdentification: vi.fn(),
    saveIssuerIdentification: vi.fn(),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
    ...overrides,
  };
}

const authorizationOptions = { challenge: "session-auth" } as never;
const assertion = { id: "existing-cred" } as never;

/** Sets up an already-granted passkey authorization, for a test that isn't about that ceremony itself. */
function grantAuthorization(services: FiscalConfigurationScreenServices) {
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: authorizationOptions,
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(assertion);
  vi.mocked(services.authorizeSession).mockResolvedValue({ kind: "ok" });
}

const complete: IssuerIdentification = {
  legalName: "María Laura Fernández",
  grossIncomeRegistration: "1284531-06",
  activityStartDate: "2019-03-01",
  authorizedCuit: "27-28453196-0",
  taxStatus: "Responsable Monotributo",
  version: 1,
};

const incomplete: IssuerIdentification = {
  legalName: null,
  grossIncomeRegistration: null,
  activityStartDate: null,
  authorizedCuit: "27-28453196-0",
  taxStatus: "Responsable Monotributo",
  version: 1,
};

function renderScreen(
  services: FiscalConfigurationScreenServices,
  onSessionEnded: () => void = () => {},
) {
  return render(
    <main>
      <FiscalConfigurationScreen services={services} onSessionEnded={onSessionEnded} />
    </main>,
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
  await expect.element(screen.getByText("María Laura Fernández")).toBeVisible();
  await expect.element(screen.getByText("27-28453196-0")).toBeVisible();
  await expect.element(screen.getByText("Responsable Monotributo")).toBeVisible();
  await expect.element(screen.getByText("1284531-06")).toBeVisible();
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
  await expect.element(screen.getByText("27-28453196-0")).toBeVisible();
  await expect.element(screen.getByText("Responsable Monotributo")).toBeVisible();
});

test("shows a load error, and Reintentar loads again", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValueOnce({ kind: "failed" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir la configuración fiscal")).toBeVisible();

  vi.mocked(services.fetchIssuerIdentification).mockResolvedValueOnce({
    kind: "ok",
    value: complete,
  });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("María Laura Fernández")).toBeVisible();
});

test("sends to Mi cuenta when the load comes back forbidden", async () => {
  window.history.pushState(null, "", "/cash-and-fiscal/fiscal-configuration");
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  window.history.pushState(null, "", "/");
});

test("ends the session when the load finds it closed", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("Editar opens the modal prefilled, with CUIT and tax status as plain text, not inputs", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({ kind: "ok", value: complete });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("María Laura Fernández")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Editar" }));

  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("heading", { name: "Identificación del emisor" }))
    .toBeVisible();
  await expect
    .element(dialog.getByRole("textbox", { name: /^Razón social/ }))
    .toHaveValue("María Laura Fernández");
  await expect
    .element(dialog.getByRole("textbox", { name: /^Ingresos Brutos/ }))
    .toHaveValue("1284531-06");
  const dateGroup = dialog.getByRole("group", { name: "Inicio de actividades" }).element();
  expect(dateGroup.textContent).toContain("1");
  expect(dateGroup.textContent).toContain("3");
  expect(dateGroup.textContent).toContain("2019");
  expect(dialog.getByRole("textbox", { name: "CUIT" }).query()).toBeNull();
  expect(dialog.getByRole("textbox", { name: "Condición frente al IVA" }).query()).toBeNull();
  await expect.element(dialog.getByText("27-28453196-0")).toBeVisible();
  await expect.element(dialog.getByText("Responsable Monotributo")).toBeVisible();
});

test("prefills the modal empty for an incomplete identification", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({
    kind: "ok",
    value: incomplete,
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("button", { name: "Editar" })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Editar" }));

  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("textbox", { name: /^Razón social/ })).toHaveValue("");
  await expect.element(dialog.getByRole("textbox", { name: /^Ingresos Brutos/ })).toHaveValue("");
});

test("Cancelar closes the modal without calling saveIssuerIdentification", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({ kind: "ok", value: complete });
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.saveIssuerIdentification).not.toHaveBeenCalled();
});

test("requires the three fields, without calling the API", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({
    kind: "ok",
    value: incomplete,
  });
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Ingresá la razón social.")).toBeVisible();
  await expect.element(dialog.getByText("Ingresá el número de Ingresos Brutos.")).toBeVisible();
  await expect.element(dialog.getByText("Elegí la fecha de inicio de actividades.")).toBeVisible();
  expect(services.saveIssuerIdentification).not.toHaveBeenCalled();
});

test("saves the edit directly, without the authorization modal, when the session already has one, and updates the screen", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({ kind: "ok", value: complete });
  vi.mocked(services.saveIssuerIdentification).mockResolvedValue({
    kind: "ok",
    value: { ...complete, legalName: "Nueva Razón Social SRL", version: 2 },
  });
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
    legalName: "Nueva Razón Social SRL",
    grossIncomeRegistration: "1284531-06",
    activityStartDate: "2019-03-01",
    version: 1,
  });
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Nueva Razón Social SRL")).toBeVisible();
});

test("opens the authorization modal on authorization_required, then authorizes and retries the save", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({ kind: "ok", value: complete });
  vi.mocked(services.saveIssuerIdentification).mockResolvedValueOnce({
    kind: "authorization_required",
  });
  grantAuthorization(services);
  vi.mocked(services.saveIssuerIdentification).mockResolvedValueOnce({
    kind: "ok",
    value: { ...complete, version: 2 },
  });
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await expect.element(dialog.getByRole("heading", { name: "Autorizá este cambio" })).toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => vi.mocked(services.saveIssuerIdentification).mock.calls.length).toBe(2);
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
});

test("shows a field error from the server and keeps the modal open", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({ kind: "ok", value: complete });
  vi.mocked(services.saveIssuerIdentification).mockResolvedValue({
    kind: "validation_failed",
    field: "legal_name",
  });
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Ingresá como mucho 200 caracteres.")).toBeVisible();
});

test("shows a stale_version notice, and Recargar refetches so the second save sends the new version", async () => {
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

  vi.mocked(services.saveIssuerIdentification).mockResolvedValueOnce({
    kind: "ok",
    value: { ...reloaded, version: 6 },
  });
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.saveIssuerIdentification).mock.calls.length).toBe(2);
  expect(services.saveIssuerIdentification).toHaveBeenLastCalledWith({
    legalName: "Recargado SRL",
    grossIncomeRegistration: "1284531-06",
    activityStartDate: "2019-03-01",
    version: 5,
  });
});

test("sends to Mi cuenta when saving comes back forbidden", async () => {
  window.history.pushState(null, "", "/cash-and-fiscal/fiscal-configuration");
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({ kind: "ok", value: complete });
  vi.mocked(services.saveIssuerIdentification).mockResolvedValue({ kind: "forbidden" });
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  window.history.pushState(null, "", "/");
});

test("ends the session when saving comes back unauthenticated", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({ kind: "ok", value: complete });
  vi.mocked(services.saveIssuerIdentification).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
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
