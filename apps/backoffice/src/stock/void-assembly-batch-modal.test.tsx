import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { mixBatch } from "./test-support/assembly-batches";
import {
  VoidAssemblyBatchModal,
  type VoidAssemblyBatchModalServices,
} from "./void-assembly-batch-modal";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function renderModal({
  voidAssemblyBatch = vi.fn<VoidAssemblyBatchModalServices["voidAssemblyBatch"]>(),
  onVoided = () => {},
  onOutdated = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: {
  voidAssemblyBatch?: VoidAssemblyBatchModalServices["voidAssemblyBatch"];
  onVoided?: () => void;
  onOutdated?: () => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
} = {}) {
  return render(
    <main>
      <VoidAssemblyBatchModal
        batch={mixBatch}
        onVoided={onVoided}
        onOutdated={onOutdated}
        onClose={onClose}
        onSessionEnded={onSessionEnded}
        services={{ voidAssemblyBatch }}
      />
    </main>,
  );
}

async function confirm(screen: Awaited<ReturnType<typeof renderModal>>) {
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Anular tanda" }));
  return dialog;
}

test("asks about the batch's product and says what voiding does", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await expect
    .element(dialog.getByRole("heading", { name: "¿Anular la tanda de Mix de frutos secos?" }))
    .toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "Los componentes vuelven al stock, se descuentan 4,950 kg de Mix de frutos secos y el lote de la tanda queda en cero.",
      ),
    )
    .toBeVisible();
});

test("confirming voids the batch and reports it", async () => {
  const voidAssemblyBatch = vi
    .fn<VoidAssemblyBatchModalServices["voidAssemblyBatch"]>()
    .mockResolvedValue({
      kind: "ok",
      batch: { id: mixBatch.id, voidedAt: "2026-09-16T10:00:00.000Z" },
    });
  const onVoided = vi.fn();
  const screen = await renderModal({ voidAssemblyBatch, onVoided });

  await confirm(screen);

  expect(voidAssemblyBatch).toHaveBeenCalledWith(mixBatch.id);
  await expect.poll(() => onVoided.mock.calls.length).toBe(1);
});

test("cancel closes the question without calling the cloud", async () => {
  const voidAssemblyBatch = vi.fn<VoidAssemblyBatchModalServices["voidAssemblyBatch"]>();
  const onClose = vi.fn();
  const screen = await renderModal({ voidAssemblyBatch, onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(voidAssemblyBatch).not.toHaveBeenCalled();
});

test("cannot be confirmed twice while the request is in flight", async () => {
  const pending =
    deferred<Awaited<ReturnType<VoidAssemblyBatchModalServices["voidAssemblyBatch"]>>>();
  const voidAssemblyBatch = vi
    .fn<VoidAssemblyBatchModalServices["voidAssemblyBatch"]>()
    .mockReturnValue(pending.promise);
  const screen = await renderModal({ voidAssemblyBatch });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByRole("button", { name: "Anular tanda" })).toBeDisabled();
  await expect.element(dialog.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  expect(voidAssemblyBatch).toHaveBeenCalledTimes(1);
  pending.resolve({ kind: "failed" });
});

test("cannot be closed, by its close button or by Escape, while the request is in flight", async () => {
  const pending =
    deferred<Awaited<ReturnType<VoidAssemblyBatchModalServices["voidAssemblyBatch"]>>>();
  const voidAssemblyBatch = vi
    .fn<VoidAssemblyBatchModalServices["voidAssemblyBatch"]>()
    .mockReturnValue(pending.promise);
  const onClose = vi.fn();
  const screen = await renderModal({ voidAssemblyBatch, onClose });
  const dialog = await confirm(screen);

  await userEvent.tab();
  await userEvent.keyboard("{Escape}");

  expect(onClose).not.toHaveBeenCalled();
  expect(dialog.getByRole("button", { name: "Cerrar" }).query()).toBeNull();
  await expect.element(screen.getByRole("dialog")).toBeVisible();
  pending.resolve({ kind: "failed" });
});

test.each([
  ["not_found", "No se encontró la tanda."],
  ["already_voided", "La tanda ya fue anulada."],
  ["consumed", "La tanda ya tuvo consumo: corregila con un ajuste y un recuento."],
] as const)(
  "tells %s in its own words, and updating the list reports it",
  async (kind, message) => {
    const voidAssemblyBatch = vi
      .fn<VoidAssemblyBatchModalServices["voidAssemblyBatch"]>()
      .mockResolvedValue({ kind });
    const onOutdated = vi.fn();
    const screen = await renderModal({ voidAssemblyBatch, onOutdated });
    const dialog = await confirm(screen);

    await expect.element(dialog.getByRole("alert")).toHaveTextContent(message);
    expect(dialog.getByRole("button", { name: "Anular tanda" }).query()).toBeNull();
    await userEvent.click(dialog.getByRole("button", { name: "Actualizar la lista" }));

    expect(onOutdated).toHaveBeenCalledTimes(1);
  },
);

test("shows the failure notice, and the confirmation stays available", async () => {
  const voidAssemblyBatch = vi
    .fn<VoidAssemblyBatchModalServices["voidAssemblyBatch"]>()
    .mockResolvedValue({ kind: "failed" });
  const screen = await renderModal({ voidAssemblyBatch });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByText("No se anuló la tanda")).toBeVisible();
  await expect.element(dialog.getByText("Volvé a intentarlo.")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Anular tanda" })).toBeEnabled();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const voidAssemblyBatch = vi
    .fn<VoidAssemblyBatchModalServices["voidAssemblyBatch"]>()
    .mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 60 });
  const screen = await renderModal({ voidAssemblyBatch });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Anular tanda" })).toBeEnabled();
});

test("navigates to Mi cuenta when the change comes back forbidden", async () => {
  window.history.pushState(null, "", "/assembly-batches");
  const voidAssemblyBatch = vi
    .fn<VoidAssemblyBatchModalServices["voidAssemblyBatch"]>()
    .mockResolvedValue({ kind: "forbidden" });
  const screen = await renderModal({ voidAssemblyBatch });

  await confirm(screen);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("ends the session when the change finds no open session", async () => {
  const voidAssemblyBatch = vi
    .fn<VoidAssemblyBatchModalServices["voidAssemblyBatch"]>()
    .mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ voidAssemblyBatch, onSessionEnded });

  await confirm(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
