import type { PackagingSummary } from "@purosur/contracts";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  DeactivatePackagingModal,
  type DeactivatePackagingModalServices,
} from "./deactivate-packaging-modal";
import { cajaDeMiel } from "./test-support/packagings";

afterEach(() => {
  window.history.pushState(null, "", "/");
});

function renderModal({
  deactivatePackaging = vi.fn<DeactivatePackagingModalServices["deactivatePackaging"]>(),
  target = cajaDeMiel,
  onDeactivated = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: {
  deactivatePackaging?: DeactivatePackagingModalServices["deactivatePackaging"];
  target?: PackagingSummary;
  onDeactivated?: () => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
} = {}) {
  return render(
    <main>
      <DeactivatePackagingModal
        target={target}
        onClose={onClose}
        onDeactivated={onDeactivated}
        onSessionEnded={onSessionEnded}
        services={{ deactivatePackaging }}
      />
    </main>,
  );
}

async function confirm(screen: Awaited<ReturnType<typeof renderModal>>) {
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));
  return dialog;
}

test("asks about the packaging by name, saying what happens to new purchases and to what was already registered", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await expect
    .element(dialog.getByRole("heading", { name: '¿Desactivar la presentación "Caja x 12"?' }))
    .toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "Deja de ofrecerse para compras nuevas. Lo que ya se registró con esta presentación queda como está.",
      ),
    )
    .toBeVisible();
});

test("confirming changes the packaging and reports it", async () => {
  const deactivatePackaging = vi
    .fn<DeactivatePackagingModalServices["deactivatePackaging"]>()
    .mockResolvedValue({ kind: "ok" });
  const onDeactivated = vi.fn();
  const screen = await renderModal({ deactivatePackaging, onDeactivated });

  await confirm(screen);

  expect(deactivatePackaging).toHaveBeenCalledWith(cajaDeMiel.id);
  await expect.poll(() => onDeactivated.mock.calls.length).toBe(1);
});

test("cancel closes the question without calling the API", async () => {
  const deactivatePackaging = vi.fn<DeactivatePackagingModalServices["deactivatePackaging"]>();
  const onClose = vi.fn();
  const screen = await renderModal({ deactivatePackaging, onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(deactivatePackaging).not.toHaveBeenCalled();
});

test("tells when the packaging was already changed, and updating the list reports it", async () => {
  const deactivatePackaging = vi
    .fn<DeactivatePackagingModalServices["deactivatePackaging"]>()
    .mockResolvedValue({
      kind: "already_changed",
    });
  const onDeactivated = vi.fn();
  const screen = await renderModal({ deactivatePackaging, onDeactivated });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Ya estaba desactivada");
  await userEvent.click(dialog.getByRole("button", { name: "Actualizar la lista" }));

  expect(onDeactivated).toHaveBeenCalledTimes(1);
});

test("tells when the packaging no longer exists", async () => {
  const deactivatePackaging = vi
    .fn<DeactivatePackagingModalServices["deactivatePackaging"]>()
    .mockResolvedValue({ kind: "not_found" });
  const screen = await renderModal({ deactivatePackaging });
  const dialog = await confirm(screen);

  await expect
    .element(dialog.getByRole("alert"))
    .toHaveTextContent("Esta presentación ya no existe");
});

test("shows the failure notice, and the confirmation stays available", async () => {
  const deactivatePackaging = vi
    .fn<DeactivatePackagingModalServices["deactivatePackaging"]>()
    .mockResolvedValue({ kind: "failed" });
  const screen = await renderModal({ deactivatePackaging });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByText("No se desactivó la presentación")).toBeVisible();
  await expect.element(dialog.getByText("Volvé a intentarlo.")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Desactivar" })).toBeEnabled();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const deactivatePackaging = vi
    .fn<DeactivatePackagingModalServices["deactivatePackaging"]>()
    .mockResolvedValue({
      kind: "rate_limited",
      retryAfterSeconds: 60,
    });
  const screen = await renderModal({ deactivatePackaging });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
});

test("navigates to Mi cuenta when the change comes back forbidden", async () => {
  window.history.pushState(null, "", "/packagings");
  const deactivatePackaging = vi
    .fn<DeactivatePackagingModalServices["deactivatePackaging"]>()
    .mockResolvedValue({ kind: "forbidden" });
  const screen = await renderModal({ deactivatePackaging });

  await confirm(screen);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("ends the session when the change finds no open session", async () => {
  const deactivatePackaging = vi
    .fn<DeactivatePackagingModalServices["deactivatePackaging"]>()
    .mockResolvedValue({
      kind: "unauthenticated",
    });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ deactivatePackaging, onSessionEnded });

  await confirm(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
