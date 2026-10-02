import type { TagSummary } from "@purosur/contracts";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { DeactivateTagModal, type DeactivateTagModalServices } from "./deactivate-tag-modal";
import { sinTacc } from "./test-support/tags";

afterEach(() => {
  window.history.pushState(null, "", "/");
});

function renderModal({
  deactivateTag = vi.fn<DeactivateTagModalServices["deactivateTag"]>(),
  target = sinTacc,
  onDeactivated = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: {
  deactivateTag?: DeactivateTagModalServices["deactivateTag"];
  target?: TagSummary;
  onDeactivated?: () => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
} = {}) {
  return render(
    <main>
      <DeactivateTagModal
        target={target}
        onClose={onClose}
        onDeactivated={onDeactivated}
        onSessionEnded={onSessionEnded}
        services={{ deactivateTag }}
      />
    </main>,
  );
}

async function confirm(screen: Awaited<ReturnType<typeof renderModal>>) {
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));
  return dialog;
}

test("asks about the tag by name, saying what happens to the products that have it", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await expect
    .element(dialog.getByRole("heading", { name: '¿Desactivar el distintivo "Sin TACC"?' }))
    .toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "Deja de ofrecerse para asignar a un producto nuevo. Los productos que ya lo tienen lo conservan.",
      ),
    )
    .toBeVisible();
});

test("confirming changes the tag and reports it", async () => {
  const deactivateTag = vi
    .fn<DeactivateTagModalServices["deactivateTag"]>()
    .mockResolvedValue({ kind: "ok" });
  const onDeactivated = vi.fn();
  const screen = await renderModal({ deactivateTag, onDeactivated });

  await confirm(screen);

  expect(deactivateTag).toHaveBeenCalledWith("7a600000-0000-4000-8000-000000000001");
  await expect.poll(() => onDeactivated.mock.calls.length).toBe(1);
});

test("cancel closes the question without calling the API", async () => {
  const deactivateTag = vi.fn<DeactivateTagModalServices["deactivateTag"]>();
  const onClose = vi.fn();
  const screen = await renderModal({ deactivateTag, onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(deactivateTag).not.toHaveBeenCalled();
});

test("tells when the tag was already changed, and updating the list reports it", async () => {
  const deactivateTag = vi.fn<DeactivateTagModalServices["deactivateTag"]>().mockResolvedValue({
    kind: "already_changed",
  });
  const onDeactivated = vi.fn();
  const screen = await renderModal({ deactivateTag, onDeactivated });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Ya estaba desactivado");
  await userEvent.click(dialog.getByRole("button", { name: "Actualizar la lista" }));

  expect(onDeactivated).toHaveBeenCalledTimes(1);
});

test("tells when the tag no longer exists", async () => {
  const deactivateTag = vi
    .fn<DeactivateTagModalServices["deactivateTag"]>()
    .mockResolvedValue({ kind: "not_found" });
  const screen = await renderModal({ deactivateTag });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Este distintivo ya no existe");
});

test("shows the failure notice, and the confirmation stays available", async () => {
  const deactivateTag = vi
    .fn<DeactivateTagModalServices["deactivateTag"]>()
    .mockResolvedValue({ kind: "failed" });
  const screen = await renderModal({ deactivateTag });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByText("No se desactivó el distintivo")).toBeVisible();
  await expect.element(dialog.getByText("Volvé a intentarlo.")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Desactivar" })).toBeEnabled();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const deactivateTag = vi.fn<DeactivateTagModalServices["deactivateTag"]>().mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 60,
  });
  const screen = await renderModal({ deactivateTag });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
});

test("navigates to Mi cuenta when the change comes back forbidden", async () => {
  window.history.pushState(null, "", "/tags");
  const deactivateTag = vi
    .fn<DeactivateTagModalServices["deactivateTag"]>()
    .mockResolvedValue({ kind: "forbidden" });
  const screen = await renderModal({ deactivateTag });

  await confirm(screen);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("ends the session when the change finds no open session", async () => {
  const deactivateTag = vi.fn<DeactivateTagModalServices["deactivateTag"]>().mockResolvedValue({
    kind: "unauthenticated",
  });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ deactivateTag, onSessionEnded });

  await confirm(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
