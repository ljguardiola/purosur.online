import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { StrictMode, useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { RegisterPasskeyScreen } from "./register-passkey-screen";
import type { RegisterPasskeyScreenServices } from "./register-passkey-services";
import { creationOptions } from "./test-support/creation-options";

const registrationOptions = creationOptions;
const registrationResponse = { id: "cred-1" } as never;
const PASSKEY_NAME = "Notebook del local";

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function createServices(
  overrides: Partial<RegisterPasskeyScreenServices> = {},
): RegisterPasskeyScreenServices {
  return {
    fetchRegistrationOptions: vi.fn(),
    redeemRecovery: vi.fn(),
    startRegistration: vi.fn(),
    signalUnknownCredential: vi.fn(),
    ...overrides,
  };
}

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
    redeemRecovery: vi.fn().mockResolvedValue({ kind: "ok" }),
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

test("shows the design system's loading placeholder before the registration options resolve", async () => {
  const services = createServices({
    fetchRegistrationOptions: vi.fn().mockResolvedValue(new Promise(() => {}) as never),
  });

  const screen = await render(<RegisterPasskeyScreen services={services} />);

  await expect.element(screen.getByRole("status")).toHaveTextContent("Cargando…");
  await expect
    .element(screen.getByRole("heading", { name: "Registrá una passkey nueva", level: 1 }))
    .toBeVisible();
  expect(screen.getByRole("button", { name: "Registrar la passkey" }).query()).toBeNull();
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

test("shows a rate-limited read as a load failure naming when to retry, without a new-link offer", async () => {
  const services = createServices({
    fetchRegistrationOptions: vi.fn().mockResolvedValue({
      kind: "rate_limited",
      retryAfterSeconds: 3600,
    }),
  });

  const screen = await render(<RegisterPasskeyScreen services={services} />);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 60 minutos.")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Pedir un enlace nuevo" }).query()).toBeNull();
});

test("shows a generic load error whose retry starts over from the loading placeholder", async () => {
  const second = deferred<unknown>();
  const fetchRegistrationOptions = vi
    .fn()
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(second.promise);
  const services = createServices({ fetchRegistrationOptions });

  const screen = await render(<RegisterPasskeyScreen services={services} />);
  await expect.element(screen.getByText("No pudimos abrir el registro")).toBeVisible();
  await expect.element(screen.getByText("Probá de nuevo en unos minutos.")).toBeVisible();
  expect(screen.getByRole("link", { name: "Pedir un enlace nuevo" }).query()).toBeNull();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByRole("status")).toHaveTextContent("Cargando…");
  second.resolve({
    kind: "ok",
    value: { displayName: "Lucía Pérez", options: registrationOptions },
  });
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
    redeemRecovery: vi.fn().mockResolvedValue({ kind: "ok" }),
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

test("starts WebAuthn within the click itself, before anything else runs", async () => {
  const services = createServices({
    fetchRegistrationOptions: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { displayName: "Lucía Pérez", options: registrationOptions },
    }),
    startRegistration: vi.fn().mockResolvedValue(registrationResponse),
    redeemRecovery: vi.fn().mockResolvedValue({ kind: "ok" }),
  });
  const screen = await render(<RegisterPasskeyScreen services={services} />);
  await fillName(screen, PASSKEY_NAME);

  screen
    .getByRole("button", { name: "Registrar la passkey" })
    .element()
    .dispatchEvent(new MouseEvent("click", { bubbles: true }));

  expect(services.startRegistration).toHaveBeenCalledWith({ optionsJSON: registrationOptions });
  await expect.element(screen.getByText("Registraste la passkey")).toBeVisible();
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
  expect(services.signalUnknownCredential).not.toHaveBeenCalled();
});

test("lets the person retry, without a new link, after redeem rejects the registration, signaling the device to forget the credential", async () => {
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
  expect(services.signalUnknownCredential).toHaveBeenCalledWith({
    rpId: "purosur.online",
    credentialId: "cred-1",
  });
});

test.each([
  ["invalid", { kind: "invalid" }],
  ["burned", { kind: "burned" }],
  ["expired", { kind: "expired" }],
  ["rate_limited", { kind: "rate_limited", retryAfterSeconds: 60 }],
] as const)(
  "signals the device to forget the credential it just created when redeem answers %s",
  async (_, outcome) => {
    const services = createServices({
      fetchRegistrationOptions: vi.fn().mockResolvedValue({
        kind: "ok",
        value: { displayName: "Lucía Pérez", options: registrationOptions },
      }),
      startRegistration: vi.fn().mockResolvedValue(registrationResponse),
      redeemRecovery: vi.fn().mockResolvedValue(outcome),
    });

    const screen = await render(<RegisterPasskeyScreen services={services} />);
    await fillName(screen, PASSKEY_NAME);
    await userEvent.click(screen.getByRole("button", { name: "Registrar la passkey" }));

    await expect.poll(() => vi.mocked(services.signalUnknownCredential).mock.calls.length).toBe(1);
    expect(services.signalUnknownCredential).toHaveBeenCalledWith({
      rpId: "purosur.online",
      credentialId: "cred-1",
    });
  },
);

test("never signals the device when the registration options carry no rp id", async () => {
  const services = createServices({
    fetchRegistrationOptions: vi.fn().mockResolvedValue({
      kind: "ok",
      value: {
        displayName: "Lucía Pérez",
        options: { ...creationOptions, rp: { name: "Puro Sur" } },
      },
    }),
    startRegistration: vi.fn().mockResolvedValue(registrationResponse),
    redeemRecovery: vi.fn().mockResolvedValue({ kind: "validation_failed" }),
  });

  const screen = await render(<RegisterPasskeyScreen services={services} />);
  await fillName(screen, PASSKEY_NAME);
  await userEvent.click(screen.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(screen.getByText("No se pudo registrar la passkey")).toBeVisible();
  expect(services.signalUnknownCredential).not.toHaveBeenCalled();
});

test("never signals the device when the credential is already registered", async () => {
  const services = createServices({
    fetchRegistrationOptions: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { displayName: "Lucía Pérez", options: registrationOptions },
    }),
    startRegistration: vi.fn().mockResolvedValue(registrationResponse),
    redeemRecovery: vi.fn().mockResolvedValue({ kind: "already_registered" }),
  });

  const screen = await render(<RegisterPasskeyScreen services={services} />);
  await fillName(screen, PASSKEY_NAME);
  await userEvent.click(screen.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(screen.getByText("No se pudo registrar la passkey")).toBeVisible();
  expect(services.signalUnknownCredential).not.toHaveBeenCalled();
});

test("never signals the device on a generic redeem failure (network error or 5xx)", async () => {
  const services = createServices({
    fetchRegistrationOptions: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { displayName: "Lucía Pérez", options: registrationOptions },
    }),
    startRegistration: vi.fn().mockResolvedValue(registrationResponse),
    redeemRecovery: vi.fn().mockResolvedValue({ kind: "failed" }),
  });

  const screen = await render(<RegisterPasskeyScreen services={services} />);
  await fillName(screen, PASSKEY_NAME);
  await userEvent.click(screen.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(screen.getByText("No se pudo registrar la passkey")).toBeVisible();
  expect(services.signalUnknownCredential).not.toHaveBeenCalled();
});

test("behaves exactly like any other rejected attempt when the credential is already registered", async () => {
  const services = createServices({
    fetchRegistrationOptions: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { displayName: "Lucía Pérez", options: registrationOptions },
    }),
    startRegistration: vi.fn().mockResolvedValue(registrationResponse),
    redeemRecovery: vi.fn().mockResolvedValue({ kind: "already_registered" }),
  });

  const screen = await render(<RegisterPasskeyScreen services={services} />);
  await fillName(screen, PASSKEY_NAME);
  await userEvent.click(screen.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(screen.getByText("No se pudo registrar la passkey")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Registrar la passkey" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Pedir un enlace nuevo" }).query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchRegistrationOptions).mock.calls.length).toBe(2);
});

test("retries with fresh options after another tab replaced this link's challenge", async () => {
  const staleOptions = { ...creationOptions, challenge: "from-this-tab" };
  const freshOptions = { ...creationOptions, challenge: "fetched-again" };
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
  const redeemRecovery = vi
    .fn()
    .mockResolvedValueOnce({ kind: "validation_failed" })
    .mockResolvedValueOnce({ kind: "ok" });
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
    redeemRecovery: vi.fn().mockResolvedValue({ kind: "ok" }),
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

test("shows the passkey name the cloud refused on the name field, still reading fresh options and signaling the device", async () => {
  const fetchRegistrationOptions = vi.fn().mockResolvedValue({
    kind: "ok",
    value: { displayName: "Lucía Pérez", options: registrationOptions },
  });
  const services = createServices({
    fetchRegistrationOptions,
    startRegistration: vi.fn().mockResolvedValue(registrationResponse),
    redeemRecovery: vi.fn().mockResolvedValue({ kind: "validation_failed", field: "passkey_name" }),
  });

  const screen = await render(<RegisterPasskeyScreen services={services} />);
  await fillName(screen, PASSKEY_NAME);
  await userEvent.click(screen.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(screen.getByText("Revisá el nombre de la passkey.")).toBeVisible();
  expect(screen.getByText("No se pudo registrar la passkey").query()).toBeNull();
  await expect.poll(() => fetchRegistrationOptions.mock.calls.length).toBe(2);
  expect(services.signalUnknownCredential).toHaveBeenCalledWith({
    rpId: "purosur.online",
    credentialId: "cred-1",
  });
});

test("sends the trimmed passkey name", async () => {
  const services = createServices({
    fetchRegistrationOptions: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { displayName: "Lucía Pérez", options: registrationOptions },
    }),
    startRegistration: vi.fn().mockResolvedValue(registrationResponse),
    redeemRecovery: vi.fn().mockResolvedValue({ kind: "ok" }),
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

test("shows the rate limit a redeem hit, naming when to retry, without a new-link offer", async () => {
  const services = createServices({
    fetchRegistrationOptions: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { displayName: "Lucía Pérez", options: registrationOptions },
    }),
    startRegistration: vi.fn().mockResolvedValue(registrationResponse),
    redeemRecovery: vi.fn().mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 3600 }),
  });

  const screen = await render(<RegisterPasskeyScreen services={services} />);
  await fillName(screen, PASSKEY_NAME);
  await userEvent.click(screen.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(screen.getByText("Demasiados intentos desde esta conexión")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 60 minutos.")).toBeVisible();
  expect(screen.getByRole("link", { name: "Pedir un enlace nuevo" }).query()).toBeNull();
});

test.each([
  ["invalid" as const, "Este enlace no es válido"],
  ["expired" as const, "Este enlace venció"],
])(
  "moves to the %s state when redeem discovers the token changed meanwhile",
  async (kind, title) => {
    const services = createServices({
      fetchRegistrationOptions: vi.fn().mockResolvedValue({
        kind: "ok",
        value: { displayName: "Lucía Pérez", options: registrationOptions },
      }),
      startRegistration: vi.fn().mockResolvedValue(registrationResponse),
      redeemRecovery: vi.fn().mockResolvedValue({ kind }),
    });

    const screen = await render(<RegisterPasskeyScreen services={services} />);
    await fillName(screen, PASSKEY_NAME);
    await userEvent.click(screen.getByRole("button", { name: "Registrar la passkey" }));

    await expect.element(screen.getByText(title)).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Pedir un enlace nuevo" }).element().getAttribute("href"),
    ).toBe("/account-recovery");
  },
);

test("keeps the form disabled while the options are read again after a rejected attempt", async () => {
  const reread = deferred<unknown>();
  const fetchRegistrationOptions = vi
    .fn()
    .mockResolvedValueOnce({
      kind: "ok",
      value: { displayName: "Lucía Pérez", options: registrationOptions },
    })
    .mockReturnValueOnce(reread.promise);
  const services = createServices({
    fetchRegistrationOptions,
    startRegistration: vi.fn().mockResolvedValue(registrationResponse),
    redeemRecovery: vi.fn().mockResolvedValue({ kind: "validation_failed" }),
  });

  const screen = await render(<RegisterPasskeyScreen services={services} />);
  await fillName(screen, PASSKEY_NAME);
  await userEvent.click(screen.getByRole("button", { name: "Registrar la passkey" }));

  await expect.element(screen.getByText("No se pudo registrar la passkey")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Registrar la passkey" })).toBeDisabled();
  reread.resolve({
    kind: "ok",
    value: { displayName: "Lucía Pérez", options: registrationOptions },
  });
  await expect
    .element(screen.getByRole("button", { name: "Registrar la passkey" }))
    .not.toBeDisabled();
});

test.each([
  ["burned", { kind: "burned" }, "Este enlace ya no se puede usar"],
  ["invalid", { kind: "invalid" }, "Este enlace no es válido"],
  ["expired", { kind: "expired" }, "Este enlace venció"],
  ["rate limited", { kind: "rate_limited", retryAfterSeconds: 120 }, "Demasiadas solicitudes"],
  ["failed", { kind: "failed" }, "No pudimos abrir el registro"],
] as const)(
  "shows the outcome of reading the options again after a rejected attempt: %s",
  async (_, outcome, title) => {
    const fetchRegistrationOptions = vi
      .fn()
      .mockResolvedValueOnce({
        kind: "ok",
        value: { displayName: "Lucía Pérez", options: registrationOptions },
      })
      .mockResolvedValueOnce(outcome);
    const services = createServices({
      fetchRegistrationOptions,
      startRegistration: vi.fn().mockResolvedValue(registrationResponse),
      redeemRecovery: vi.fn().mockResolvedValue({ kind: "validation_failed" }),
    });

    const screen = await render(<RegisterPasskeyScreen services={services} />);
    await fillName(screen, PASSKEY_NAME);
    await userEvent.click(screen.getByRole("button", { name: "Registrar la passkey" }));

    await expect.element(screen.getByText(title)).toBeVisible();
    expect(screen.getByRole("button", { name: "Registrar la passkey" }).query()).toBeNull();
  },
);

function Visits({ services }: { services: RegisterPasskeyScreenServices }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(!open)}>
        alternar
      </button>
      {open ? <RegisterPasskeyScreen services={services} /> : null}
    </>
  );
}

test("a later visit reads a new challenge instead of showing the one of the earlier visit", async () => {
  const secondVisit = deferred<unknown>();
  const fetchRegistrationOptions = vi
    .fn()
    .mockResolvedValueOnce({
      kind: "ok",
      value: { displayName: "Lucía Pérez", options: registrationOptions },
    })
    .mockReturnValueOnce(secondVisit.promise);
  const services = createServices({ fetchRegistrationOptions });

  const screen = await render(<Visits services={services} />);
  await expect.element(screen.getByRole("button", { name: "Registrar la passkey" })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "alternar" }));
  window.history.pushState(null, "", "/account-recovery/passkey#the-token");
  await userEvent.click(screen.getByRole("button", { name: "alternar" }));

  await expect.element(screen.getByRole("status")).toHaveTextContent("Cargando…");
  expect(screen.getByRole("button", { name: "Registrar la passkey" }).query()).toBeNull();
  expect(fetchRegistrationOptions).toHaveBeenCalledTimes(2);
});
