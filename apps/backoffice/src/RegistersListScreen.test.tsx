import { StrictMode } from "react";
import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import { RegistersListScreen, type RegistersListScreenServices } from "./RegistersListScreen";
import type { RegisterSummary } from "./registersApi";

function createServices(
  overrides: Partial<RegistersListScreenServices> = {},
): RegistersListScreenServices {
  return {
    fetchRegisters: vi.fn(),
    createRegister: vi.fn(),
    emitEnrollmentCode: vi.fn(),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
    ...overrides,
  };
}

const caja1: RegisterSummary = { id: "register-1", name: "Caja 1", pendingCode: null };
const caja2: RegisterSummary = {
  id: "register-2",
  name: "Caja 2",
  pendingCode: { issuedAt: "2026-09-25T11:56:00.000Z", expiresAt: "2026-09-25T12:11:00.000Z" },
};

const NOW = () => new Date("2026-09-25T12:00:00.000Z");

const authorizationOptions = { challenge: "session-auth" } as never;
const assertion = { id: "existing-cred" } as never;

/** Sets up an already-granted passkey authorization, for a test that isn't about that ceremony itself. */
function grantAuthorization(services: RegistersListScreenServices) {
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: authorizationOptions,
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(assertion);
  vi.mocked(services.authorizeSession).mockResolvedValue({ kind: "ok" });
}

function renderScreen(
  services: RegistersListScreenServices,
  onSessionEnded: () => void = () => {},
) {
  return render(
    <main>
      <RegistersListScreen services={services} onSessionEnded={onSessionEnded} now={NOW} />
    </main>,
  );
}

test("shows the breadcrumb, heading, each register's name and count", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [caja1, caja2] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Configuración")).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Cajas registradoras", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  await expect.element(screen.getByText("Caja 2")).toBeVisible();
  await expect.element(screen.getByText("2 cajas")).toBeVisible();
});

test("shows Sin instalación and Sin configurar for every register, and the Esperando alta tag", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [caja1] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Sin instalación")).toBeVisible();
  await expect.element(screen.getByText("Sin configurar")).toBeVisible();
  await expect.element(screen.getByText("Esperando alta")).toBeVisible();
});

test("shows the elapsed and remaining time for a register with a pending code", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [caja2] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Código emitido hace 4 minutos")).toBeVisible();
  await expect.element(screen.getByText("Vence en 11 minutos")).toBeVisible();
});

test("shows recién for a code issued less than a minute ago", async () => {
  const services = createServices();
  const justIssued: RegisterSummary = {
    id: "register-3",
    name: "Caja 3",
    pendingCode: { issuedAt: "2026-09-25T11:59:40.000Z", expiresAt: "2026-09-25T12:14:40.000Z" },
  };
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [justIssued] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Código emitido recién")).toBeVisible();
});

test("stops showing a pending code once it expires while the screen stays open", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [caja2] });
  let current = new Date("2026-09-25T12:00:00.000Z");
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  try {
    const screen = await render(
      <main>
        <RegistersListScreen services={services} onSessionEnded={() => {}} now={() => current} />
      </main>,
    );
    await expect.element(screen.getByText("Vence en 11 minutos")).toBeVisible();

    current = new Date("2026-09-25T12:11:00.000Z");
    vi.advanceTimersByTime(30_000);

    await expect.poll(() => screen.getByText(/^Vence en/).query()).toBeNull();
    await expect.poll(() => screen.getByText(/^Código emitido/).query()).toBeNull();
    await expect.element(screen.getByText("—")).toBeVisible();
  } finally {
    vi.useRealTimers();
  }
});

test("shows an empty state when there are no registers yet", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Todavía no hay cajas registradoras")).toBeVisible();
});

test("shows a load error with a retry action when the registers fail to load", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "failed" });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir las cajas registradoras")).toBeVisible();

  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [caja1] });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("1 caja")).toBeVisible();
});

test("shows the rate-limited notice with a retry action", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
});

test("navigates to Mi cuenta when the registers request comes back forbidden", async () => {
  window.history.pushState(null, "", "/settings/registers");
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  window.history.pushState(null, "", "/");
});

test("ends the session when the registers request finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

async function openNewRegisterModal(screen: Awaited<ReturnType<typeof renderScreen>>) {
  await userEvent.click(screen.getByRole("button", { name: "Nueva caja" }));
  return screen.getByRole("dialog");
}

test("opens the create modal, and cancel closes it without calling the API", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Todavía no hay cajas registradoras")).toBeVisible();

  const dialog = await openNewRegisterModal(screen);
  await expect.element(dialog.getByRole("heading", { name: "Nueva caja" })).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.createRegister).not.toHaveBeenCalled();
});

test("creates a register and shows it in the list", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [caja1] });
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({
    kind: "ok",
    value: [caja1, { id: "register-3", name: "Caja 3", pendingCode: null }],
  });
  vi.mocked(services.createRegister).mockResolvedValue({
    kind: "ok",
    value: { id: "register-3", name: "Caja 3" },
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 caja")).toBeVisible();
  const dialog = await openNewRegisterModal(screen);

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre de la caja/ }), "Caja 3");
  await userEvent.click(dialog.getByRole("button", { name: "Crear la caja" }));

  await expect.poll(() => vi.mocked(services.createRegister).mock.calls.length).toBe(1);
  expect(services.createRegister).toHaveBeenCalledWith({ name: "Caja 3" });
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Caja 3")).toBeVisible();
  await expect.element(screen.getByText("2 cajas")).toBeVisible();
});

test("shows a created register in the same order the server lists registers", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [caja2] });
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [caja1, caja2] });
  vi.mocked(services.createRegister).mockResolvedValue({
    kind: "ok",
    value: { id: caja1.id, name: caja1.name },
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 caja")).toBeVisible();
  const dialog = await openNewRegisterModal(screen);

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre de la caja/ }), "Caja 1");
  await userEvent.click(dialog.getByRole("button", { name: "Crear la caja" }));

  await expect.element(screen.getByText("2 cajas")).toBeVisible();
  const rowNames = screen
    .getByRole("row")
    .all()
    .map((row) => row.element().textContent ?? "")
    .filter((text) => text.includes("Caja"))
    .map((text) => text.match(/Caja \d/)?.[0]);
  expect(rowNames).toEqual(["Caja 1", "Caja 2"]);
});

test("requires a name before submitting the create modal, without calling the API", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Todavía no hay cajas registradoras")).toBeVisible();
  const dialog = await openNewRegisterModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Crear la caja" }));

  await expect.element(dialog.getByText("Ingresá el nombre de la caja.")).toBeVisible();
  expect(services.createRegister).not.toHaveBeenCalled();
});

test("shows the name-taken error on create and does not add the register to the list", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [caja1] });
  vi.mocked(services.createRegister).mockResolvedValue({ kind: "name_taken" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 caja")).toBeVisible();
  const dialog = await openNewRegisterModal(screen);

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre de la caja/ }), "caja 1");
  await userEvent.click(dialog.getByRole("button", { name: "Crear la caja" }));

  await expect.element(dialog.getByText("Ya existe una caja con este nombre.")).toBeVisible();
  await expect.element(screen.getByRole("dialog")).toBeVisible();
  await expect.element(screen.getByText("1 caja")).toBeVisible();
});

test("opens the authorization modal on create's authorization_required, then authorizes and retries", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [] });
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({
    kind: "ok",
    value: [{ id: "register-3", name: "Caja 3", pendingCode: null }],
  });
  vi.mocked(services.createRegister).mockResolvedValueOnce({ kind: "authorization_required" });
  grantAuthorization(services);
  vi.mocked(services.createRegister).mockResolvedValueOnce({
    kind: "ok",
    value: { id: "register-3", name: "Caja 3" },
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Todavía no hay cajas registradoras")).toBeVisible();
  const dialog = await openNewRegisterModal(screen);

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre de la caja/ }), "Caja 3");
  await userEvent.click(dialog.getByRole("button", { name: "Crear la caja" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect.element(authDialog).toBeVisible();
  await expect
    .element(
      authDialog.getByText("Crear una caja necesita tu autorización. Confirmala con tu passkey."),
    )
    .toBeVisible();

  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => vi.mocked(services.createRegister).mock.calls.length).toBe(2);
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Caja 3")).toBeVisible();
});

async function openEmitModal(screen: Awaited<ReturnType<typeof renderScreen>>, name: string) {
  await userEvent.click(screen.getByRole("button", { name: `Emitir código de alta para ${name}` }));
  return screen.getByRole("dialog", { name: "Código de alta" });
}

test("emitting a code shows it grouped in fours, with the expiry note and description", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [caja1] });
  vi.mocked(services.emitEnrollmentCode).mockResolvedValue({
    kind: "ok",
    value: { code: "P4NX7KWE2QRT8MZD", expiresAt: "2026-09-25T12:15:00.000Z" },
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Caja 1")).toBeVisible();

  const dialog = await openEmitModal(screen, "Caja 1");

  expect(services.emitEnrollmentCode).toHaveBeenCalledWith("register-1");
  await expect.element(dialog.getByText("P4NX 7KWE 2QRT 8MZD")).toBeVisible();
  await expect.element(dialog.getByText("Vence en 15 minutos · se usa una sola vez")).toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "En la notebook nueva, al abrir la caja por primera vez, se escribe este código. Después de 5 intentos equivocados deja de servir y hay que emitir otro.",
      ),
    )
    .toBeVisible();
});

test("under StrictMode, clicking the row action emits the code exactly once and shows that call's code", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [caja1] });
  vi.mocked(services.emitEnrollmentCode).mockResolvedValue({
    kind: "ok",
    value: { code: "P4NX7KWE2QRT8MZD", expiresAt: "2026-09-25T12:15:00.000Z" },
  });
  const screen = await render(
    <StrictMode>
      <main>
        <RegistersListScreen services={services} onSessionEnded={() => {}} now={NOW} />
      </main>
    </StrictMode>,
  );
  await expect.element(screen.getByText("Caja 1")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Emitir código de alta para Caja 1" }));

  const dialog = screen.getByRole("dialog", { name: "Código de alta" });
  await expect.element(dialog.getByText("P4NX 7KWE 2QRT 8MZD")).toBeVisible();
  expect(services.emitEnrollmentCode).toHaveBeenCalledTimes(1);
});

test("Listo closes the code modal and refreshes the list", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [caja1] });
  vi.mocked(services.emitEnrollmentCode).mockResolvedValue({
    kind: "ok",
    value: { code: "P4NX7KWE2QRT8MZD", expiresAt: "2026-09-25T12:15:00.000Z" },
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  const dialog = await openEmitModal(screen, "Caja 1");
  await expect.element(dialog.getByText("P4NX 7KWE 2QRT 8MZD")).toBeVisible();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [caja2] });

  await userEvent.click(dialog.getByRole("button", { name: "Listo" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchRegisters).mock.calls.length).toBe(2);
  await expect.element(screen.getByText("Caja 2")).toBeVisible();
});

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

test("while the code is being emitted, neither the close button nor Escape dismisses the modal", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [caja1] });
  const pendingEmission =
    deferred<Awaited<ReturnType<RegistersListScreenServices["emitEnrollmentCode"]>>>();
  vi.mocked(services.emitEnrollmentCode).mockReturnValue(pendingEmission.promise);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Caja 1")).toBeVisible();

  const dialog = await openEmitModal(screen, "Caja 1");
  await expect.element(dialog.getByText("Emitiendo el código…")).toBeVisible();

  expect(dialog.getByRole("button", { name: "Cerrar" }).query()).toBeNull();
  await userEvent.keyboard("{Escape}");
  await expect.element(dialog).toBeVisible();

  pendingEmission.resolve({
    kind: "ok",
    value: { code: "P4NX7KWE2QRT8MZD", expiresAt: "2026-09-25T12:15:00.000Z" },
  });
  await expect.element(dialog.getByText("P4NX 7KWE 2QRT 8MZD")).toBeVisible();
});

test("closing an issued code's modal with the close button refreshes the list", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [caja1] });
  vi.mocked(services.emitEnrollmentCode).mockResolvedValue({
    kind: "ok",
    value: { code: "P4NX7KWE2QRT8MZD", expiresAt: "2026-09-25T12:15:00.000Z" },
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  const dialog = await openEmitModal(screen, "Caja 1");
  await expect.element(dialog.getByText("P4NX 7KWE 2QRT 8MZD")).toBeVisible();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [caja2] });

  // The modal is wider than the default phone-sized browser-mode viewport, which would leave its
  // close button outside it and unclickable.
  await page.viewport(1280, 900);
  try {
    await userEvent.click(dialog.getByRole("button", { name: "Cerrar" }));
  } finally {
    await page.viewport(414, 896);
  }

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchRegisters).mock.calls.length).toBe(2);
  await expect.element(screen.getByText("Caja 2")).toBeVisible();
});

test("closing an issued code's modal with Escape refreshes the list", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [caja1] });
  vi.mocked(services.emitEnrollmentCode).mockResolvedValue({
    kind: "ok",
    value: { code: "P4NX7KWE2QRT8MZD", expiresAt: "2026-09-25T12:15:00.000Z" },
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  const dialog = await openEmitModal(screen, "Caja 1");
  await expect.element(dialog.getByText("P4NX 7KWE 2QRT 8MZD")).toBeVisible();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [caja2] });

  await userEvent.keyboard("{Escape}");

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchRegisters).mock.calls.length).toBe(2);
  await expect.element(screen.getByText("Caja 2")).toBeVisible();
});

test("closing the code modal after a failed emission refreshes the list", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [caja1] });
  vi.mocked(services.emitEnrollmentCode).mockResolvedValue({ kind: "failed" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  const dialog = await openEmitModal(screen, "Caja 1");
  await expect.element(dialog.getByRole("button", { name: "Reintentar" })).toBeVisible();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [caja2] });

  await userEvent.keyboard("{Escape}");

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchRegisters).mock.calls.length).toBe(2);
  await expect.element(screen.getByText("Caja 2")).toBeVisible();
});

test("closing the code modal after a rate-limited emission refreshes the list", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [caja1] });
  vi.mocked(services.emitEnrollmentCode).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  const dialog = await openEmitModal(screen, "Caja 1");
  await expect.element(dialog.getByRole("button", { name: "Reintentar" })).toBeVisible();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [caja2] });

  await userEvent.keyboard("{Escape}");

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchRegisters).mock.calls.length).toBe(2);
  await expect.element(screen.getByText("Caja 2")).toBeVisible();
});

test("keeps the current rows visible while the list refreshes after closing the code modal", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [caja1] });
  vi.mocked(services.emitEnrollmentCode).mockResolvedValue({
    kind: "ok",
    value: { code: "P4NX7KWE2QRT8MZD", expiresAt: "2026-09-25T12:15:00.000Z" },
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  const dialog = await openEmitModal(screen, "Caja 1");
  await expect.element(dialog.getByText("P4NX 7KWE 2QRT 8MZD")).toBeVisible();
  const pendingRefresh =
    deferred<Awaited<ReturnType<RegistersListScreenServices["fetchRegisters"]>>>();
  vi.mocked(services.fetchRegisters).mockReturnValueOnce(pendingRefresh.promise);

  await userEvent.click(dialog.getByRole("button", { name: "Listo" }));

  await expect.poll(() => vi.mocked(services.fetchRegisters).mock.calls.length).toBe(2);
  await expect.element(screen.getByRole("table")).toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  await expect.element(screen.getByText("1 caja")).toBeVisible();

  pendingRefresh.resolve({ kind: "ok", value: [caja2] });

  await expect.element(screen.getByText("Caja 2")).toBeVisible();
  await expect.element(screen.getByRole("table")).not.toHaveAttribute("aria-busy");
});

test("keeps the current rows visible while the list refreshes after creating a register", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [caja1] });
  const pendingRefresh =
    deferred<Awaited<ReturnType<RegistersListScreenServices["fetchRegisters"]>>>();
  vi.mocked(services.fetchRegisters).mockReturnValueOnce(pendingRefresh.promise);
  vi.mocked(services.createRegister).mockResolvedValue({
    kind: "ok",
    value: { id: "register-3", name: "Caja 3" },
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 caja")).toBeVisible();
  const dialog = await openNewRegisterModal(screen);

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre de la caja/ }), "Caja 3");
  await userEvent.click(dialog.getByRole("button", { name: "Crear la caja" }));

  await expect.poll(() => vi.mocked(services.fetchRegisters).mock.calls.length).toBe(2);
  await expect.element(screen.getByRole("table")).toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText("Caja 1")).toBeVisible();

  pendingRefresh.resolve({
    kind: "ok",
    value: [caja1, { id: "register-3", name: "Caja 3", pendingCode: null }],
  });

  await expect.element(screen.getByText("2 cajas")).toBeVisible();
});

test("shows loading placeholders, not an empty table, while the list refreshes from an empty list", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [] });
  const pendingRefresh =
    deferred<Awaited<ReturnType<RegistersListScreenServices["fetchRegisters"]>>>();
  vi.mocked(services.fetchRegisters).mockReturnValueOnce(pendingRefresh.promise);
  vi.mocked(services.createRegister).mockResolvedValue({
    kind: "ok",
    value: { id: "register-3", name: "Caja 3" },
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Todavía no hay cajas registradoras")).toBeVisible();
  const dialog = await openNewRegisterModal(screen);

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre de la caja/ }), "Caja 3");
  await userEvent.click(dialog.getByRole("button", { name: "Crear la caja" }));

  await expect.poll(() => vi.mocked(services.fetchRegisters).mock.calls.length).toBe(2);
  await expect.element(screen.getByRole("table")).toHaveAttribute("aria-busy", "true");
  expect(screen.getByText("Todavía no hay cajas registradoras").query()).toBeNull();
  expect(screen.getByText("0 cajas").query()).toBeNull();

  pendingRefresh.resolve({
    kind: "ok",
    value: [{ id: "register-3", name: "Caja 3", pendingCode: null }],
  });

  await expect.element(screen.getByText("Caja 3")).toBeVisible();
  await expect.element(screen.getByText("1 caja")).toBeVisible();
});

test("a refresh that fails shows the load error with its retry action, like a failed first load", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [caja1] });
  vi.mocked(services.emitEnrollmentCode).mockResolvedValue({ kind: "failed" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  await openEmitModal(screen, "Caja 1");
  await expect
    .element(screen.getByRole("dialog").getByRole("button", { name: "Reintentar" }))
    .toBeVisible();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "failed" });

  await userEvent.keyboard("{Escape}");

  await expect.element(screen.getByText("No pudimos abrir las cajas registradoras")).toBeVisible();
  expect(screen.getByRole("table").query()).toBeNull();
});

test("opens the authorization modal on emit's authorization_required, then authorizes and shows the code", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [caja1] });
  vi.mocked(services.emitEnrollmentCode).mockResolvedValueOnce({ kind: "authorization_required" });
  grantAuthorization(services);
  vi.mocked(services.emitEnrollmentCode).mockResolvedValueOnce({
    kind: "ok",
    value: { code: "P4NX7KWE2QRT8MZD", expiresAt: "2026-09-25T12:15:00.000Z" },
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Caja 1")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Emitir código de alta para Caja 1" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect.element(authDialog).toBeVisible();
  await expect
    .element(
      authDialog.getByText(
        "Emitir un código de alta necesita tu autorización. Confirmala con tu passkey.",
      ),
    )
    .toBeVisible();

  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => vi.mocked(services.emitEnrollmentCode).mock.calls.length).toBe(2);
  const dialog = screen.getByRole("dialog", { name: "Código de alta" });
  await expect.element(dialog.getByText("P4NX 7KWE 2QRT 8MZD")).toBeVisible();
});

test("closing the code modal after a retry's authorization gets cancelled refreshes the list", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [caja1] });
  vi.mocked(services.emitEnrollmentCode).mockResolvedValueOnce({ kind: "failed" });
  vi.mocked(services.emitEnrollmentCode).mockResolvedValueOnce({ kind: "authorization_required" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  const dialog = await openEmitModal(screen, "Caja 1");
  await expect.element(dialog.getByRole("button", { name: "Reintentar" })).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Reintentar" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect.element(authDialog).toBeVisible();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [caja2] });

  await userEvent.click(authDialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchRegisters).mock.calls.length).toBe(2);
  await expect.element(screen.getByText("Caja 2")).toBeVisible();
});

test("has no accessibility violations once loaded, with the create modal open, and with the code modal open", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [caja1, caja2] });
  vi.mocked(services.emitEnrollmentCode).mockResolvedValue({
    kind: "ok",
    value: { code: "P4NX7KWE2QRT8MZD", expiresAt: "2026-09-25T12:15:00.000Z" },
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("2 cajas")).toBeVisible();
  await expectNoAccessibilityViolations(document.body);

  await openNewRegisterModal(screen);
  await expectNoAccessibilityViolations(document.body);
  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();

  await openEmitModal(screen, "Caja 1");
  await expectNoAccessibilityViolations(document.body);
});
