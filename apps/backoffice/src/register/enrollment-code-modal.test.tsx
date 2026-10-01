import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { type EmissionState, EnrollmentCodeModal } from "./enrollment-code-modal";
import type { RegisterSummary } from "./registers-api";

const register1: RegisterSummary = {
  id: "register-1",
  name: "Caja 1",
  pendingCode: null,
  pointOfSaleNumber: null,
};

function modalFor(
  emission: EmissionState,
  handlers: {
    onClose?: () => void;
    onDone?: () => void;
    onRetry?: (register: RegisterSummary) => void;
  } = {},
) {
  return (
    <main>
      <EnrollmentCodeModal
        emission={emission}
        onClose={handlers.onClose ?? (() => {})}
        onDone={handlers.onDone ?? (() => {})}
        onRetry={handlers.onRetry ?? (() => {})}
      />
    </main>
  );
}

test("shows an issued code grouped in fours, with the expiry note and description", async () => {
  const screen = await render(
    modalFor({ kind: "issued", register: register1, code: "P4NX7KWE2QRT8MZD" }),
  );

  const dialog = screen.getByRole("dialog", { name: "Código de alta" });
  await expect.element(dialog.getByText("Caja 1")).toBeVisible();
  await expect.element(dialog.getByText("P4NX 7KWE 2QRT 8MZD")).toBeVisible();
  await expect.element(dialog.getByText("Vence en 15 minutos · se usa una sola vez")).toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "En la notebook nueva, al abrir la caja por primera vez, se escribe este código. Después de 5 intentos equivocados deja de servir y hay que emitir otro.",
      ),
    )
    .toBeVisible();
});

test("while the code is being emitted, neither the close button nor Escape dismisses the modal", async () => {
  const onClose = vi.fn();
  const screen = await render(modalFor({ kind: "issuing", register: register1 }, { onClose }));
  const dialog = screen.getByRole("dialog", { name: "Código de alta" });
  await expect.element(dialog.getByText("Emitiendo el código…")).toBeVisible();

  expect(dialog.getByRole("button", { name: "Cerrar" }).query()).toBeNull();
  await userEvent.keyboard("{Escape}");
  await expect.element(dialog).toBeVisible();
  expect(onClose).not.toHaveBeenCalled();

  await screen.rerender(
    modalFor({ kind: "issued", register: register1, code: "P4NX7KWE2QRT8MZD" }, { onClose }),
  );
  await expect.element(dialog.getByText("P4NX 7KWE 2QRT 8MZD")).toBeVisible();
});

test("Listo stays disabled until the code is issued, then reports the modal done", async () => {
  const onDone = vi.fn();
  const screen = await render(modalFor({ kind: "issuing", register: register1 }, { onDone }));
  const dialog = screen.getByRole("dialog", { name: "Código de alta" });
  await expect.element(dialog.getByRole("button", { name: "Listo" })).toBeDisabled();

  await screen.rerender(
    modalFor({ kind: "issued", register: register1, code: "P4NX7KWE2QRT8MZD" }, { onDone }),
  );
  await userEvent.click(dialog.getByRole("button", { name: "Listo" }));

  expect(onDone).toHaveBeenCalledTimes(1);
});

test("a failed emission shows the error, and Reintentar retries for the same register", async () => {
  const onRetry = vi.fn();
  const screen = await render(
    modalFor({ kind: "attemptFailed", register: register1 }, { onRetry }),
  );
  const dialog = screen.getByRole("dialog", { name: "Código de alta" });

  await expect.element(dialog.getByText("No se pudo emitir el código")).toBeVisible();
  await expect.element(dialog.getByText("Probá de nuevo.")).toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Reintentar" }));

  expect(onRetry).toHaveBeenCalledWith(register1);
});

test("a rate-limited emission says when to try again, and Reintentar retries for the same register", async () => {
  const onRetry = vi.fn();
  const screen = await render(
    modalFor({ kind: "rateLimited", register: register1, retryAfterSeconds: 120 }, { onRetry }),
  );
  const dialog = screen.getByRole("dialog", { name: "Código de alta" });

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Reintentar" }));

  expect(onRetry).toHaveBeenCalledWith(register1);
});
