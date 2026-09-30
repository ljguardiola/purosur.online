import type { TagSummary } from "@purosur/contracts";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { ReactivateTagModal, type ReactivateTagModalServices } from "./reactivate-tag-modal";
import { sinColorantes } from "./test-support/tags";

afterEach(() => {
  window.history.pushState(null, "", "/");
});

function renderModal({
  reactivateTag = vi.fn<ReactivateTagModalServices["reactivateTag"]>(),
  target = sinColorantes,
  onReactivated = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: {
  reactivateTag?: ReactivateTagModalServices["reactivateTag"];
  target?: TagSummary;
  onReactivated?: () => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
} = {}) {
  return render(
    <main>
      <ReactivateTagModal
        target={target}
        onClose={onClose}
        onReactivated={onReactivated}
        onSessionEnded={onSessionEnded}
        services={{ reactivateTag }}
      />
    </main>,
  );
}

async function confirm(screen: Awaited<ReturnType<typeof renderModal>>) {
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Reactivar" }));
  return dialog;
}

test("asks about the tag by name, saying what happens to the products that have it", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await expect
    .element(dialog.getByRole("heading", { name: '¿Reactivar el distintivo "Sin colorantes"?' }))
    .toBeVisible();
  await expect
    .element(dialog.getByText("Vuelve a ofrecerse para asignarlo a productos nuevos."))
    .toBeVisible();
});

test("confirming changes the tag and reports it", async () => {
  const reactivateTag = vi
    .fn<ReactivateTagModalServices["reactivateTag"]>()
    .mockResolvedValue({ kind: "ok" });
  const onReactivated = vi.fn();
  const screen = await renderModal({ reactivateTag, onReactivated });

  await confirm(screen);

  expect(reactivateTag).toHaveBeenCalledWith("tag-3");
  await expect.poll(() => onReactivated.mock.calls.length).toBe(1);
});

test("cancel closes the question without calling the API", async () => {
  const reactivateTag = vi.fn<ReactivateTagModalServices["reactivateTag"]>();
  const onClose = vi.fn();
  const screen = await renderModal({ reactivateTag, onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(reactivateTag).not.toHaveBeenCalled();
});

test("tells when the tag was already changed, and updating the list reports it", async () => {
  const reactivateTag = vi.fn<ReactivateTagModalServices["reactivateTag"]>().mockResolvedValue({
    kind: "already_changed",
  });
  const onReactivated = vi.fn();
  const screen = await renderModal({ reactivateTag, onReactivated });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Ya estaba activo");
  await userEvent.click(dialog.getByRole("button", { name: "Actualizar la lista" }));

  expect(onReactivated).toHaveBeenCalledTimes(1);
});

test("tells when the tag no longer exists", async () => {
  const reactivateTag = vi
    .fn<ReactivateTagModalServices["reactivateTag"]>()
    .mockResolvedValue({ kind: "not_found" });
  const screen = await renderModal({ reactivateTag });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Este distintivo ya no existe");
});

test("shows the failure notice, and the confirmation stays available", async () => {
  const reactivateTag = vi
    .fn<ReactivateTagModalServices["reactivateTag"]>()
    .mockResolvedValue({ kind: "failed" });
  const screen = await renderModal({ reactivateTag });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByText("No se reactivó el distintivo")).toBeVisible();
  await expect.element(dialog.getByText("Volvé a intentarlo.")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Reactivar" })).toBeEnabled();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const reactivateTag = vi.fn<ReactivateTagModalServices["reactivateTag"]>().mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 60,
  });
  const screen = await renderModal({ reactivateTag });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
});

test("navigates to Mi cuenta when the change comes back forbidden", async () => {
  window.history.pushState(null, "", "/tags");
  const reactivateTag = vi
    .fn<ReactivateTagModalServices["reactivateTag"]>()
    .mockResolvedValue({ kind: "forbidden" });
  const screen = await renderModal({ reactivateTag });

  await confirm(screen);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("ends the session when the change finds no open session", async () => {
  const reactivateTag = vi.fn<ReactivateTagModalServices["reactivateTag"]>().mockResolvedValue({
    kind: "unauthenticated",
  });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ reactivateTag, onSessionEnded });

  await confirm(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
