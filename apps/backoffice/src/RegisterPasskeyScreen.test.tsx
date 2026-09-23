import { StrictMode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import { RegisterPasskeyScreen, type RegisterPasskeyScreenServices } from "./RegisterPasskeyScreen";

const registrationOptions = { challenge: "abc", rp: { id: "purosur.online" } } as never;
const registrationResponse = { id: "cred-1" } as never;
const PASSKEY_NAME = "Notebook del local";

function createServices(
  overrides: Partial<RegisterPasskeyScreenServices> = {},
): RegisterPasskeyScreenServices {
  return {
    fetchRegistrationOptions: vi.fn(),
    redeemRecovery: vi.fn(),
    startRegistration: vi.fn(),
    ...overrides,
  };
}

// The only textbox on this screen is the passkey name field.
async function fillName(screen: Awaited<ReturnType<typeof render>>, value: string) {
  await userEvent.fill(screen.getByRole("textbox"), value);
}

beforeEach(() => {
  window.history.pushState(null, "", "/account-recovery/passkey#the-token");
});

afterEach(() => {
  window.history.pushState(null, "", "/");
});

test("reads the token from the URL fragment and strips it right away", async () => {
  const services = createServices({
    fetchRegistrationOptions: vi.fn().mockResolvedValue(
      new Promise(() => {}) as never, // never resolves: only the mount-time effects matter here
    ),
  });

  await render(<RegisterPasskeyScreen services={services} />);

  await expect.poll(() => window.location.hash).toBe("");
  await expect.poll(() => window.location.pathname).toBe("/account-recovery/passkey");
  expect(services.fetchRegistrationOptions).toHaveBeenCalledWith("the-token");
});

test("keeps the token across React StrictMode's double-mount effects, in dev", async () => {
  const services = createServices({
    fetchRegistrationOptions: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { displayName: "Lucía Pérez", options: registrationOptions },
    }),
    startRegistration: vi.fn().mockResolvedValue(registrationResponse),
    redeemRecovery: vi.fn().mockResolvedValue({ kind: "ok", value: { userId: "user-1" } }),
  });

  const screen = await render(
    <StrictMode>
      <RegisterPasskeyScreen services={services} />
    </StrictMode>,
  );

  await expect
    .element(screen.getByRole("heading", { name: "Registrá una passkey nueva", level: 1 }))
    .toBeVisible();
  expect(services.fetchRegistrationOptions).toHaveBeenCalledWith("the-token");

  await fillName(screen, PASSKEY_NAME);
  await userEvent.click(screen.getByRole("button", { name: "Registrar la passkey" }));

  await expect.poll(() => vi.mocked(services.redeemRecovery).mock.calls.length).toBe(1);
  expect(services.redeemRecovery).toHaveBeenCalledWith(
    "the-token",
    registrationResponse,
    PASSKEY_NAME,
  );
});

test("shows the invalid-link state without calling the API when there is no token", async () => {
  window.history.pushState(null, "", "/account-recovery/passkey");
  const services = createServices();

  const screen = await render(<RegisterPasskeyScreen services={services} />);

  await expect.element(screen.getByText("Este enlace no es válido")).toBeVisible();
  expect(services.fetchRegistrationOptions).not.toHaveBeenCalled();
});

test("shows a loading state before the registration options resolve", async () => {
  const services = createServices({
    fetchRegistrationOptions: vi.fn().mockResolvedValue(new Promise(() => {}) as never),
  });

  const screen = await render(<RegisterPasskeyScreen services={services} />);

  await expect.element(screen.getByText("Abriendo el registro…")).toBeVisible();
});

test("shows the register-passkey heading and copy with the account's display name, without claiming open sessions were closed", async () => {
  const services = createServices({
    fetchRegistrationOptions: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { displayName: "Lucía Pérez", options: registrationOptions },
    }),
  });

  const screen = await render(<RegisterPasskeyScreen services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Registrá una passkey nueva", level: 1 }))
    .toBeVisible();
  await expect
    .element(screen.getByText("Con ella vas a ingresar de ahora en adelante."))
    .toBeVisible();
  await expect.element(screen.getByText("Lucía Pérez")).toBeVisible();
  await expect.element(screen.getByText("Nombre de la passkey")).toBeVisible();
  await expect.element(screen.getByRole("textbox")).toBeVisible();
  await expect.element(screen.getByText("Por ejemplo, Notebook del local.")).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Después conviene agregar una segunda, por ejemplo en el teléfono, desde Mi cuenta.",
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
  const services = createServices({
    fetchRegistrationOptions: vi.fn().mockResolvedValue({ kind }),
  });

  const screen = await render(<RegisterPasskeyScreen services={services} />);

  await expect.element(screen.getByText(title)).toBeVisible();
  const link = screen.getByRole("link", { name: "Pedir un enlace nuevo" }).element();
  expect(link.getAttribute("href")).toBe("/account-recovery");

  await expectNoAccessibilityViolations(screen.container);
});

test("shows a rate-limited state naming when to retry, without a new-link offer", async () => {
  const services = createServices({
    fetchRegistrationOptions: vi.fn().mockResolvedValue({
      kind: "rate_limited",
      retryAfterSeconds: 3600,
    }),
  });

  const screen = await render(<RegisterPasskeyScreen services={services} />);

  await expect.element(screen.getByText("Demasiados intentos desde esta conexión")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 60 minutos.")).toBeVisible();
  expect(screen.getByRole("link", { name: "Pedir un enlace nuevo" }).query()).toBeNull();
});

test("shows a generic load error with a retry action", async () => {
  const fetchRegistrationOptions = vi
    .fn()
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({
      kind: "ok",
      value: { displayName: "Lucía Pérez", options: registrationOptions },
    });
  const services = createServices({ fetchRegistrationOptions });

  const screen = await render(<RegisterPasskeyScreen services={services} />);
  await expect.element(screen.getByText("No pudimos abrir el registro")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByRole("heading", { name: "Registrá una passkey nueva", level: 1 }))
    .toBeVisible();
  expect(fetchRegistrationOptions).toHaveBeenCalledTimes(2);
});

test("registers the passkey and shows the success state, naming that open sessions were closed", async () => {
  const services = createServices({
    fetchRegistrationOptions: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { displayName: "Lucía Pérez", options: registrationOptions },
    }),
    startRegistration: vi.fn().mockResolvedValue(registrationResponse),
    redeemRecovery: vi.fn().mockResolvedValue({ kind: "ok", value: { userId: "user-1" } }),
  });

  const screen = await render(<RegisterPasskeyScreen services={services} />);
  await fillName(screen, PASSKEY_NAME);
  await userEvent.click(screen.getByRole("button", { name: "Registrar la passkey" }));

  expect(services.startRegistration).toHaveBeenCalledWith({ optionsJSON: registrationOptions });
  await expect.poll(() => vi.mocked(services.redeemRecovery).mock.calls.length).toBe(1);
  expect(services.redeemRecovery).toHaveBeenCalledWith(
    "the-token",
    registrationResponse,
    PASSKEY_NAME,
  );

  await expect.element(screen.getByText("Registraste la passkey")).toBeVisible();
  await expect
    .element(screen.getByText("Se cerraron las sesiones abiertas de tu cuenta"))
    .toBeVisible();
  await expect
    .element(screen.getByText("Si alguien más estaba adentro con tu cuenta, ya no lo está."))
    .toBeVisible();
  const signInLink = screen.getByRole("link", { name: "Ir a ingresar" }).element();
  expect(signInLink.getAttribute("href")).toBe("/sign-in");

  await expectNoAccessibilityViolations(screen.container);
});

test("lets the person retry, without a new link, after the browser cancels registration", async () => {
  const services = createServices({
    fetchRegistrationOptions: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { displayName: "Lucía Pérez", options: registrationOptions },
    }),
    startRegistration: vi.fn().mockRejectedValue(new Error("NotAllowedError")),
  });

  const screen = await render(<RegisterPasskeyScreen services={services} />);
  await fillName(screen, PASSKEY_NAME);
  await userEvent.click(screen.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(screen.getByText("No se pudo registrar la passkey")).toBeVisible();
  expect(services.redeemRecovery).not.toHaveBeenCalled();
  await expect.element(screen.getByRole("button", { name: "Registrar la passkey" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Pedir un enlace nuevo" }).query()).toBeNull();
});

test("lets the person retry, without a new link, after redeem rejects the registration", async () => {
  const services = createServices({
    fetchRegistrationOptions: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { displayName: "Lucía Pérez", options: registrationOptions },
    }),
    startRegistration: vi.fn().mockResolvedValue(registrationResponse),
    redeemRecovery: vi.fn().mockResolvedValue({ kind: "validation_failed" }),
  });

  const screen = await render(<RegisterPasskeyScreen services={services} />);
  await fillName(screen, PASSKEY_NAME);
  await userEvent.click(screen.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(screen.getByText("No se pudo registrar la passkey")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Registrar la passkey" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Pedir un enlace nuevo" }).query()).toBeNull();
});

test("retries with fresh options after another tab replaced this link's challenge", async () => {
  const staleOptions = { challenge: "from-this-tab", rp: { id: "purosur.online" } } as never;
  const freshOptions = { challenge: "fetched-again", rp: { id: "purosur.online" } } as never;
  const fetchRegistrationOptions = vi
    .fn()
    .mockResolvedValueOnce({
      kind: "ok",
      value: { displayName: "Lucía Pérez", options: staleOptions },
    })
    .mockResolvedValueOnce({
      kind: "ok",
      value: { displayName: "Lucía Pérez", options: freshOptions },
    });
  const optionFetchesWhenWebAuthnStarted: number[] = [];
  const startRegistration = vi.fn().mockImplementation(async () => {
    optionFetchesWhenWebAuthnStarted.push(fetchRegistrationOptions.mock.calls.length);
    return registrationResponse;
  });
  // The other tab's options call replaced the stored challenge, so this tab's first attempt fails.
  const redeemRecovery = vi
    .fn()
    .mockResolvedValueOnce({ kind: "validation_failed" })
    .mockResolvedValueOnce({ kind: "ok", value: { userId: "user-1" } });
  const services = createServices({
    fetchRegistrationOptions,
    startRegistration,
    redeemRecovery,
  });

  const screen = await render(<RegisterPasskeyScreen services={services} />);
  await fillName(screen, PASSKEY_NAME);
  await userEvent.click(screen.getByRole("button", { name: "Registrar la passkey" }));
  await expect.element(screen.getByText("No se pudo registrar la passkey")).toBeVisible();
  await expect.poll(() => fetchRegistrationOptions.mock.calls.length).toBe(2);
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
  const startRegistration = vi
    .fn()
    .mockRejectedValueOnce(new Error("NotAllowedError"))
    .mockResolvedValueOnce(registrationResponse);
  const services = createServices({
    fetchRegistrationOptions: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { displayName: "Lucía Pérez", options: registrationOptions },
    }),
    startRegistration,
    redeemRecovery: vi.fn().mockResolvedValue({ kind: "ok", value: { userId: "user-1" } }),
  });

  const screen = await render(<RegisterPasskeyScreen services={services} />);
  await fillName(screen, PASSKEY_NAME);
  await userEvent.click(screen.getByRole("button", { name: "Registrar la passkey" }));
  await expect.element(screen.getByText("No se pudo registrar la passkey")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Registrar la passkey" }))
    .not.toBeDisabled();

  await userEvent.click(screen.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(screen.getByText("Registraste la passkey")).toBeVisible();
  expect(startRegistration).toHaveBeenLastCalledWith({ optionsJSON: registrationOptions });
  expect(services.fetchRegistrationOptions).toHaveBeenCalledTimes(1);
});

test("moves to the burned state when redeem discovers the token was consumed meanwhile", async () => {
  const services = createServices({
    fetchRegistrationOptions: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { displayName: "Lucía Pérez", options: registrationOptions },
    }),
    startRegistration: vi.fn().mockResolvedValue(registrationResponse),
    redeemRecovery: vi.fn().mockResolvedValue({ kind: "burned" }),
  });

  const screen = await render(<RegisterPasskeyScreen services={services} />);
  await fillName(screen, PASSKEY_NAME);
  await userEvent.click(screen.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(screen.getByText("Este enlace ya no se puede usar")).toBeVisible();
});

test("requires the passkey name before registering, without calling WebAuthn or the API", async () => {
  const services = createServices({
    fetchRegistrationOptions: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { displayName: "Lucía Pérez", options: registrationOptions },
    }),
  });

  const screen = await render(<RegisterPasskeyScreen services={services} />);
  await userEvent.click(screen.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(screen.getByText("Ingresá un nombre para la passkey.")).toBeVisible();
  expect(services.startRegistration).not.toHaveBeenCalled();
  expect(services.redeemRecovery).not.toHaveBeenCalled();
});

test("rejects a passkey name over 40 characters once trimmed, without calling the API", async () => {
  const services = createServices({
    fetchRegistrationOptions: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { displayName: "Lucía Pérez", options: registrationOptions },
    }),
  });

  const screen = await render(<RegisterPasskeyScreen services={services} />);
  await fillName(screen, `  ${"a".repeat(41)}  `);
  await userEvent.click(screen.getByRole("button", { name: "Registrar la passkey" }));

  await expect
    .element(screen.getByText("El nombre no puede superar los 40 caracteres."))
    .toBeVisible();
  expect(services.redeemRecovery).not.toHaveBeenCalled();
});

test("sends the trimmed passkey name", async () => {
  const services = createServices({
    fetchRegistrationOptions: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { displayName: "Lucía Pérez", options: registrationOptions },
    }),
    startRegistration: vi.fn().mockResolvedValue(registrationResponse),
    redeemRecovery: vi.fn().mockResolvedValue({ kind: "ok", value: { userId: "user-1" } }),
  });

  const screen = await render(<RegisterPasskeyScreen services={services} />);
  await fillName(screen, "  Notebook del local  ");
  await userEvent.click(screen.getByRole("button", { name: "Registrar la passkey" }));

  await expect.poll(() => vi.mocked(services.redeemRecovery).mock.calls.length).toBe(1);
  expect(services.redeemRecovery).toHaveBeenCalledWith(
    "the-token",
    registrationResponse,
    "Notebook del local",
  );
});
