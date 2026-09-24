import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import { MyAccountScreen, type MyAccountScreenServices } from "./MyAccountScreen";
import type { Passkey } from "./passkeyApi";

function createServices(overrides: Partial<MyAccountScreenServices> = {}): MyAccountScreenServices {
  return {
    fetchPasskeys: vi.fn(),
    fetchPasskeyRegistrationChallenge: vi.fn(),
    fetchPasskeyRemovalChallenge: vi.fn(),
    registerPasskey: vi.fn(),
    removePasskey: vi.fn(),
    startAuthentication: vi.fn(),
    startRegistration: vi.fn(),
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

const reauthenticationOptions = { challenge: "reauth" } as never;
const registrationOptions = { challenge: "reg" } as never;
const reauthAssertion = { id: "existing-cred" } as never;
const newRegistration = { id: "new-cred" } as never;

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

  await expect.element(screen.getByRole("status")).toBeVisible();
});

test("offers no registration while the passkeys are loading", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("status")).toBeVisible();
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

test("warns an account with no passkey that only a recovery link lets it back in, and offers no registration", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  const screen = await renderScreen(services);

  await expect
    .element(
      screen
        .getByText(
          "No tenés ninguna passkey. Para volver a entrar al backoffice vas a tener que pedir el enlace de recuperación por correo.",
        )
        .first(),
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
  return screen.getByRole("dialog");
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

test("opens the register modal and submits a new passkey, refreshing the list on success", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValueOnce({ kind: "ok", value: [notebook] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();

  vi.mocked(services.fetchPasskeyRegistrationChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions, registrationOptions },
  });
  const dialog = await openRegisterModal(screen);
  await expect
    .element(dialog.getByRole("heading", { name: "Registrar una passkey" }))
    .toBeVisible();

  vi.mocked(services.startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(services.startRegistration).mockResolvedValue(newRegistration);
  vi.mocked(services.registerPasskey).mockResolvedValue({ kind: "ok", value: phone });
  vi.mocked(services.fetchPasskeys).mockResolvedValueOnce({ kind: "ok", value: [notebook, phone] });

  await userEvent.fill(dialog.getByRole("textbox"), "Teléfono de Lucía");
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));

  expect(services.fetchPasskeyRegistrationChallenge).toHaveBeenCalledTimes(1);
  expect(services.startAuthentication).toHaveBeenCalledWith({
    optionsJSON: reauthenticationOptions,
  });
  expect(services.startRegistration).toHaveBeenCalledWith({ optionsJSON: registrationOptions });
  await expect.poll(() => vi.mocked(services.registerPasskey).mock.calls.length).toBe(1);
  expect(services.registerPasskey).toHaveBeenCalledWith(
    reauthAssertion,
    newRegistration,
    "Teléfono de Lucía",
  );

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
});

test("requires a passkey name before registering, without fetching a challenge or calling the API", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  const dialog = await openRegisterModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(dialog.getByText("Ingresá un nombre para la passkey.")).toBeVisible();
  expect(services.fetchPasskeyRegistrationChallenge).not.toHaveBeenCalled();
  expect(services.startAuthentication).not.toHaveBeenCalled();
  expect(services.registerPasskey).not.toHaveBeenCalled();
});

test("rejects a passkey name over 40 characters once trimmed", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  const dialog = await openRegisterModal(screen);

  await userEvent.fill(dialog.getByRole("textbox"), "a".repeat(41));
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));

  await expect
    .element(dialog.getByText("El nombre no puede superar los 40 caracteres."))
    .toBeVisible();
  expect(services.fetchPasskeyRegistrationChallenge).not.toHaveBeenCalled();
  expect(services.registerPasskey).not.toHaveBeenCalled();
});

test("shows an attempt-failed notice when the registration challenge fails to fetch, then lets the person retry", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  vi.mocked(services.fetchPasskeyRegistrationChallenge).mockResolvedValueOnce({ kind: "failed" });
  const dialog = await openRegisterModal(screen);

  await userEvent.fill(dialog.getByRole("textbox"), "Teléfono de Lucía");
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(dialog.getByText("No se pudo registrar la passkey")).toBeVisible();
  expect(services.startAuthentication).not.toHaveBeenCalled();
  expect(services.registerPasskey).not.toHaveBeenCalled();

  vi.mocked(services.fetchPasskeyRegistrationChallenge).mockResolvedValueOnce({
    kind: "ok",
    value: { reauthenticationOptions, registrationOptions },
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(services.startRegistration).mockResolvedValue(newRegistration);
  vi.mocked(services.registerPasskey).mockResolvedValue({ kind: "ok", value: phone });
  vi.mocked(services.fetchPasskeys).mockResolvedValueOnce({ kind: "ok", value: [notebook, phone] });

  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));

  await expect
    .poll(() => vi.mocked(services.fetchPasskeyRegistrationChallenge).mock.calls.length)
    .toBe(2);
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
});

test("shows a rate-limited notice, instead of a generic attempt-failed one, when the registration challenge is rate limited", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  vi.mocked(services.fetchPasskeyRegistrationChallenge).mockResolvedValueOnce({
    kind: "rate_limited",
    retryAfterSeconds: 60,
  });
  const dialog = await openRegisterModal(screen);

  await userEvent.fill(dialog.getByRole("textbox"), "Teléfono de Lucía");
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
  expect(dialog.getByText("No se pudo registrar la passkey").query()).toBeNull();
  expect(services.startAuthentication).not.toHaveBeenCalled();
});

test("shows a rate-limited notice, instead of a generic attempt-failed one, when registering itself is rate limited", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  vi.mocked(services.fetchPasskeyRegistrationChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions, registrationOptions },
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(services.startRegistration).mockResolvedValue(newRegistration);
  vi.mocked(services.registerPasskey).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 60,
  });
  const dialog = await openRegisterModal(screen);

  await userEvent.fill(dialog.getByRole("textbox"), "Teléfono de Lucía");
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
});

test("lets the person retry, keeping the same challenge, after the browser cancels a registration step", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  vi.mocked(services.fetchPasskeyRegistrationChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions, registrationOptions },
  });
  vi.mocked(services.startAuthentication).mockRejectedValue(new Error("NotAllowedError"));
  const dialog = await openRegisterModal(screen);

  await userEvent.fill(dialog.getByRole("textbox"), "Teléfono de Lucía");
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(dialog.getByText("No se pudo registrar la passkey")).toBeVisible();
  expect(services.fetchPasskeyRegistrationChallenge).toHaveBeenCalledTimes(1);
  expect(services.registerPasskey).not.toHaveBeenCalled();
});

// Every attempt fetches its own challenge (passkeys-registration-route.ts consumes it once it
// reaches the cloud), so a retry after a rejected attempt needs no separate refresh path: the
// next press just fetches another one, the same way the first press did.
test("fetches a fresh challenge on every registration attempt, including a retry after the reauthentication fails to verify", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  vi.mocked(services.fetchPasskeyRegistrationChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions, registrationOptions },
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(services.startRegistration).mockResolvedValue(newRegistration);
  vi.mocked(services.registerPasskey).mockResolvedValueOnce({ kind: "authentication_failed" });
  const dialog = await openRegisterModal(screen);
  await userEvent.fill(dialog.getByRole("textbox"), "Teléfono de Lucía");

  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(dialog.getByText("No se pudo registrar la passkey")).toBeVisible();
  expect(services.fetchPasskeyRegistrationChallenge).toHaveBeenCalledTimes(1);

  vi.mocked(services.registerPasskey).mockResolvedValueOnce({ kind: "ok", value: phone });
  vi.mocked(services.fetchPasskeys).mockResolvedValueOnce({ kind: "ok", value: [notebook, phone] });

  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));

  await expect
    .poll(() => vi.mocked(services.fetchPasskeyRegistrationChallenge).mock.calls.length)
    .toBe(2);
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
});

test("ends the session when the registration challenge finds the session already ended", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  vi.mocked(services.fetchPasskeyRegistrationChallenge).mockResolvedValue({
    kind: "unauthenticated",
  });
  const dialog = await openRegisterModal(screen);

  await userEvent.fill(dialog.getByRole("textbox"), "Teléfono de Lucía");
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("keeps the session open and shows the no-passkey state when the account has no passkey left to reauthenticate with", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValueOnce({ kind: "ok", value: [notebook] });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  vi.mocked(services.fetchPasskeyRegistrationChallenge).mockResolvedValue({ kind: "no_passkey" });
  vi.mocked(services.fetchPasskeys).mockResolvedValueOnce({ kind: "ok", value: [] });
  const dialog = await openRegisterModal(screen);

  await userEvent.fill(dialog.getByRole("textbox"), "Teléfono de Lucía");
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));

  await expect
    .element(
      dialog
        .getByText(
          "No tenés ninguna passkey. Para volver a entrar al backoffice vas a tener que pedir el enlace de recuperación por correo.",
        )
        .first(),
    )
    .toBeVisible();
  expect(services.startAuthentication).not.toHaveBeenCalled();
  await expect.poll(() => vi.mocked(services.fetchPasskeys).mock.calls.length).toBe(2);
  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));
  await expect
    .element(screen.getByRole("button", { name: "Registrar otra passkey" }))
    .toBeDisabled();
  expect(onSessionEnded).not.toHaveBeenCalled();
});

test("ends the session when registering finds the session already ended", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  vi.mocked(services.fetchPasskeyRegistrationChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions, registrationOptions },
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(services.startRegistration).mockResolvedValue(newRegistration);
  vi.mocked(services.registerPasskey).mockResolvedValue({ kind: "unauthenticated" });
  const dialog = await openRegisterModal(screen);

  await userEvent.fill(dialog.getByRole("textbox"), "Teléfono de Lucía");
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("closes the register modal without calling the API on cancel", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  const dialog = await openRegisterModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.fetchPasskeyRegistrationChallenge).not.toHaveBeenCalled();
  expect(services.registerPasskey).not.toHaveBeenCalled();
});

test("has no accessibility violations with the register modal open", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  await openRegisterModal(screen);

  await expectNoAccessibilityViolations(document.body);
});

async function openRemoveModal(screen: Awaited<ReturnType<typeof renderScreen>>, name: string) {
  await userEvent.click(screen.getByRole("button", { name: `Dar de baja la passkey «${name}»` }));
  return screen.getByRole("dialog");
}

test("opens the remove modal ready, with the confirmation text visible without waiting on a challenge fetch", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook, phone] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
  vi.mocked(services.fetchPasskeyRemovalChallenge).mockReturnValue(new Promise(() => {}));

  const dialog = await openRemoveModal(screen, "Notebook del local");

  await expect
    .element(dialog.getByRole("heading", { name: "¿Dar de baja la passkey?" }))
    .toBeVisible();
  await expect
    .element(dialog.getByText("«Notebook del local» deja de servir para entrar."))
    .toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Dar de baja" })).toBeEnabled();
  expect(services.fetchPasskeyRemovalChallenge).not.toHaveBeenCalled();
});

test("opens the remove modal naming the passkey and confirms the removal, refreshing the list on success", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValueOnce({ kind: "ok", value: [notebook, phone] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();

  vi.mocked(services.fetchPasskeyRemovalChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  const dialog = await openRemoveModal(screen, "Notebook del local");
  await expect
    .element(dialog.getByRole("heading", { name: "¿Dar de baja la passkey?" }))
    .toBeVisible();
  await expect
    .element(dialog.getByText("«Notebook del local» deja de servir para entrar."))
    .toBeVisible();

  vi.mocked(services.startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(services.removePasskey).mockResolvedValue({ kind: "ok" });
  vi.mocked(services.fetchPasskeys).mockResolvedValueOnce({ kind: "ok", value: [phone] });

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  expect(services.fetchPasskeyRemovalChallenge).toHaveBeenCalledTimes(1);
  expect(services.startAuthentication).toHaveBeenCalledWith({
    optionsJSON: reauthenticationOptions,
  });
  await expect.poll(() => vi.mocked(services.removePasskey).mock.calls.length).toBe(1);
  expect(services.removePasskey).toHaveBeenCalledWith("pk-1", reauthAssertion);
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(screen.getByText("Notebook del local").query()).toBeNull();
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
  vi.mocked(services.fetchPasskeyRemovalChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(reauthAssertion);
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

test("treats a not_found removal as already done and refreshes the list", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValueOnce({ kind: "ok", value: [notebook, phone] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
  vi.mocked(services.fetchPasskeyRemovalChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(services.removePasskey).mockResolvedValue({ kind: "not_found" });
  vi.mocked(services.fetchPasskeys).mockResolvedValueOnce({ kind: "ok", value: [phone] });
  const dialog = await openRemoveModal(screen, "Notebook del local");

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(screen.getByText("Notebook del local").query()).toBeNull();
});

test("lets the person retry the removal, keeping the same challenge, after the browser cancels", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook, phone] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
  vi.mocked(services.fetchPasskeyRemovalChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(services.startAuthentication).mockRejectedValue(new Error("NotAllowedError"));
  const dialog = await openRemoveModal(screen, "Notebook del local");

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect.element(dialog.getByText("No se pudo dar de baja la passkey")).toBeVisible();
  expect(services.fetchPasskeyRemovalChallenge).toHaveBeenCalledTimes(1);
  expect(services.removePasskey).not.toHaveBeenCalled();
});

test("shows an attempt-failed notice when the removal challenge fails to fetch, then lets the person retry", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook, phone] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
  vi.mocked(services.fetchPasskeyRemovalChallenge).mockResolvedValueOnce({ kind: "failed" });
  const dialog = await openRemoveModal(screen, "Notebook del local");

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect.element(dialog.getByText("No se pudo dar de baja la passkey")).toBeVisible();
  expect(services.startAuthentication).not.toHaveBeenCalled();
  expect(services.removePasskey).not.toHaveBeenCalled();

  vi.mocked(services.fetchPasskeyRemovalChallenge).mockResolvedValueOnce({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(services.removePasskey).mockResolvedValue({ kind: "ok" });
  vi.mocked(services.fetchPasskeys).mockResolvedValueOnce({ kind: "ok", value: [phone] });

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect
    .poll(() => vi.mocked(services.fetchPasskeyRemovalChallenge).mock.calls.length)
    .toBe(2);
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
});

test("shows a rate-limited notice, instead of a generic attempt-failed one, when the removal challenge is rate limited", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook, phone] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
  vi.mocked(services.fetchPasskeyRemovalChallenge).mockResolvedValueOnce({
    kind: "rate_limited",
    retryAfterSeconds: 60,
  });
  const dialog = await openRemoveModal(screen, "Notebook del local");

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
  expect(dialog.getByText("No se pudo dar de baja la passkey").query()).toBeNull();
  expect(services.startAuthentication).not.toHaveBeenCalled();
});

test("shows a rate-limited notice, instead of a generic attempt-failed one, when removing itself is rate limited", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook, phone] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
  vi.mocked(services.fetchPasskeyRemovalChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(services.removePasskey).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 60,
  });
  const dialog = await openRemoveModal(screen, "Notebook del local");

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
});

// Every attempt fetches its own challenge (passkeys-removal-route.ts consumes it once it reaches
// the cloud), so a retry after a rejected attempt needs no separate refresh path: the next press
// just fetches another one, the same way the first press did.
test("fetches a fresh challenge on every removal attempt, including a retry after the reauthentication fails to verify", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook, phone] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
  vi.mocked(services.fetchPasskeyRemovalChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(services.removePasskey).mockResolvedValueOnce({ kind: "authentication_failed" });
  const dialog = await openRemoveModal(screen, "Notebook del local");

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect.element(dialog.getByText("No se pudo dar de baja la passkey")).toBeVisible();
  expect(services.fetchPasskeyRemovalChallenge).toHaveBeenCalledTimes(1);

  vi.mocked(services.removePasskey).mockResolvedValueOnce({ kind: "ok" });
  vi.mocked(services.fetchPasskeys).mockResolvedValueOnce({ kind: "ok", value: [phone] });

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect
    .poll(() => vi.mocked(services.fetchPasskeyRemovalChallenge).mock.calls.length)
    .toBe(2);
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
});

test("ends the session when the removal challenge finds the session already ended", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook, phone] });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
  vi.mocked(services.fetchPasskeyRemovalChallenge).mockResolvedValue({ kind: "unauthenticated" });
  const dialog = await openRemoveModal(screen, "Notebook del local");

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("ends the session when removing finds the session already ended", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook, phone] });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
  vi.mocked(services.fetchPasskeyRemovalChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(services.removePasskey).mockResolvedValue({ kind: "unauthenticated" });
  const dialog = await openRemoveModal(screen, "Notebook del local");

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("has no accessibility violations with the remove modal open", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  await openRemoveModal(screen, "Notebook del local");

  await expectNoAccessibilityViolations(document.body);
});
