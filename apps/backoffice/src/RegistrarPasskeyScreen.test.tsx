import { startRegistration } from "@simplewebauthn/browser";
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import { RegistrarPasskeyScreen } from "./RegistrarPasskeyScreen";
import { fetchRegistrationOptions, redeemRecovery } from "./recoveryApi";

vi.mock("./recoveryApi", () => ({
  fetchRegistrationOptions: vi.fn(),
  redeemRecovery: vi.fn(),
}));
vi.mock("@simplewebauthn/browser", () => ({ startRegistration: vi.fn() }));

const registrationOptions = { challenge: "abc", rp: { id: "purosur.online" } } as never;
const registrationResponse = { id: "cred-1" } as never;

beforeEach(() => {
  vi.mocked(fetchRegistrationOptions).mockReset();
  vi.mocked(redeemRecovery).mockReset();
  vi.mocked(startRegistration).mockReset();
  window.history.pushState(null, "", "/recuperar/enlace#the-token");
});

afterEach(() => {
  window.history.pushState(null, "", "/");
});

test("reads the token from the URL fragment and strips it right away", async () => {
  vi.mocked(fetchRegistrationOptions).mockResolvedValue(
    new Promise(() => {}) as never, // never resolves: only the mount-time effects matter here
  );

  await render(<RegistrarPasskeyScreen />);

  await expect.poll(() => window.location.hash).toBe("");
  await expect.poll(() => window.location.pathname).toBe("/recuperar/enlace");
  expect(fetchRegistrationOptions).toHaveBeenCalledWith("the-token");
});

test("keeps the token across React StrictMode's double-mount effects, in dev", async () => {
  vi.mocked(fetchRegistrationOptions).mockResolvedValue({
    kind: "ok",
    value: { displayName: "Lucía Pérez", options: registrationOptions },
  });
  vi.mocked(startRegistration).mockResolvedValue(registrationResponse);
  vi.mocked(redeemRecovery).mockResolvedValue({ kind: "ok", value: { userId: "user-1" } });

  const screen = await render(
    <StrictMode>
      <RegistrarPasskeyScreen />
    </StrictMode>,
  );

  await expect
    .element(screen.getByRole("heading", { name: "Registrá una passkey nueva", level: 1 }))
    .toBeVisible();
  expect(fetchRegistrationOptions).toHaveBeenCalledWith("the-token");

  await userEvent.click(screen.getByRole("button", { name: "Registrar la passkey" }));

  await expect.poll(() => vi.mocked(redeemRecovery).mock.calls.length).toBe(1);
  expect(redeemRecovery).toHaveBeenCalledWith("the-token", registrationResponse);
});

test("shows the invalid-link state without calling the API when there is no token", async () => {
  window.history.pushState(null, "", "/recuperar/enlace");

  const screen = await render(<RegistrarPasskeyScreen />);

  await expect.element(screen.getByText("Este enlace no es válido")).toBeVisible();
  expect(fetchRegistrationOptions).not.toHaveBeenCalled();
});

test("shows a loading state before the registration options resolve", async () => {
  vi.mocked(fetchRegistrationOptions).mockResolvedValue(new Promise(() => {}) as never);

  const screen = await render(<RegistrarPasskeyScreen />);

  await expect.element(screen.getByText("Abriendo el registro…")).toBeVisible();
});

test("shows the Registrar heading and copy with the account's display name, without claiming open sessions were closed", async () => {
  vi.mocked(fetchRegistrationOptions).mockResolvedValue({
    kind: "ok",
    value: { displayName: "Lucía Pérez", options: registrationOptions },
  });

  const screen = await render(<RegistrarPasskeyScreen />);

  await expect
    .element(screen.getByRole("heading", { name: "Registrá una passkey nueva", level: 1 }))
    .toBeVisible();
  await expect
    .element(screen.getByText("Con ella vas a ingresar de ahora en adelante."))
    .toBeVisible();
  await expect.element(screen.getByText("Lucía Pérez")).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Después conviene agregar una segunda, por ejemplo en el teléfono, desde Usuarios.",
      ),
    )
    .toBeVisible();
  expect(screen.getByText(/sesi[oó]n/i).query()).toBeNull();

  await expectNoAccessibilityViolations(screen.container);
});

test.each([
  ["invalid" as const, "Este enlace no es válido"],
  ["burned" as const, "Este enlace ya no se puede usar"],
  ["expired" as const, "Este enlace venció"],
])("shows the %s token state with a way to request a new link", async (kind, title) => {
  vi.mocked(fetchRegistrationOptions).mockResolvedValue({ kind });

  const screen = await render(<RegistrarPasskeyScreen />);

  await expect.element(screen.getByText(title)).toBeVisible();
  const link = screen.getByRole("link", { name: "Pedir un enlace nuevo" }).element();
  expect(link.getAttribute("href")).toBe("/recuperar");

  await expectNoAccessibilityViolations(screen.container);
});

test("shows a rate-limited state naming when to retry, without a new-link offer", async () => {
  vi.mocked(fetchRegistrationOptions).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 3600,
  });

  const screen = await render(<RegistrarPasskeyScreen />);

  await expect.element(screen.getByText("Demasiados intentos desde esta conexión")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 60 minutos.")).toBeVisible();
  expect(screen.getByRole("link", { name: "Pedir un enlace nuevo" }).query()).toBeNull();
});

test("shows a generic load error with a retry action", async () => {
  vi.mocked(fetchRegistrationOptions).mockResolvedValueOnce({ kind: "failed" });
  const screen = await render(<RegistrarPasskeyScreen />);
  await expect.element(screen.getByText("No pudimos abrir el registro")).toBeVisible();

  vi.mocked(fetchRegistrationOptions).mockResolvedValueOnce({
    kind: "ok",
    value: { displayName: "Lucía Pérez", options: registrationOptions },
  });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByRole("heading", { name: "Registrá una passkey nueva", level: 1 }))
    .toBeVisible();
  expect(fetchRegistrationOptions).toHaveBeenCalledTimes(2);
});

test("registers the passkey and shows the success state, without implying a session opened", async () => {
  vi.mocked(fetchRegistrationOptions).mockResolvedValue({
    kind: "ok",
    value: { displayName: "Lucía Pérez", options: registrationOptions },
  });
  vi.mocked(startRegistration).mockResolvedValue(registrationResponse);
  vi.mocked(redeemRecovery).mockResolvedValue({ kind: "ok", value: { userId: "user-1" } });

  const screen = await render(<RegistrarPasskeyScreen />);
  await userEvent.click(screen.getByRole("button", { name: "Registrar la passkey" }));

  expect(startRegistration).toHaveBeenCalledWith({ optionsJSON: registrationOptions });
  await expect.poll(() => vi.mocked(redeemRecovery).mock.calls.length).toBe(1);
  expect(redeemRecovery).toHaveBeenCalledWith("the-token", registrationResponse);

  await expect.element(screen.getByText("Registraste la passkey")).toBeVisible();
  expect(screen.getByText(/sesi[oó]n/i).query()).toBeNull();
  const signInLink = screen.getByRole("link", { name: "Ir a ingresar" }).element();
  expect(signInLink.getAttribute("href")).toBe("/ingresar");

  await expectNoAccessibilityViolations(screen.container);
});

test("lets the person retry, without a new link, after the browser cancels registration", async () => {
  vi.mocked(fetchRegistrationOptions).mockResolvedValue({
    kind: "ok",
    value: { displayName: "Lucía Pérez", options: registrationOptions },
  });
  vi.mocked(startRegistration).mockRejectedValue(new Error("NotAllowedError"));

  const screen = await render(<RegistrarPasskeyScreen />);
  await userEvent.click(screen.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(screen.getByText("No se pudo registrar la passkey")).toBeVisible();
  expect(redeemRecovery).not.toHaveBeenCalled();
  await expect.element(screen.getByRole("button", { name: "Registrar la passkey" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Pedir un enlace nuevo" }).query()).toBeNull();
});

test("lets the person retry, without a new link, after redeem rejects the registration", async () => {
  vi.mocked(fetchRegistrationOptions).mockResolvedValue({
    kind: "ok",
    value: { displayName: "Lucía Pérez", options: registrationOptions },
  });
  vi.mocked(startRegistration).mockResolvedValue(registrationResponse);
  vi.mocked(redeemRecovery).mockResolvedValue({ kind: "validation_failed" });

  const screen = await render(<RegistrarPasskeyScreen />);
  await userEvent.click(screen.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(screen.getByText("No se pudo registrar la passkey")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Registrar la passkey" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Pedir un enlace nuevo" }).query()).toBeNull();
});

test("retries with fresh options after another tab replaced this link's challenge", async () => {
  const staleOptions = { challenge: "from-this-tab", rp: { id: "purosur.online" } } as never;
  const freshOptions = { challenge: "fetched-again", rp: { id: "purosur.online" } } as never;
  vi.mocked(fetchRegistrationOptions)
    .mockResolvedValueOnce({
      kind: "ok",
      value: { displayName: "Lucía Pérez", options: staleOptions },
    })
    .mockResolvedValueOnce({
      kind: "ok",
      value: { displayName: "Lucía Pérez", options: freshOptions },
    });
  const optionFetchesWhenWebAuthnStarted: number[] = [];
  vi.mocked(startRegistration).mockImplementation(async () => {
    optionFetchesWhenWebAuthnStarted.push(vi.mocked(fetchRegistrationOptions).mock.calls.length);
    return registrationResponse;
  });
  // The other tab's options call replaced the stored challenge, so this tab's first attempt fails.
  vi.mocked(redeemRecovery)
    .mockResolvedValueOnce({ kind: "validation_failed" })
    .mockResolvedValueOnce({ kind: "ok", value: { userId: "user-1" } });

  const screen = await render(<RegistrarPasskeyScreen />);
  await userEvent.click(screen.getByRole("button", { name: "Registrar la passkey" }));
  await expect.element(screen.getByText("No se pudo registrar la passkey")).toBeVisible();
  await expect.poll(() => vi.mocked(fetchRegistrationOptions).mock.calls.length).toBe(2);
  await expect
    .element(screen.getByRole("button", { name: "Registrar la passkey" }))
    .not.toBeDisabled();

  await userEvent.click(screen.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(screen.getByText("Registraste la passkey")).toBeVisible();
  expect(startRegistration).toHaveBeenLastCalledWith({ optionsJSON: freshOptions });
  // Each attempt starts WebAuthn straight from its click, with no options fetch in between.
  expect(optionFetchesWhenWebAuthnStarted).toEqual([1, 2]);
});

test("keeps the current options after the browser cancels, without fetching them again", async () => {
  vi.mocked(fetchRegistrationOptions).mockResolvedValue({
    kind: "ok",
    value: { displayName: "Lucía Pérez", options: registrationOptions },
  });
  vi.mocked(startRegistration)
    .mockRejectedValueOnce(new Error("NotAllowedError"))
    .mockResolvedValueOnce(registrationResponse);
  vi.mocked(redeemRecovery).mockResolvedValue({ kind: "ok", value: { userId: "user-1" } });

  const screen = await render(<RegistrarPasskeyScreen />);
  await userEvent.click(screen.getByRole("button", { name: "Registrar la passkey" }));
  await expect.element(screen.getByText("No se pudo registrar la passkey")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Registrar la passkey" }))
    .not.toBeDisabled();

  await userEvent.click(screen.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(screen.getByText("Registraste la passkey")).toBeVisible();
  expect(startRegistration).toHaveBeenLastCalledWith({ optionsJSON: registrationOptions });
  expect(fetchRegistrationOptions).toHaveBeenCalledTimes(1);
});

test("moves to the burned state when redeem discovers the token was consumed meanwhile", async () => {
  vi.mocked(fetchRegistrationOptions).mockResolvedValue({
    kind: "ok",
    value: { displayName: "Lucía Pérez", options: registrationOptions },
  });
  vi.mocked(startRegistration).mockResolvedValue(registrationResponse);
  vi.mocked(redeemRecovery).mockResolvedValue({ kind: "burned" });

  const screen = await render(<RegistrarPasskeyScreen />);
  await userEvent.click(screen.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(screen.getByText("Este enlace ya no se puede usar")).toBeVisible();
});
