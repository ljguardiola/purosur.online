import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { expect, test, vi } from "vitest";
import { type Locator, page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { FiscalConfigurationScreen } from "./fiscal-configuration-screen";
import type { FiscalConfigurationScreenServices } from "./fiscal-configuration-services";
import { fiscalKey } from "./fiscal-queries";
import type { IssuerIdentification } from "./issuer-identification-api";

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

const authorizationOptions = { challenge: "session-auth" } as never;
const assertion = { id: "existing-cred" } as never;

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
  now?: () => Date,
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <FiscalConfigurationScreen
          services={services}
          onSessionEnded={onSessionEnded}
          {...(now ? { now } : {})}
        />
        <FetchesInFlight />
        <RefreshFiscal />
      </main>
    </FieldSizeProvider>,
  );
}

const lateEveningInArgentina = () => new Date("2020-09-25T23:30:00-03:00");
const afternoonInArgentina = () => new Date("2020-09-25T15:00:00-03:00");

async function fillIncompleteModal(
  screen: Awaited<ReturnType<typeof renderScreen>>,
  typedDate: string,
) {
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Razón social/ }), "Puro Sur SRL");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Ingresos Brutos/ }), "1284531-06");
  await userEvent.click(
    dialog
      .getByRole("group", { name: /^Inicio de actividades/ })
      .getByRole("spinbutton")
      .first(),
  );
  await userEvent.keyboard(typedDate);
  return dialog;
}

test("refuses a future activity start date, counting today as Argentina's day", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({
    kind: "ok",
    value: incomplete,
  });
  const screen = await renderScreen(services, () => {}, lateEveningInArgentina);
  const dialog = await fillIncompleteModal(screen, "26092020");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("La fecha no puede ser futura.")).toBeVisible();
  expect(services.saveIssuerIdentification).not.toHaveBeenCalled();
});

test("accepts today as the activity start date", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({
    kind: "ok",
    value: incomplete,
  });
  vi.mocked(services.saveIssuerIdentification).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services, () => {}, afternoonInArgentina);
  const dialog = await fillIncompleteModal(screen, "25092020");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.saveIssuerIdentification).mock.calls.length).toBe(1);
  expect(services.saveIssuerIdentification).toHaveBeenCalledWith(
    expect.objectContaining({ activity_start_date: "2020-09-25" }),
  );
});

test("counts today, for refusing a future activity start date, from the time the modal was opened", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({
    kind: "ok",
    value: incomplete,
  });
  let current = new Date("2020-09-25T15:00:00-03:00");
  const onSessionEnded = () => {};
  const screenFor = (now: () => Date) => (
    <FieldSizeProvider size="backoffice">
      <main>
        <FiscalConfigurationScreen services={services} onSessionEnded={onSessionEnded} now={now} />
      </main>
    </FieldSizeProvider>
  );
  const screen = await render(screenFor(() => current));
  const dialog = await fillIncompleteModal(screen, "26092020");
  await expect.element(dialog.getByText("La fecha no puede ser futura.")).toBeVisible();

  current = new Date("2020-09-26T15:00:00-03:00");
  await screen.rerender(screenFor(() => current));
  expect(dialog.getByText("La fecha no puede ser futura.").query()).not.toBeNull();

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  const reopened = await fillIncompleteModal(screen, "26092020");

  await expect
    .element(reopened.getByRole("group", { name: /^Inicio de actividades/ }))
    .toHaveTextContent("26/9/2020");
  expect(reopened.getByText("La fecha no puede ser futura.").query()).toBeNull();
  expect(services.fetchIssuerIdentification).toHaveBeenCalledTimes(1);
});

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
  await expect.element(screen.getByText("María Laura Fernández")).toBeVisible();
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
  await expect.element(screen.getByText("María Laura Fernández")).toBeVisible();
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
  const dateGroup = dialog.getByRole("group", { name: /^Inicio de actividades/ }).element();
  expect(dateGroup.textContent).toContain("1");
  expect(dateGroup.textContent).toContain("3");
  expect(dateGroup.textContent).toContain("2019");
  expect(dialog.getByRole("textbox", { name: "CUIT" }).query()).toBeNull();
  expect(dialog.getByRole("textbox", { name: "Condición frente al IVA" }).query()).toBeNull();
  await expect.element(dialog.getByText("27-28453196-0")).toBeVisible();
  await expect.element(dialog.getByText("Responsable Monotributo")).toBeVisible();
});

test("lines up the Ingresos Brutos and Inicio de actividades labels and boxes, side by side in the same row", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({ kind: "ok", value: complete });
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Editar" }));

  const dialog = screen.getByRole("dialog");
  const grossIncomeLabel = dialog.getByText("Ingresos Brutos").element() as HTMLElement;
  const activityStartLabel = dialog.getByText("Inicio de actividades").element() as HTMLElement;
  const grossIncomeBox = dialog.getByRole("textbox", { name: /^Ingresos Brutos/ }).element()
    .parentElement as HTMLElement;
  const activityStartBox = dialog
    .getByRole("group", { name: /^Inicio de actividades/ })
    .element() as HTMLElement;

  expect(grossIncomeLabel.getBoundingClientRect().top).toBeCloseTo(
    activityStartLabel.getBoundingClientRect().top,
    0,
  );

  const grossIncomeBoxRect = grossIncomeBox.getBoundingClientRect();
  const activityStartBoxRect = activityStartBox.getBoundingClientRect();
  expect(grossIncomeBoxRect.top).toBeCloseTo(activityStartBoxRect.top, 0);
  expect(grossIncomeBoxRect.bottom).toBeCloseTo(activityStartBoxRect.bottom, 0);
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

test("refuses a legal name and an Ingresos Brutos registration that are too long, without calling the API", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({ kind: "ok", value: complete });
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Razón social/ }), "a".repeat(201));
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Ingresos Brutos/ }), "a".repeat(101));

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Ingresá como mucho 200 caracteres.")).toBeVisible();
  await expect.element(dialog.getByText("Ingresá como mucho 100 caracteres.")).toBeVisible();
  expect(services.saveIssuerIdentification).not.toHaveBeenCalled();
});

function dateSegments(dialog: Locator): HTMLElement[] {
  const group = dialog.getByRole("group", { name: /^Inicio de actividades/ }).element();
  return Array.from(group.querySelectorAll('[role="spinbutton"]')) as HTMLElement[];
}

function describedTextOf(element: HTMLElement): string {
  return (element.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter((id) => id !== "")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
}

test("marks the activity start date required, and invalid and described by its own message once refused", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({
    kind: "ok",
    value: incomplete,
  });
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  const dialog = screen.getByRole("dialog");
  for (const segment of dateSegments(dialog)) {
    expect(segment.getAttribute("aria-required")).toBe("true");
  }

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Elegí la fecha de inicio de actividades.")).toBeVisible();
  for (const segment of dateSegments(dialog)) {
    expect(segment.getAttribute("aria-invalid")).toBe("true");
    expect(describedTextOf(segment)).toContain("Elegí la fecha de inicio de actividades.");
  }
  await expectNoAccessibilityViolations(document.body);
});

test("offers no day after Argentina's today in the activity start date's calendar", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({
    kind: "ok",
    value: incomplete,
  });
  await page.viewport(1440, 1000);
  const screen = await renderScreen(services, () => {}, lateEveningInArgentina);
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  await userEvent.click(
    screen
      .getByRole("dialog")
      .getByRole("group", { name: /^Inicio de actividades/ })
      .getByRole("button"),
  );

  const calendar = screen.getByRole("grid");
  await expect.element(calendar).toBeVisible();
  const dayButton = (day: string) =>
    Array.from(calendar.element().querySelectorAll('[role="button"]')).find(
      (cell) => cell.textContent?.trim() === day,
    ) as HTMLElement;
  expect(dayButton("25").getAttribute("aria-disabled")).toBeNull();
  expect(dayButton("26").getAttribute("aria-disabled")).toBe("true");
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
    gross_income_registration: "1284531-06",
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
  expect(screen.getByText("María Laura Fernández").query()).toBeNull();
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

test("opens the authorization modal on authorization_required, then authorizes and retries the save", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({ kind: "ok", value: complete });
  vi.mocked(services.saveIssuerIdentification).mockResolvedValueOnce({
    kind: "authorization_required",
  });
  grantAuthorization(services);
  vi.mocked(services.saveIssuerIdentification).mockResolvedValueOnce({ kind: "ok" });
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await expect.element(dialog.getByRole("heading", { name: "Autorizá este cambio" })).toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "Guardar la identificación del emisor necesita tu autorización. Confirmala con tu passkey.",
      ),
    )
    .toBeVisible();
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

  await expect.element(dialog.getByText("Revisá la razón social.")).toBeVisible();
  expect(dialog.getByText(/Ingresá como mucho/).query()).toBeNull();
});

test("shows a cloud error on the activity start date's field asking to review a date that is not in the future", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({ kind: "ok", value: complete });
  vi.mocked(services.saveIssuerIdentification).mockResolvedValue({
    kind: "validation_failed",
    field: "activity_start_date",
  });
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Revisá la fecha de inicio de actividades.")).toBeVisible();
  expect(dialog.getByText("La fecha no puede ser futura.").query()).toBeNull();
});

test("a cloud error on a field clears as soon as that field is edited", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({ kind: "ok", value: complete });
  vi.mocked(services.saveIssuerIdentification).mockResolvedValue({
    kind: "validation_failed",
    field: "gross_income_registration",
  });
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await expect.element(dialog.getByText("Revisá el número de Ingresos Brutos.")).toBeVisible();

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Ingresos Brutos/ }), "1284531-07");

  await expect
    .element(dialog.getByText("Revisá el número de Ingresos Brutos."))
    .not.toBeInTheDocument();
});

test("shows the attempt-failed notice, and no field error, when the cloud names a field the form does not show", async () => {
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({ kind: "ok", value: complete });
  vi.mocked(services.saveIssuerIdentification).mockResolvedValue({
    kind: "validation_failed",
    field: "version",
  });
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("No se pudo guardar el cambio")).toBeVisible();
  expect(dialog.getByText(/Ingresá como mucho/).query()).toBeNull();
});

test("after a refused save, editing a field checks it again on every change", async () => {
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

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Razón social/ }), "a".repeat(201));

  await expect.element(dialog.getByText("Ingresá como mucho 200 caracteres.")).toBeVisible();
  expect(dialog.getByText("Ingresá la razón social.").query()).toBeNull();
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

  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({
    kind: "ok",
    value: { ...reloaded, version: 6 },
  });
  vi.mocked(services.saveIssuerIdentification).mockResolvedValueOnce({ kind: "ok" });
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.saveIssuerIdentification).mock.calls.length).toBe(2);
  expect(services.saveIssuerIdentification).toHaveBeenLastCalledWith({
    legal_name: "Recargado SRL",
    gross_income_registration: "1284531-06",
    activity_start_date: "2019-03-01",
    version: 5,
  });
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

  await expect.element(screen.getByText("María Laura Fernández")).toBeVisible();
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
    gross_income_registration: "1284531-06",
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
    .toHaveValue("1284531-06");
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

test("sends to Mi cuenta when saving comes back forbidden", async () => {
  window.history.pushState(null, "", "/fiscal-settings");
  const services = createServices();
  vi.mocked(services.fetchIssuerIdentification).mockResolvedValue({ kind: "ok", value: complete });
  vi.mocked(services.saveIssuerIdentification).mockResolvedValue({ kind: "forbidden" });
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => window.location.pathname).toBe("/account");
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
