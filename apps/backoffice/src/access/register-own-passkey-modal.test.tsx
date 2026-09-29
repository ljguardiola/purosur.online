import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  RegisterOwnPasskeyModal,
  type RegisterOwnPasskeyModalServices,
} from "./register-own-passkey-modal";

function createServices(
  overrides: Partial<RegisterOwnPasskeyModalServices> = {},
): RegisterOwnPasskeyModalServices {
  return {
    fetchPasskeyRegistrationChallenge: vi.fn(),
    startRegistration: vi.fn(),
    registerPasskey: vi.fn(),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
    signalUnknownCredential: vi.fn(),
    ...overrides,
  };
}

const registrationOptions = { challenge: "reg", rp: { id: "purosur.online" } } as never;
const newRegistration = { id: "new-cred" } as never;
const authorizationOptions = { challenge: "session-auth" } as never;
const assertion = { id: "existing-cred" } as never;

function grantAuthorization(services: RegisterOwnPasskeyModalServices) {
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: authorizationOptions,
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(assertion);
  vi.mocked(services.authorizeSession).mockResolvedValue({ kind: "ok" });
}

async function renderModal(
  services: RegisterOwnPasskeyModalServices,
  handlers: { onClose?: () => void; onRegistered?: () => void; onSessionEnded?: () => void } = {},
) {
  const screen = await render(
    <main>
      <RegisterOwnPasskeyModal
        open
        onClose={handlers.onClose ?? (() => {})}
        onRegistered={handlers.onRegistered ?? (() => {})}
        onSessionEnded={handlers.onSessionEnded ?? (() => {})}
        services={services}
      />
    </main>,
  );
  const dialog = screen.getByRole("dialog", { name: "Registrar una passkey" });
  await expect.element(dialog).toBeVisible();
  return { screen, dialog };
}

test("asks for the authorization before any creation ceremony when the registration options require one, then runs the ceremony exactly once", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeyRegistrationChallenge).mockResolvedValueOnce({
    kind: "authorization_required",
  });
  vi.mocked(services.fetchPasskeyRegistrationChallenge).mockResolvedValueOnce({
    kind: "ok",
    value: { registrationOptions },
  });
  vi.mocked(services.startRegistration).mockResolvedValue(newRegistration);
  grantAuthorization(services);
  vi.mocked(services.registerPasskey).mockResolvedValue({ kind: "ok" });
  const onRegistered = vi.fn();
  const { screen, dialog } = await renderModal(services, { onRegistered });

  await userEvent.fill(dialog.getByRole("textbox"), "Teléfono de Lucía");
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect.element(authDialog).toBeVisible();
  await expect
    .element(
      authDialog.getByText(
        "Agregar una passkey necesita tu autorización. Confirmala con tu passkey.",
      ),
    )
    .toBeVisible();
  expect(services.startRegistration).not.toHaveBeenCalled();

  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => vi.mocked(services.registerPasskey).mock.calls.length).toBe(1);
  expect(services.fetchPasskeyRegistrationChallenge).toHaveBeenCalledTimes(2);
  expect(services.startRegistration).toHaveBeenCalledTimes(1);
  expect(services.startRegistration).toHaveBeenCalledWith({ optionsJSON: registrationOptions });
  expect(vi.mocked(services.startAuthentication).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(services.startRegistration).mock.invocationCallOrder[0] ?? 0,
  );
  expect(services.registerPasskey).toHaveBeenCalledWith(newRegistration, "Teléfono de Lucía");
  await expect.poll(() => onRegistered.mock.calls.length).toBe(1);
});

test("cancelling the authorization modal keeps the register modal open with its typed name, with no error and no creation ceremony", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeyRegistrationChallenge).mockResolvedValue({
    kind: "authorization_required",
  });
  vi.mocked(services.startRegistration).mockResolvedValue(newRegistration);
  const { screen, dialog } = await renderModal(services);

  await userEvent.fill(dialog.getByRole("textbox"), "Teléfono de Lucía");
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect.element(authDialog).toBeVisible();

  await userEvent.click(authDialog.getByRole("button", { name: "Cancelar" }));

  await expect
    .poll(() => screen.getByRole("dialog", { name: "Autorizá este cambio" }).query())
    .toBeNull();
  await expect
    .element(screen.getByRole("dialog", { name: "Registrar una passkey" }).getByRole("textbox"))
    .toHaveValue("Teléfono de Lucía");
  expect(screen.getByText("No se pudo registrar la passkey").query()).toBeNull();
  expect(services.startRegistration).not.toHaveBeenCalled();
  expect(services.registerPasskey).not.toHaveBeenCalled();
});

test("requires a passkey name before registering, without fetching a challenge or calling the API", async () => {
  const services = createServices();
  const { dialog } = await renderModal(services);

  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(dialog.getByText("Ingresá un nombre para la passkey.")).toBeVisible();
  expect(services.fetchPasskeyRegistrationChallenge).not.toHaveBeenCalled();
  expect(services.registerPasskey).not.toHaveBeenCalled();
});

test("shows the passkey name the cloud refused on the name field, not as a notice", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeyRegistrationChallenge).mockResolvedValue({
    kind: "ok",
    value: { registrationOptions },
  });
  vi.mocked(services.startRegistration).mockResolvedValue(newRegistration);
  vi.mocked(services.registerPasskey).mockResolvedValue({
    kind: "validation_failed",
    field: "passkey_name",
  });
  const { dialog } = await renderModal(services);

  await userEvent.fill(dialog.getByRole("textbox"), "Teléfono de Lucía");
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(dialog.getByText("Revisá el nombre de la passkey.")).toBeVisible();
  expect(dialog.getByText("No se pudo registrar la passkey").query()).toBeNull();
  expect(services.signalUnknownCredential).toHaveBeenCalledWith({
    rpId: "purosur.online",
    credentialId: "new-cred",
  });
});

test("shows an attempt-failed notice when the registration challenge fails to fetch", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeyRegistrationChallenge).mockResolvedValue({ kind: "failed" });
  const { dialog } = await renderModal(services);

  await userEvent.fill(dialog.getByRole("textbox"), "Teléfono de Lucía");
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(dialog.getByText("No se pudo registrar la passkey")).toBeVisible();
  expect(services.startRegistration).not.toHaveBeenCalled();
  expect(services.registerPasskey).not.toHaveBeenCalled();
});

test("shows a rate-limited notice, instead of a generic attempt-failed one, when the registration challenge is rate limited", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeyRegistrationChallenge).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 60,
  });
  const { dialog } = await renderModal(services);

  await userEvent.fill(dialog.getByRole("textbox"), "Teléfono de Lucía");
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
  expect(dialog.getByText("No se pudo registrar la passkey").query()).toBeNull();
  expect(services.startRegistration).not.toHaveBeenCalled();
});

test("shows a rate-limited notice, instead of a generic attempt-failed one, when registering itself is rate limited, and still signals the device to forget the unsaved credential", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeyRegistrationChallenge).mockResolvedValue({
    kind: "ok",
    value: { registrationOptions },
  });
  vi.mocked(services.startRegistration).mockResolvedValue(newRegistration);
  vi.mocked(services.registerPasskey).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 60,
  });
  const { dialog } = await renderModal(services);

  await userEvent.fill(dialog.getByRole("textbox"), "Teléfono de Lucía");
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
  expect(services.signalUnknownCredential).toHaveBeenCalledWith({
    rpId: "purosur.online",
    credentialId: "new-cred",
  });
});

test.each([
  ["validation_failed", { kind: "validation_failed" }],
  ["unauthenticated", { kind: "unauthenticated" }],
  ["authorization_required", { kind: "authorization_required" }],
] as const)(
  "signals the device to forget the credential it just created when registering itself answers %s",
  async (_, outcome) => {
    const services = createServices();
    vi.mocked(services.fetchPasskeyRegistrationChallenge).mockResolvedValue({
      kind: "ok",
      value: { registrationOptions },
    });
    vi.mocked(services.startRegistration).mockResolvedValue(newRegistration);
    vi.mocked(services.registerPasskey).mockResolvedValue(outcome);
    const { dialog } = await renderModal(services);

    await userEvent.fill(dialog.getByRole("textbox"), "Teléfono de Lucía");
    await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));

    await expect.poll(() => vi.mocked(services.signalUnknownCredential).mock.calls.length).toBe(1);
    expect(services.signalUnknownCredential).toHaveBeenCalledWith({
      rpId: "purosur.online",
      credentialId: "new-cred",
    });
  },
);

test("never signals the device when the registration options carry no rp id", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeyRegistrationChallenge).mockResolvedValue({
    kind: "ok",
    value: { registrationOptions: { challenge: "reg", rp: {} } as never },
  });
  vi.mocked(services.startRegistration).mockResolvedValue(newRegistration);
  vi.mocked(services.registerPasskey).mockResolvedValue({ kind: "validation_failed" });
  const { dialog } = await renderModal(services);

  await userEvent.fill(dialog.getByRole("textbox"), "Teléfono de Lucía");
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(dialog.getByText("No se pudo registrar la passkey")).toBeVisible();
  expect(services.signalUnknownCredential).not.toHaveBeenCalled();
});

test("never signals the device when the credential is already registered", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeyRegistrationChallenge).mockResolvedValue({
    kind: "ok",
    value: { registrationOptions },
  });
  vi.mocked(services.startRegistration).mockResolvedValue(newRegistration);
  vi.mocked(services.registerPasskey).mockResolvedValue({ kind: "already_registered" });
  const { dialog } = await renderModal(services);

  await userEvent.fill(dialog.getByRole("textbox"), "Teléfono de Lucía");
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(dialog.getByText("No se pudo registrar la passkey")).toBeVisible();
  expect(services.signalUnknownCredential).not.toHaveBeenCalled();
});

test("never signals the device on a generic registration failure (network error or 5xx)", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeyRegistrationChallenge).mockResolvedValue({
    kind: "ok",
    value: { registrationOptions },
  });
  vi.mocked(services.startRegistration).mockResolvedValue(newRegistration);
  vi.mocked(services.registerPasskey).mockResolvedValue({ kind: "failed" });
  const { dialog } = await renderModal(services);

  await userEvent.fill(dialog.getByRole("textbox"), "Teléfono de Lucía");
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(dialog.getByText("No se pudo registrar la passkey")).toBeVisible();
  expect(services.signalUnknownCredential).not.toHaveBeenCalled();
});

test("shows an attempt-failed notice, without signaling the device, when the browser cancels the registration ceremony itself", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeyRegistrationChallenge).mockResolvedValue({
    kind: "ok",
    value: { registrationOptions },
  });
  vi.mocked(services.startRegistration).mockRejectedValue(new Error("NotAllowedError"));
  const { dialog } = await renderModal(services);

  await userEvent.fill(dialog.getByRole("textbox"), "Teléfono de Lucía");
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(dialog.getByText("No se pudo registrar la passkey")).toBeVisible();
  expect(services.registerPasskey).not.toHaveBeenCalled();
  expect(services.signalUnknownCredential).not.toHaveBeenCalled();
});

test("ends the session when the registration challenge finds the session already ended", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeyRegistrationChallenge).mockResolvedValue({
    kind: "unauthenticated",
  });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal(services, { onSessionEnded });

  await userEvent.fill(dialog.getByRole("textbox"), "Teléfono de Lucía");
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("ends the session when registering itself finds the session already ended", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeyRegistrationChallenge).mockResolvedValue({
    kind: "ok",
    value: { registrationOptions },
  });
  vi.mocked(services.startRegistration).mockResolvedValue(newRegistration);
  vi.mocked(services.registerPasskey).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal(services, { onSessionEnded });

  await userEvent.fill(dialog.getByRole("textbox"), "Teléfono de Lucía");
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("ends the session when authorizing the registration finds it already closed", async () => {
  const services = createServices();
  vi.mocked(services.fetchPasskeyRegistrationChallenge).mockResolvedValue({
    kind: "authorization_required",
  });
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "unauthenticated",
  });
  const onSessionEnded = vi.fn();
  const { screen, dialog } = await renderModal(services, { onSessionEnded });

  await userEvent.fill(dialog.getByRole("textbox"), "Teléfono de Lucía");
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("closes the register modal without calling the API on cancel", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const { dialog } = await renderModal(services, { onClose });

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.fetchPasskeyRegistrationChallenge).not.toHaveBeenCalled();
  expect(services.registerPasskey).not.toHaveBeenCalled();
});

test("has no accessibility violations with the register modal open", async () => {
  const services = createServices();
  await renderModal(services);

  await expectNoAccessibilityViolations(document.body);
});
