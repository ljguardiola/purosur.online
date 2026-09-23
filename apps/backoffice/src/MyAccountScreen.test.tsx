import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import { MyAccountScreen } from "./MyAccountScreen";
import {
  fetchPasskeyRegistrationChallenge,
  fetchPasskeyRemovalChallenge,
  fetchPasskeys,
  type Passkey,
  registerPasskey,
  removePasskey,
} from "./passkeyApi";

vi.mock("./passkeyApi", () => ({
  fetchPasskeys: vi.fn(),
  fetchPasskeyRegistrationChallenge: vi.fn(),
  fetchPasskeyRemovalChallenge: vi.fn(),
  registerPasskey: vi.fn(),
  removePasskey: vi.fn(),
}));
vi.mock("@simplewebauthn/browser", () => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}));

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

function renderScreen(onSessionEnded: () => void = () => {}) {
  return render(
    <main>
      <MyAccountScreen displayName="Lucía Pérez" onSessionEnded={onSessionEnded} now={NOW} />
    </main>,
  );
}

beforeEach(() => {
  vi.mocked(fetchPasskeys).mockReset();
  vi.mocked(fetchPasskeyRegistrationChallenge).mockReset();
  vi.mocked(fetchPasskeyRemovalChallenge).mockReset();
  vi.mocked(registerPasskey).mockReset();
  vi.mocked(removePasskey).mockReset();
  vi.mocked(startAuthentication).mockReset();
  vi.mocked(startRegistration).mockReset();
});

test("shows a loading state before the passkeys resolve", async () => {
  vi.mocked(fetchPasskeys).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen();

  await expect.element(screen.getByRole("status")).toBeVisible();
});

test("shows the breadcrumb, heading and each passkey with its registration and last-use detail", async () => {
  vi.mocked(fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook, phone] });

  const screen = await renderScreen();

  await expect.element(screen.getByText("Configuración · Lucía Pérez")).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  await expect
    .element(screen.getByText("Registrada el 02/08/2026 · último uso hoy 09:12"))
    .toBeVisible();
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
  await expect.element(screen.getByText("Registrada el 10/08/2026")).toBeVisible();
});

test("flags the account when it has only one passkey", async () => {
  vi.mocked(fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  const screen = await renderScreen();

  await expect
    .element(
      screen
        .getByText(
          "Tenés una sola passkey. Si perdés este dispositivo no podés entrar al backoffice: conviene registrar otra, por ejemplo en el teléfono.",
        )
        .first(),
    )
    .toBeVisible();
});

test("does not flag the account when it has two or more passkeys", async () => {
  vi.mocked(fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook, phone] });
  const screen = await renderScreen();

  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
  expect(screen.getByText(/Tenés una sola passkey/).query()).toBeNull();
});

test("shows a load error with a retry action when the passkeys fail to load", async () => {
  vi.mocked(fetchPasskeys).mockResolvedValueOnce({ kind: "failed" });
  const screen = await renderScreen();

  await expect.element(screen.getByText("No pudimos abrir tus passkeys")).toBeVisible();

  vi.mocked(fetchPasskeys).mockResolvedValueOnce({ kind: "ok", value: [notebook] });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
});

test("ends the session when the passkeys request finds no open session", async () => {
  vi.mocked(fetchPasskeys).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("has no accessibility violations once the passkeys are loaded, with the single-passkey warning shown", async () => {
  vi.mocked(fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  const screen = await renderScreen();
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();

  await expectNoAccessibilityViolations(document.body);
});

async function openRegisterModal(screen: Awaited<ReturnType<typeof renderScreen>>) {
  await userEvent.click(screen.getByRole("button", { name: "Registrar otra passkey" }));
  return screen.getByRole("dialog");
}

test("opens the register modal and submits a new passkey, refreshing the list on success", async () => {
  vi.mocked(fetchPasskeys).mockResolvedValueOnce({ kind: "ok", value: [notebook] });
  const screen = await renderScreen();
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();

  vi.mocked(fetchPasskeyRegistrationChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions, registrationOptions },
  });
  const dialog = await openRegisterModal(screen);
  await expect
    .element(dialog.getByRole("heading", { name: "Registrar una passkey" }))
    .toBeVisible();

  vi.mocked(startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(startRegistration).mockResolvedValue(newRegistration);
  vi.mocked(registerPasskey).mockResolvedValue({ kind: "ok", value: phone });
  vi.mocked(fetchPasskeys).mockResolvedValueOnce({ kind: "ok", value: [notebook, phone] });

  await userEvent.fill(dialog.getByRole("textbox"), "Teléfono de Lucía");
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));

  expect(startAuthentication).toHaveBeenCalledWith({ optionsJSON: reauthenticationOptions });
  expect(startRegistration).toHaveBeenCalledWith({ optionsJSON: registrationOptions });
  await expect.poll(() => vi.mocked(registerPasskey).mock.calls.length).toBe(1);
  expect(registerPasskey).toHaveBeenCalledWith(
    reauthAssertion,
    newRegistration,
    "Teléfono de Lucía",
  );

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
});

test("requires a passkey name before registering, without calling WebAuthn or the API", async () => {
  vi.mocked(fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  const screen = await renderScreen();
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  vi.mocked(fetchPasskeyRegistrationChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions, registrationOptions },
  });
  const dialog = await openRegisterModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(dialog.getByText("Ingresá un nombre para la passkey.")).toBeVisible();
  expect(startAuthentication).not.toHaveBeenCalled();
  expect(registerPasskey).not.toHaveBeenCalled();
});

test("rejects a passkey name over 40 characters once trimmed", async () => {
  vi.mocked(fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  const screen = await renderScreen();
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  vi.mocked(fetchPasskeyRegistrationChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions, registrationOptions },
  });
  const dialog = await openRegisterModal(screen);

  await userEvent.fill(dialog.getByRole("textbox"), "a".repeat(41));
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));

  await expect
    .element(dialog.getByText("El nombre no puede superar los 40 caracteres."))
    .toBeVisible();
  expect(registerPasskey).not.toHaveBeenCalled();
});

test("lets the person retry, keeping the same options, after the browser cancels a registration step", async () => {
  vi.mocked(fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  const screen = await renderScreen();
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  vi.mocked(fetchPasskeyRegistrationChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions, registrationOptions },
  });
  vi.mocked(startAuthentication).mockRejectedValue(new Error("NotAllowedError"));
  const dialog = await openRegisterModal(screen);

  await userEvent.fill(dialog.getByRole("textbox"), "Teléfono de Lucía");
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(dialog.getByText("No se pudo registrar la passkey")).toBeVisible();
  expect(fetchPasskeyRegistrationChallenge).toHaveBeenCalledTimes(1);
  expect(registerPasskey).not.toHaveBeenCalled();
});

test("fetches fresh options after the reauthentication fails to verify, then lets the person retry", async () => {
  vi.mocked(fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  const screen = await renderScreen();
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  vi.mocked(fetchPasskeyRegistrationChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions, registrationOptions },
  });
  vi.mocked(startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(startRegistration).mockResolvedValue(newRegistration);
  vi.mocked(registerPasskey).mockResolvedValue({ kind: "authentication_failed" });
  const dialog = await openRegisterModal(screen);

  await userEvent.fill(dialog.getByRole("textbox"), "Teléfono de Lucía");
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(dialog.getByText("No se pudo registrar la passkey")).toBeVisible();
  await expect.poll(() => vi.mocked(fetchPasskeyRegistrationChallenge).mock.calls.length).toBe(2);
});

test("ends the session when registering finds the session already ended", async () => {
  vi.mocked(fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(onSessionEnded);
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  vi.mocked(fetchPasskeyRegistrationChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions, registrationOptions },
  });
  vi.mocked(startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(startRegistration).mockResolvedValue(newRegistration);
  vi.mocked(registerPasskey).mockResolvedValue({ kind: "unauthenticated" });
  const dialog = await openRegisterModal(screen);

  await userEvent.fill(dialog.getByRole("textbox"), "Teléfono de Lucía");
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la passkey" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("closes the register modal without calling the API on cancel", async () => {
  vi.mocked(fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  const screen = await renderScreen();
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  vi.mocked(fetchPasskeyRegistrationChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions, registrationOptions },
  });
  const dialog = await openRegisterModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(registerPasskey).not.toHaveBeenCalled();
});

test("shows a load error with a retry action when the register modal's options fail to load", async () => {
  vi.mocked(fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  const screen = await renderScreen();
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  vi.mocked(fetchPasskeyRegistrationChallenge).mockResolvedValueOnce({ kind: "failed" });
  const dialog = await openRegisterModal(screen);

  await expect.element(dialog.getByText("No pudimos abrir tus passkeys")).toBeVisible();

  vi.mocked(fetchPasskeyRegistrationChallenge).mockResolvedValueOnce({
    kind: "ok",
    value: { reauthenticationOptions, registrationOptions },
  });
  await userEvent.click(dialog.getByRole("button", { name: "Reintentar" }));

  await expect.element(dialog.getByRole("textbox")).toBeVisible();
});

test("has no accessibility violations with the register modal open", async () => {
  vi.mocked(fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  const screen = await renderScreen();
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  vi.mocked(fetchPasskeyRegistrationChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions, registrationOptions },
  });
  await openRegisterModal(screen);

  await expectNoAccessibilityViolations(document.body);
});

async function openRemoveModal(screen: Awaited<ReturnType<typeof renderScreen>>, name: string) {
  await userEvent.click(screen.getByRole("button", { name: `Dar de baja la passkey «${name}»` }));
  return screen.getByRole("dialog");
}

test("opens the remove modal naming the passkey and confirms the removal, refreshing the list on success", async () => {
  vi.mocked(fetchPasskeys).mockResolvedValueOnce({ kind: "ok", value: [notebook, phone] });
  const screen = await renderScreen();
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();

  vi.mocked(fetchPasskeyRemovalChallenge).mockResolvedValue({
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

  vi.mocked(startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(removePasskey).mockResolvedValue({ kind: "ok" });
  vi.mocked(fetchPasskeys).mockResolvedValueOnce({ kind: "ok", value: [phone] });

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  expect(startAuthentication).toHaveBeenCalledWith({ optionsJSON: reauthenticationOptions });
  await expect.poll(() => vi.mocked(removePasskey).mock.calls.length).toBe(1);
  expect(removePasskey).toHaveBeenCalledWith("pk-1", reauthAssertion);
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(screen.getByText("Notebook del local").query()).toBeNull();
});

test("warns in the remove modal when it is the account's only passkey", async () => {
  vi.mocked(fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  const screen = await renderScreen();
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  vi.mocked(fetchPasskeyRemovalChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });

  const dialog = await openRemoveModal(screen, "Notebook del local");

  await expect
    .element(
      dialog
        .getByText(
          "Es tu única passkey: para volver a entrar vas a tener que pedir el enlace de recuperación por correo.",
        )
        .first(),
    )
    .toBeVisible();
});

test("does not warn in the remove modal when it is not the only passkey", async () => {
  vi.mocked(fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook, phone] });
  const screen = await renderScreen();
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
  vi.mocked(fetchPasskeyRemovalChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });

  const dialog = await openRemoveModal(screen, "Notebook del local");

  expect(dialog.getByText(/única passkey/).query()).toBeNull();
});

test("treats a not_found removal as already done and refreshes the list", async () => {
  vi.mocked(fetchPasskeys).mockResolvedValueOnce({ kind: "ok", value: [notebook, phone] });
  const screen = await renderScreen();
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
  vi.mocked(fetchPasskeyRemovalChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(removePasskey).mockResolvedValue({ kind: "not_found" });
  vi.mocked(fetchPasskeys).mockResolvedValueOnce({ kind: "ok", value: [phone] });
  const dialog = await openRemoveModal(screen, "Notebook del local");

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(screen.getByText("Notebook del local").query()).toBeNull();
});

test("lets the person retry the removal, keeping the same options, after the browser cancels", async () => {
  vi.mocked(fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook, phone] });
  const screen = await renderScreen();
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
  vi.mocked(fetchPasskeyRemovalChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(startAuthentication).mockRejectedValue(new Error("NotAllowedError"));
  const dialog = await openRemoveModal(screen, "Notebook del local");

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect.element(dialog.getByText("No se pudo dar de baja la passkey")).toBeVisible();
  expect(fetchPasskeyRemovalChallenge).toHaveBeenCalledTimes(1);
  expect(removePasskey).not.toHaveBeenCalled();
});

test("fetches a fresh challenge after removal's reauthentication fails to verify", async () => {
  vi.mocked(fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook, phone] });
  const screen = await renderScreen();
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
  vi.mocked(fetchPasskeyRemovalChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(removePasskey).mockResolvedValue({ kind: "authentication_failed" });
  const dialog = await openRemoveModal(screen, "Notebook del local");

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect.element(dialog.getByText("No se pudo dar de baja la passkey")).toBeVisible();
  await expect.poll(() => vi.mocked(fetchPasskeyRemovalChallenge).mock.calls.length).toBe(2);
});

test("ends the session when removing finds the session already ended", async () => {
  vi.mocked(fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook, phone] });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(onSessionEnded);
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
  vi.mocked(fetchPasskeyRemovalChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(removePasskey).mockResolvedValue({ kind: "unauthenticated" });
  const dialog = await openRemoveModal(screen, "Notebook del local");

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("has no accessibility violations with the remove modal open", async () => {
  vi.mocked(fetchPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  const screen = await renderScreen();
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  vi.mocked(fetchPasskeyRemovalChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  await openRemoveModal(screen, "Notebook del local");

  await expectNoAccessibilityViolations(document.body);
});
