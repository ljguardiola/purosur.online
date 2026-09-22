import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import { RecuperarScreen } from "./RecuperarScreen";
import { requestRecoveryLink } from "./recoveryApi";

vi.mock("./recoveryApi", () => ({ requestRecoveryLink: vi.fn() }));

beforeEach(() => {
  vi.mocked(requestRecoveryLink).mockReset();
});

afterEach(() => {
  vi.mocked(requestRecoveryLink).mockReset();
});

// The required asterisk folds into the input's accessible name in Chromium (see
// TextField.test.tsx's own "marks a required field with an asterisk" test), so this queries by
// role alone: the form has only one textbox.
async function fillEmail(screen: Awaited<ReturnType<typeof render>>, value: string) {
  await userEvent.fill(screen.getByRole("textbox"), value);
}

test("shows the drawn recovery form and its back link", async () => {
  const screen = await render(<RecuperarScreen />);

  await expect
    .element(screen.getByRole("heading", { name: "Recuperar el acceso", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByRole("textbox")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Enviar el enlace" })).toBeVisible();
  const backLink = screen.getByRole("link", { name: "Volver a ingresar" }).element();
  expect(backLink.getAttribute("href")).toBe("/ingresar");

  await expectNoAccessibilityViolations(screen.container);
});

test("rejects an empty email without calling the API", async () => {
  const screen = await render(<RecuperarScreen />);

  await userEvent.click(screen.getByRole("button", { name: "Enviar el enlace" }));

  await expect.element(screen.getByText("Ingresá tu correo.")).toBeVisible();
  expect(requestRecoveryLink).not.toHaveBeenCalled();
});

test("rejects a malformed email without calling the API", async () => {
  const screen = await render(<RecuperarScreen />);

  await fillEmail(screen, "not-an-email");
  await userEvent.click(screen.getByRole("button", { name: "Enviar el enlace" }));

  await expect.element(screen.getByText("Ingresá un correo válido.")).toBeVisible();
  expect(requestRecoveryLink).not.toHaveBeenCalled();
});

test("shows Enlace enviado with its drawn copy after a successful submit", async () => {
  vi.mocked(requestRecoveryLink).mockResolvedValue({ kind: "sent" });
  const screen = await render(<RecuperarScreen />);

  await fillEmail(screen, "lucia.perez@purosur.online");
  await userEvent.click(screen.getByRole("button", { name: "Enviar el enlace" }));

  await expect
    .element(screen.getByRole("heading", { name: "Revisá tu correo", level: 1 }))
    .toBeVisible();
  await expect
    .element(screen.getByText("Si el correo es de una cuenta, ya llegó el enlace"))
    .toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Vale 15 minutos y se usa una sola vez. Si no aparece, mirá en correo no deseado.",
      ),
    )
    .toBeVisible();
  expect(requestRecoveryLink).toHaveBeenCalledWith("lucia.perez@purosur.online");

  await expectNoAccessibilityViolations(screen.container);
});

test("shows a rate-limited notice naming when to retry", async () => {
  vi.mocked(requestRecoveryLink).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 3600,
  });
  const screen = await render(<RecuperarScreen />);

  await fillEmail(screen, "lucia.perez@purosur.online");
  await userEvent.click(screen.getByRole("button", { name: "Enviar el enlace" }));

  await expect.element(screen.getByText("Demasiados pedidos desde esta conexión")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 60 minutos.")).toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});

test("shows a generic error notice on any other failure", async () => {
  vi.mocked(requestRecoveryLink).mockResolvedValue({ kind: "failed" });
  const screen = await render(<RecuperarScreen />);

  await fillEmail(screen, "lucia.perez@purosur.online");
  await userEvent.click(screen.getByRole("button", { name: "Enviar el enlace" }));

  await expect.element(screen.getByText("No pudimos enviar el enlace")).toBeVisible();
  await expect.element(screen.getByText("Probá de nuevo en un rato.")).toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});
