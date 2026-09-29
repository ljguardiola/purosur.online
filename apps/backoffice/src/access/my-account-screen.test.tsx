import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { MyAccountScreen } from "./my-account-screen";
import type { MyAccountScreenServices } from "./my-account-services";
import type { Passkey } from "./passkey-api";

function createServices(overrides: Partial<MyAccountScreenServices> = {}): MyAccountScreenServices {
  return {
    fetchPasskeys: vi.fn(),
    fetchPasskeyRegistrationChallenge: vi.fn(),
    registerPasskey: vi.fn(),
    removePasskey: vi.fn(),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
    startRegistration: vi.fn(),
    signalUnknownCredential: vi.fn(),
    ...overrides,
  };
}

const NOW = () => new Date("2026-09-23T12:00:00.000Z");

const notebook: Passkey = {
  id: "pk-1",
  name: "Notebook del local",
  createdAt: "2026-08-02T12:00:00.000Z",
  // 09:12 in America/Argentina/Buenos_Aires (UTC-3), same calendar day as NOW below.
  lastUsedAt: "2026-09-23T12:12:00.000Z",
};
const phone: Passkey = {
  id: "pk-2",
  name: "Teléfono de Lucía",
  createdAt: "2026-08-10T12:00:00.000Z",
  lastUsedAt: null,
};

const registrationOptions = { challenge: "reg", rp: { id: "purosur.online" } } as never;
const newRegistration = { id: "new-cred" } as never;
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function renderScreen(services: MyAccountScreenServices, onSessionEnded: () => void = () => {}) {
  return render(
    <main>
      <MyAccountScreen
        displayName="Lucía Pérez"
        onSessionEnded={onSessionEnded}
        now={NOW}
        services={services}
      />
    </main>,
  );
}

test("shows a loading state before the passkeys resolve", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("status")).toHaveTextContent("Cargando…");
});

test("offers no registration while the passkeys are loading", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("status")).toHaveTextContent("Cargando…");
  await expect
    .element(screen.getByRole("button", { name: "Registrar otra passkey" }))
    .toBeDisabled();
});

test("shows the breadcrumb, heading and each passkey with its registration and last-use detail", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook, phone] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Configuración · Lucía Pérez")).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  await expect
    .element(screen.getByText("Registrada el 02/08/2026 · último uso hoy 09:12"))
    .toBeVisible();
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
  await expect.element(screen.getByText("Registrada el 10/08/2026")).toBeVisible();
});

test("lists a single passkey without flagging the account", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  expect(screen.getByRole("status").query()).toBeNull();
});

test("shows an empty state telling an account with no passkey that only a recovery link lets it back in, and offers no registration", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No tenés ninguna passkey")).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Para volver a entrar al backoffice vas a tener que pedir el enlace de recuperación por correo.",
      ),
    )
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Registrar otra passkey" }))
    .toBeDisabled();
});

test("shows a load error with a retry action when the passkeys fail to load", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValueOnce({ kind: "failed" });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir tus passkeys")).toBeVisible();

  vi.mocked(services.fetchPasskeys).mockResolvedValueOnce({ kind: "ok", value: [notebook] });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
});

test("retrying a failed load starts again from the loading placeholder", async () => {
  const services = createServices();
  const retry = deferred<Awaited<ReturnType<typeof services.fetchPasskeys>>>();
  vi.mocked(services.fetchPasskeys)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir tus passkeys")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("No pudimos abrir tus passkeys")).not.toBeInTheDocument();
  await expect.element(screen.getByRole("status")).toHaveTextContent("Cargando…");
  retry.resolve({ kind: "ok", value: [notebook] });
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
});

test("Registrar otra passkey is disabled after the passkeys fail to load", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValueOnce({ kind: "failed" });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir tus passkeys")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Registrar otra passkey" }))
    .toBeDisabled();
});

test("removing a passkey keeps the shown ones and Registrar otra passkey available while the list is read again", async () => {
  const services = createServices();
  const refresh = deferred<Awaited<ReturnType<typeof services.fetchPasskeys>>>();
  vi.mocked(services.fetchPasskeys)
    .mockResolvedValueOnce({ kind: "ok", value: [notebook, phone] })
    .mockReturnValueOnce(refresh.promise);
  vi.mocked(services.removePasskey).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
  const dialog = await openRemoveModal(screen, "Notebook del local");

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(screen.getByText("Notebook del local").query()).not.toBeNull();
  expect(screen.getByText("Cargando…").query()).toBeNull();
  await expect
    .element(screen.getByRole("button", { name: "Registrar otra passkey" }))
    .toBeEnabled();
  refresh.resolve({ kind: "ok", value: [phone] });
  await expect.element(screen.getByText("Notebook del local")).not.toBeInTheDocument();
  expect(services.fetchPasskeys).toHaveBeenCalledTimes(2);
});

test("shows a rate-limited notice, instead of a generic load error, when the passkeys request is rate limited", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValueOnce({
    kind: "rate_limited",
    retryAfterSeconds: 90,
  });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
  expect(screen.getByText("No pudimos abrir tus passkeys").query()).toBeNull();

  vi.mocked(services.fetchPasskeys).mockResolvedValueOnce({ kind: "ok", value: [notebook] });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
});

test("ends the session when the passkeys request finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("has no accessibility violations once the passkeys are loaded", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();

  await expectNoAccessibilityViolations(document.body);
});

async function openRegisterModal(screen: Awaited<ReturnType<typeof renderScreen>>) {
  await userEvent.click(screen.getByRole("button", { name: "Registrar otra passkey" }));
  return screen.getByRole("dialog", { name: "Registrar una passkey" });
}

test("opens the register modal ready, with the name field visible without waiting on a challenge fetch", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  vi.mocked(services.fetchPasskeyRegistrationChallenge).mockReturnValue(new Promise(() => {}));

  const dialog = await openRegisterModal(screen);

  await expect
    .element(dialog.getByRole("heading", { name: "Registrar una passkey" }))
    .toBeVisible();
  await expect.element(dialog.getByRole("textbox")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Registrar la passkey" })).toBeEnabled();
  expect(services.fetchPasskeyRegistrationChallenge).not.toHaveBeenCalled();
});

test("registers a passkey directly, without the authorization modal, when the session already has one", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValueOnce({ kind: "ok", value: [notebook] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  const dialog = await openRegisterModal(screen);

  vi.mocked(services.fetchPasskeyRegistrationChallenge).mockResolvedValue({
    kind: "ok",
    value: { registrationOptions },
  });
  vi.mocked(services.startRegistration).mockResolvedValue(newRegistration);
  vi.mocked(services.registerPasskey).mockResolvedValue({ kind: "ok" });
  vi.mocked(services.fetchPasskeys).mockResolvedValueOnce({ kind: "ok", value: [notebook, phone] });

  await userEvent.fill(dialog.getByRole("textbox"), "Teléfono de Lucía");
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));

  expect(services.fetchPasskeyRegistrationChallenge).toHaveBeenCalledTimes(1);
  expect(services.startRegistration).toHaveBeenCalledWith({ optionsJSON: registrationOptions });
  await expect.poll(() => vi.mocked(services.registerPasskey).mock.calls.length).toBe(1);
  expect(services.registerPasskey).toHaveBeenCalledWith(newRegistration, "Teléfono de Lucía");

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
});

async function openRemoveModal(screen: Awaited<ReturnType<typeof renderScreen>>, name: string) {
  await userEvent.click(screen.getByRole("button", { name: `Dar de baja la passkey «${name}»` }));
  return screen.getByRole("dialog", { name: "¿Dar de baja la passkey?" });
}

test("opens the remove modal ready, with the confirmation text visible without waiting on a challenge fetch", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook, phone] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();

  const dialog = await openRemoveModal(screen, "Notebook del local");

  await expect
    .element(dialog.getByRole("heading", { name: "¿Dar de baja la passkey?" }))
    .toBeVisible();
  await expect
    .element(dialog.getByText("«Notebook del local» deja de servir para entrar."))
    .toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Dar de baja" })).toBeEnabled();
});

test("opens the remove modal naming the passkey and confirms the removal directly, refreshing the list on success", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValueOnce({ kind: "ok", value: [notebook, phone] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();

  vi.mocked(services.removePasskey).mockResolvedValue({ kind: "ok" });
  vi.mocked(services.fetchPasskeys).mockResolvedValueOnce({ kind: "ok", value: [phone] });
  const dialog = await openRemoveModal(screen, "Notebook del local");

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect.poll(() => vi.mocked(services.removePasskey).mock.calls.length).toBe(1);
  expect(services.removePasskey).toHaveBeenCalledWith("pk-1");
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(screen.getByText("Notebook del local").query()).toBeNull();
});

test("dates each passkey's last use against the time the list was last refreshed", async () => {
  const services = createServices();
  let current = new Date("2026-09-23T12:00:00.000Z");
  vi.mocked(services.fetchPasskeys).mockResolvedValueOnce({ kind: "ok", value: [notebook, phone] });
  const screen = await render(
    <main>
      <MyAccountScreen
        displayName="Lucía Pérez"
        onSessionEnded={() => {}}
        now={() => current}
        services={services}
      />
    </main>,
  );
  await expect
    .element(screen.getByText("Registrada el 02/08/2026 · último uso hoy 09:12"))
    .toBeVisible();

  current = new Date("2026-09-24T12:00:00.000Z");
  vi.mocked(services.removePasskey).mockResolvedValue({ kind: "ok" });
  vi.mocked(services.fetchPasskeys).mockResolvedValueOnce({ kind: "ok", value: [notebook] });
  const dialog = await openRemoveModal(screen, "Teléfono de Lucía");
  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect
    .element(screen.getByText("Registrada el 02/08/2026 · último uso el 23/09/2026 09:12"))
    .toBeVisible();
});

test("dates each passkey's last use against the time the list was loaded, not the time a re-render draws it", async () => {
  const services = createServices();
  let current = new Date("2026-09-23T12:00:00.000Z");
  const onSessionEnded = () => {};
  vi.mocked(services.fetchPasskeys).mockResolvedValueOnce({ kind: "ok", value: [notebook, phone] });
  const screenFor = (now: () => Date) => (
    <main>
      <MyAccountScreen
        displayName="Lucía Pérez"
        onSessionEnded={onSessionEnded}
        now={now}
        services={services}
      />
    </main>
  );
  const screen = await render(screenFor(() => current));
  await expect
    .element(screen.getByText("Registrada el 02/08/2026 · último uso hoy 09:12"))
    .toBeVisible();

  current = new Date("2026-09-24T12:00:00.000Z");
  await screen.rerender(screenFor(() => current));

  expect(
    screen.getByText("Registrada el 02/08/2026 · último uso hoy 09:12").query(),
  ).not.toBeNull();
  expect(services.fetchPasskeys).toHaveBeenCalledTimes(1);
});

test("warns in the remove modal when it is the account's only passkey", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();

  const dialog = await openRemoveModal(screen, "Notebook del local");

  await expect
    .element(
      dialog.getByText(
        "«Notebook del local» deja de servir para entrar. Es tu única passkey: para volver a entrar vas a tener que pedir el enlace de recuperación por correo.",
      ),
    )
    .toBeVisible();
});

test("does not warn in the remove modal when it is not the only passkey", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook, phone] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();

  const dialog = await openRemoveModal(screen, "Notebook del local");

  expect(dialog.getByText(/única passkey/).query()).toBeNull();
});

async function removeNotebookThenRefresh(
  refreshOutcome: Awaited<ReturnType<MyAccountScreenServices["fetchPasskeys"]>>,
  onSessionEnded: () => void = () => {},
) {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValueOnce({ kind: "ok", value: [notebook, phone] });
  const screen = await renderScreen(services, onSessionEnded);
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
  vi.mocked(services.removePasskey).mockResolvedValue({ kind: "ok" });
  vi.mocked(services.fetchPasskeys).mockResolvedValueOnce(refreshOutcome);
  const dialog = await openRemoveModal(screen, "Notebook del local");

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  return { screen, services };
}

test("ends the session when refreshing the list after a removal finds no open session", async () => {
  const onSessionEnded = vi.fn();

  await removeNotebookThenRefresh({ kind: "unauthenticated" }, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("shows the load error with a retry action when refreshing the list after a removal fails", async () => {
  const { screen, services } = await removeNotebookThenRefresh({ kind: "failed" });

  await expect.element(screen.getByText("No pudimos abrir tus passkeys")).toBeVisible();
  expect(screen.getByText("Notebook del local").query()).toBeNull();

  vi.mocked(services.fetchPasskeys).mockResolvedValueOnce({ kind: "ok", value: [phone] });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
});
