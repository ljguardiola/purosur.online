import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { type EmissionState, EmitUserPinCodeModal } from "./emit-user-pin-code-modal";

const lucia = { id: "user-1", firstName: "Lucía" };

function modalFor(
  emission: EmissionState,
  handlers: { onClose?: () => void; onDone?: () => void; onRetry?: () => void } = {},
) {
  return (
    <main>
      <EmitUserPinCodeModal
        emission={emission}
        onClose={handlers.onClose ?? (() => {})}
        onDone={handlers.onDone ?? (() => {})}
        onRetry={handlers.onRetry ?? (() => {})}
      />
    </main>
  );
}

test("shows the issued code grouped in fours, its expiry note and what the person does at the register", async () => {
  const screen = await render(modalFor({ kind: "issued", user: lucia, code: "K7QM2XPA7DTR4HWN" }));

  const dialog = screen.getByRole("dialog", { name: "Código para reiniciar el PIN" });
  await expect.element(dialog.getByText("Lucía", { exact: true })).toBeVisible();
  await expect.element(dialog.getByText("K7QM 2XPA 7DTR 4HWN")).toBeVisible();
  await expect.element(dialog.getByText("Vence en 15 minutos · se usa una sola vez")).toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "En la caja, con internet, Lucía escribe este código y elige un PIN nuevo de al menos 6 dígitos. Su PIN anterior ya no sirve.",
      ),
    )
    .toBeVisible();
});

test("has no accessibility violations once the code is shown", async () => {
  const screen = await render(modalFor({ kind: "issued", user: lucia, code: "K7QM2XPA7DTR4HWN" }));
  await expect
    .element(screen.getByRole("dialog", { name: "Código para reiniciar el PIN" }))
    .toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});

test("Listo reports the modal done once the code is issued", async () => {
  const onDone = vi.fn();
  const screen = await render(
    modalFor({ kind: "issued", user: lucia, code: "K7QM2XPA7DTR4HWN" }, { onDone }),
  );

  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Código para reiniciar el PIN" })
      .getByRole("button", { name: "Listo" }),
  );

  expect(onDone).toHaveBeenCalledTimes(1);
});

test("while the code is being emitted, Listo is disabled and neither Escape nor a close button dismisses the modal", async () => {
  const onClose = vi.fn();
  const screen = await render(modalFor({ kind: "issuing", user: lucia }, { onClose }));
  const dialog = screen.getByRole("dialog", { name: "Código para reiniciar el PIN" });

  await expect.element(dialog.getByText("Emitiendo el código…")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Listo" })).toBeDisabled();
  expect(dialog.getByRole("button", { name: "Cerrar" }).query()).toBeNull();
  await userEvent.keyboard("{Escape}");
  await expect.element(dialog).toBeVisible();
  expect(onClose).not.toHaveBeenCalled();
});

test("a failed emission shows the error, and Reintentar asks to emit again", async () => {
  const onRetry = vi.fn();
  const screen = await render(modalFor({ kind: "attemptFailed", user: lucia }, { onRetry }));
  const dialog = screen.getByRole("dialog", { name: "Código para reiniciar el PIN" });

  await expect.element(dialog.getByText("No se pudo emitir el código")).toBeVisible();
  await expect.element(dialog.getByText("Probá de nuevo.")).toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Reintentar" }));

  expect(onRetry).toHaveBeenCalledTimes(1);
});

test("a rate-limited emission says when to try again, and Reintentar asks to emit again", async () => {
  const onRetry = vi.fn();
  const screen = await render(
    modalFor({ kind: "rateLimited", user: lucia, retryAfterSeconds: 120 }, { onRetry }),
  );
  const dialog = screen.getByRole("dialog", { name: "Código para reiniciar el PIN" });

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Reintentar" }));

  expect(onRetry).toHaveBeenCalledTimes(1);
});

test("Escape dismisses the modal after a failed emission", async () => {
  const onClose = vi.fn();
  await render(modalFor({ kind: "attemptFailed", user: lucia }, { onClose }));

  await userEvent.keyboard("{Escape}");

  expect(onClose).toHaveBeenCalledTimes(1);
});

test("renders nothing while closed", async () => {
  const screen = await render(modalFor({ kind: "closed" }));

  expect(screen.getByRole("dialog").query()).toBeNull();
});
