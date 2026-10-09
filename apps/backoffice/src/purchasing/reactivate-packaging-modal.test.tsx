import type { PackagingSummary } from "@purosur/contracts";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  ReactivatePackagingModal,
  type ReactivatePackagingModalServices,
} from "./reactivate-packaging-modal";
import { bolsaDeAlmendras } from "./test-support/packagings";

afterEach(() => {
  window.history.pushState(null, "", "/");
});

function renderModal({
  reactivatePackaging = vi.fn<ReactivatePackagingModalServices["reactivatePackaging"]>(),
  target = bolsaDeAlmendras,
  onReactivated = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: {
  reactivatePackaging?: ReactivatePackagingModalServices["reactivatePackaging"];
  target?: PackagingSummary;
  onReactivated?: () => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
} = {}) {
  return render(
    <main>
      <ReactivatePackagingModal
        target={target}
        onClose={onClose}
        onReactivated={onReactivated}
        onSessionEnded={onSessionEnded}
        services={{ reactivatePackaging }}
      />
    </main>,
  );
}

async function confirm(screen: Awaited<ReturnType<typeof renderModal>>) {
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Reactivar" }));
  return dialog;
}

test("asks about the packaging by name, saying it is offered for new purchases again", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await expect
    .element(dialog.getByRole("heading", { name: '¿Reactivar la presentación "Bolsa de 2,5 kg"?' }))
    .toBeVisible();
  await expect.element(dialog.getByText("Vuelve a ofrecerse para compras nuevas.")).toBeVisible();
});

test("confirming changes the packaging and reports it", async () => {
  const reactivatePackaging = vi
    .fn<ReactivatePackagingModalServices["reactivatePackaging"]>()
    .mockResolvedValue({ kind: "ok" });
  const onReactivated = vi.fn();
  const screen = await renderModal({ reactivatePackaging, onReactivated });

  await confirm(screen);

  expect(reactivatePackaging).toHaveBeenCalledWith(bolsaDeAlmendras.id);
  await expect.poll(() => onReactivated.mock.calls.length).toBe(1);
});

test("cancel closes the question without calling the API", async () => {
  const reactivatePackaging = vi.fn<ReactivatePackagingModalServices["reactivatePackaging"]>();
  const onClose = vi.fn();
  const screen = await renderModal({ reactivatePackaging, onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(reactivatePackaging).not.toHaveBeenCalled();
});

test("tells when the packaging was already changed, and updating the list reports it", async () => {
  const reactivatePackaging = vi
    .fn<ReactivatePackagingModalServices["reactivatePackaging"]>()
    .mockResolvedValue({
      kind: "already_changed",
    });
  const onReactivated = vi.fn();
  const screen = await renderModal({ reactivatePackaging, onReactivated });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Ya estaba activa");
  await userEvent.click(dialog.getByRole("button", { name: "Actualizar la lista" }));

  expect(onReactivated).toHaveBeenCalledTimes(1);
});

test("tells when the packaging no longer exists", async () => {
  const reactivatePackaging = vi
    .fn<ReactivatePackagingModalServices["reactivatePackaging"]>()
    .mockResolvedValue({ kind: "not_found" });
  const screen = await renderModal({ reactivatePackaging });
  const dialog = await confirm(screen);

  await expect
    .element(dialog.getByRole("alert"))
    .toHaveTextContent("Esta presentación ya no existe");
});

test("shows the failure notice, and the confirmation stays available", async () => {
  const reactivatePackaging = vi
    .fn<ReactivatePackagingModalServices["reactivatePackaging"]>()
    .mockResolvedValue({ kind: "failed" });
  const screen = await renderModal({ reactivatePackaging });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByText("No se reactivó la presentación")).toBeVisible();
  await expect.element(dialog.getByText("Volvé a intentarlo.")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Reactivar" })).toBeEnabled();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const reactivatePackaging = vi
    .fn<ReactivatePackagingModalServices["reactivatePackaging"]>()
    .mockResolvedValue({
      kind: "rate_limited",
      retryAfterSeconds: 60,
    });
  const screen = await renderModal({ reactivatePackaging });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
});

test("navigates to Mi cuenta when the change comes back forbidden", async () => {
  window.history.pushState(null, "", "/packagings");
  const reactivatePackaging = vi
    .fn<ReactivatePackagingModalServices["reactivatePackaging"]>()
    .mockResolvedValue({ kind: "forbidden" });
  const screen = await renderModal({ reactivatePackaging });

  await confirm(screen);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("ends the session when the change finds no open session", async () => {
  const reactivatePackaging = vi
    .fn<ReactivatePackagingModalServices["reactivatePackaging"]>()
    .mockResolvedValue({
      kind: "unauthenticated",
    });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ reactivatePackaging, onSessionEnded });

  await confirm(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
