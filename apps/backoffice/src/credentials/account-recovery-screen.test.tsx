import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { AccountRecoveryScreen } from "./account-recovery-screen";
import type { AccountRecoveryScreenServices } from "./account-recovery-services";

function createServices(
  overrides: Partial<AccountRecoveryScreenServices> = {},
): AccountRecoveryScreenServices {
  return {
    requestRecoveryLink: vi.fn(),
    ...overrides,
  };
}

// Chromium folds the required asterisk into the input's accessible name, so this queries by role
// alone: the form has only one textbox.
async function fillEmail(screen: Awaited<ReturnType<typeof render>>, value: string) {
  await userEvent.fill(screen.getByRole("textbox"), value);
}

test("shows the recovery form with its heading, email field, submit button and back link", async () => {
  const screen = await render(<AccountRecoveryScreen services={createServices()} />);

  await expect
    .element(screen.getByRole("heading", { name: "Recuperar el acceso", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByRole("textbox")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Enviar el enlace" })).toBeVisible();
  const backLink = screen.getByRole("link", { name: "Volver a ingresar" }).element();
  expect(backLink.getAttribute("href")).toBe("/sign-in");

  await expectNoAccessibilityViolations(screen.container);
});

test("rejects an empty email without calling the API", async () => {
  const services = createServices();
  const screen = await render(<AccountRecoveryScreen services={services} />);

  await userEvent.click(screen.getByRole("button", { name: "Enviar el enlace" }));

  await expect.element(screen.getByText("Ingresá tu correo.")).toBeVisible();
  expect(services.requestRecoveryLink).not.toHaveBeenCalled();
});

test("rejects a malformed email without calling the API", async () => {
  const services = createServices();
  const screen = await render(<AccountRecoveryScreen services={services} />);

  await fillEmail(screen, "not-an-email");
  await userEvent.click(screen.getByRole("button", { name: "Enviar el enlace" }));

  await expect.element(screen.getByText("Ingresá un correo válido.")).toBeVisible();
  expect(services.requestRecoveryLink).not.toHaveBeenCalled();
});

test("rejects an email longer than any address can be without calling the API", async () => {
  const services = createServices();
  const screen = await render(<AccountRecoveryScreen services={services} />);

  await fillEmail(screen, `${"a".repeat(250)}@purosur.online`);
  await userEvent.click(screen.getByRole("button", { name: "Enviar el enlace" }));

  await expect.element(screen.getByText("Ingresá un correo válido.")).toBeVisible();
  expect(services.requestRecoveryLink).not.toHaveBeenCalled();
});

test("shows the email the cloud refused on the email field, not as a notice", async () => {
  const services = createServices({
    requestRecoveryLink: vi.fn().mockResolvedValue({ kind: "validation_failed", field: "email" }),
  });
  const screen = await render(<AccountRecoveryScreen services={services} />);

  await fillEmail(screen, "lucia.perez@purosur.online");
  await userEvent.click(screen.getByRole("button", { name: "Enviar el enlace" }));

  await expect.element(screen.getByText("Revisá tu correo.")).toBeVisible();
  await expect.element(screen.getByText("No pudimos enviar el enlace")).not.toBeInTheDocument();
});

test("a field the form does not have that the cloud refused shows the generic notice", async () => {
  const services = createServices({
    requestRecoveryLink: vi.fn().mockResolvedValue({ kind: "validation_failed", field: "other" }),
  });
  const screen = await render(<AccountRecoveryScreen services={services} />);

  await fillEmail(screen, "lucia.perez@purosur.online");
  await userEvent.click(screen.getByRole("button", { name: "Enviar el enlace" }));

  await expect.element(screen.getByText("No pudimos enviar el enlace")).toBeVisible();
});

test("confirms the link was sent, with the uniform notice, after a successful submit", async () => {
  const services = createServices({
    requestRecoveryLink: vi.fn().mockResolvedValue({ kind: "sent" }),
  });
  const screen = await render(<AccountRecoveryScreen services={services} />);

  await fillEmail(screen, "lucia.perez@purosur.online");
  await userEvent.click(screen.getByRole("button", { name: "Enviar el enlace" }));

  await expect
    .element(screen.getByRole("heading", { name: "Revisá tu correo", level: 1 }))
    .toBeVisible();
  await expect
    .element(screen.getByText("Si el correo es de una cuenta, te enviamos el enlace"))
    .toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Vale 15 minutos y se usa una sola vez. Si no aparece, mirá en correo no deseado.",
      ),
    )
    .toBeVisible();
  expect(services.requestRecoveryLink).toHaveBeenCalledWith("lucia.perez@purosur.online");

  await expectNoAccessibilityViolations(screen.container);
});

test("shows a rate-limited notice that does not blame the connection, naming when to retry", async () => {
  const services = createServices({
    requestRecoveryLink: vi.fn().mockResolvedValue({
      kind: "rate_limited",
      retryAfterSeconds: 3600,
    }),
  });
  const screen = await render(<AccountRecoveryScreen services={services} />);

  await fillEmail(screen, "lucia.perez@purosur.online");
  await userEvent.click(screen.getByRole("button", { name: "Enviar el enlace" }));

  await expect.element(screen.getByText("Demasiados pedidos de recuperación")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 60 minutos.")).toBeVisible();
  expect(screen.getByText(/conexi[oó]n/i).query()).toBeNull();

  await expectNoAccessibilityViolations(screen.container);
});

test("shows a generic error notice on any other failure", async () => {
  const services = createServices({
    requestRecoveryLink: vi.fn().mockResolvedValue({ kind: "failed" }),
  });
  const screen = await render(<AccountRecoveryScreen services={services} />);

  await fillEmail(screen, "lucia.perez@purosur.online");
  await userEvent.click(screen.getByRole("button", { name: "Enviar el enlace" }));

  await expect.element(screen.getByText("No pudimos enviar el enlace")).toBeVisible();
  await expect.element(screen.getByText("Probá de nuevo en unos minutos.")).toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});
