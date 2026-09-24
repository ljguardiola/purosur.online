import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import { SignInScreen, type SignInScreenServices } from "./SignInScreen";

const authenticationOptions = { challenge: "abc", rpId: "purosur.online" } as never;
const assertionResponse = { id: "cred-1" } as never;

function createServices(overrides: Partial<SignInScreenServices> = {}): SignInScreenServices {
  return {
    fetchAuthenticationOptions: vi.fn(),
    authenticate: vi.fn(),
    startAuthentication: vi.fn(),
    ...overrides,
  };
}

test("shows the sign-in heading, its passkey copy, the submit button and the recovery link", async () => {
  const screen = await render(<SignInScreen onSignedIn={() => {}} />);

  await expect.element(screen.getByRole("heading", { name: "Ingresar", level: 1 })).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Con la passkey de este dispositivo: la huella, la cara o el PIN de la computadora o del teléfono.",
      ),
    )
    .toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Ingresar con passkey" })).toBeVisible();

  const link = screen.getByRole("link", { name: "Perdí mis passkeys" }).element();
  expect(link.getAttribute("href")).toBe("/account-recovery");

  await expectNoAccessibilityViolations(screen.container);
});

test("signs in and calls onSignedIn when the browser's assertion is accepted", async () => {
  const services = createServices({
    fetchAuthenticationOptions: vi
      .fn()
      .mockResolvedValue({ kind: "ok", value: authenticationOptions }),
    authenticate: vi.fn().mockResolvedValue({ kind: "ok" }),
    startAuthentication: vi.fn().mockResolvedValue(assertionResponse),
  });
  const onSignedIn = vi.fn();

  const screen = await render(<SignInScreen onSignedIn={onSignedIn} services={services} />);
  await userEvent.click(screen.getByRole("button", { name: "Ingresar con passkey" }));

  await expect.poll(() => onSignedIn.mock.calls.length).toBe(1);
  expect(services.startAuthentication).toHaveBeenCalledWith({
    optionsJSON: authenticationOptions,
  });
  expect(services.authenticate).toHaveBeenCalledWith(assertionResponse);
});

test("shows a blocked notice, without navigating away, when the cloud reports the lockout", async () => {
  const services = createServices({
    fetchAuthenticationOptions: vi
      .fn()
      .mockResolvedValue({ kind: "ok", value: authenticationOptions }),
    startAuthentication: vi.fn().mockResolvedValue(assertionResponse),
    authenticate: vi.fn().mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 900 }),
  });
  const onSignedIn = vi.fn();

  const screen = await render(<SignInScreen onSignedIn={onSignedIn} services={services} />);
  await userEvent.click(screen.getByRole("button", { name: "Ingresar con passkey" }));

  await expect.element(screen.getByText("Demasiados intentos desde esta conexión")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 15 minutos.")).toBeVisible();
  expect(onSignedIn).not.toHaveBeenCalled();

  await expectNoAccessibilityViolations(screen.container);
});

test("shows the session-expired notice up front when the app opens it that way", async () => {
  const screen = await render(
    <SignInScreen openingNotice={{ kind: "expired" }} onSignedIn={() => {}} />,
  );

  await expect.element(screen.getByText("Tu sesión venció")).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Se cierra sola a los 30 minutos sin uso o a las 12 horas de haber ingresado.",
      ),
    )
    .toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});

test("lets the person retry after the browser cancels the passkey prompt, clearing the expired notice", async () => {
  const services = createServices({
    fetchAuthenticationOptions: vi
      .fn()
      .mockResolvedValue({ kind: "ok", value: authenticationOptions }),
    startAuthentication: vi.fn().mockRejectedValue(new Error("NotAllowedError")),
  });

  const screen = await render(
    <SignInScreen openingNotice={{ kind: "expired" }} onSignedIn={() => {}} services={services} />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Ingresar con passkey" }));

  await expect.element(screen.getByText("No se pudo ingresar")).toBeVisible();
  expect(screen.getByText("Tu sesión venció").query()).toBeNull();
  expect(services.authenticate).not.toHaveBeenCalled();
  await expect
    .element(screen.getByRole("button", { name: "Ingresar con passkey" }))
    .not.toBeDisabled();
});

test("shows that the session could not be checked when the app opens it that way", async () => {
  const screen = await render(
    <SignInScreen openingNotice={{ kind: "check_failed" }} onSignedIn={() => {}} />,
  );

  await expect.element(screen.getByText("No pudimos verificar tu sesión")).toBeVisible();
  await expect.element(screen.getByText("Probá de nuevo en unos minutos.")).toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});

test("shows a rate-limited notice up front when the app opens it that way", async () => {
  const screen = await render(
    <SignInScreen
      openingNotice={{ kind: "rate_limited", retryAfterSeconds: 120 }}
      onSignedIn={() => {}}
    />,
  );

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});

test("shows a generic failure notice when fetching the authentication options fails", async () => {
  const services = createServices({
    fetchAuthenticationOptions: vi.fn().mockResolvedValue({ kind: "failed" }),
  });

  const screen = await render(<SignInScreen onSignedIn={() => {}} services={services} />);
  await userEvent.click(screen.getByRole("button", { name: "Ingresar con passkey" }));

  await expect.element(screen.getByText("No se pudo ingresar")).toBeVisible();
  expect(services.startAuthentication).not.toHaveBeenCalled();
});

test("shows a generic failure notice when the cloud rejects the assertion", async () => {
  const services = createServices({
    fetchAuthenticationOptions: vi
      .fn()
      .mockResolvedValue({ kind: "ok", value: authenticationOptions }),
    startAuthentication: vi.fn().mockResolvedValue(assertionResponse),
    authenticate: vi.fn().mockResolvedValue({ kind: "failed" }),
  });

  const screen = await render(<SignInScreen onSignedIn={() => {}} services={services} />);
  await userEvent.click(screen.getByRole("button", { name: "Ingresar con passkey" }));

  await expect.element(screen.getByText("No se pudo ingresar")).toBeVisible();
});

test("disables the submit button while a sign-in attempt is in flight", async () => {
  const services = createServices({
    fetchAuthenticationOptions: vi.fn().mockResolvedValue(new Promise(() => {}) as never),
  });

  const screen = await render(<SignInScreen onSignedIn={() => {}} services={services} />);
  await userEvent.click(screen.getByRole("button", { name: "Ingresar con passkey" }));

  await expect.element(screen.getByRole("button", { name: "Ingresar con passkey" })).toBeDisabled();
});
