import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  ReleaseQuarantinedEventModal,
  type ReleaseQuarantinedEventModalServices,
} from "./release-quarantined-event-modal";
import { quarantinedSale } from "./test-support/quarantined-events";

afterEach(() => {
  window.history.pushState(null, "", "/");
});

type Release = ReleaseQuarantinedEventModalServices["releaseQuarantinedEvent"];

function renderModal({
  releaseQuarantinedEvent = vi.fn<Release>(),
  onReleased = () => {},
  onOutdated = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: {
  releaseQuarantinedEvent?: Release;
  onReleased?: () => void;
  onOutdated?: (reason: "not_quarantined" | "not_found") => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
} = {}) {
  return render(
    <main>
      <ReleaseQuarantinedEventModal
        target={quarantinedSale}
        onClose={onClose}
        onReleased={onReleased}
        onOutdated={onOutdated}
        onSessionEnded={onSessionEnded}
        services={{ releaseQuarantinedEvent }}
      />
    </main>,
  );
}

async function confirm(screen: Awaited<ReturnType<typeof renderModal>>) {
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Liberar" }));
  return dialog;
}

test("asks about the event, naming it and its register, and what happens next", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await expect
    .element(dialog.getByRole("heading", { name: "¿Liberar este evento?" }))
    .toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "La nube va a volver a intentar aplicar este evento (venta) de la caja Caja 1. El evento no se modifica. Si vuelve a fallar en todos los intentos, queda otra vez en cuarentena y se abre una alerta nueva.",
      ),
    )
    .toBeVisible();
});

test("has no accessibility violations", async () => {
  const screen = await renderModal();

  await expectNoAccessibilityViolations(screen.container);
});

test("confirming releases that event and reports it", async () => {
  const releaseQuarantinedEvent = vi.fn<Release>().mockResolvedValue({ kind: "ok" });
  const onReleased = vi.fn();
  const screen = await renderModal({ releaseQuarantinedEvent, onReleased });

  await confirm(screen);

  expect(releaseQuarantinedEvent).toHaveBeenCalledWith(quarantinedSale.eventId);
  await expect.poll(() => onReleased.mock.calls.length).toBe(1);
});

test("cancel closes the question without calling the cloud", async () => {
  const releaseQuarantinedEvent = vi.fn<Release>();
  const onClose = vi.fn();
  const screen = await renderModal({ releaseQuarantinedEvent, onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(releaseQuarantinedEvent).not.toHaveBeenCalled();
});

test.each(["not_quarantined", "not_found"] as const)(
  "reports an event the cloud answers %s as outdated",
  async (kind) => {
    const releaseQuarantinedEvent = vi.fn<Release>().mockResolvedValue({ kind });
    const onOutdated = vi.fn();
    const onReleased = vi.fn();
    const screen = await renderModal({ releaseQuarantinedEvent, onOutdated, onReleased });

    await confirm(screen);

    await expect.poll(() => onOutdated.mock.calls).toEqual([[kind]]);
    expect(onReleased).not.toHaveBeenCalled();
  },
);

test("shows the failure notice, and the release stays available", async () => {
  const releaseQuarantinedEvent = vi.fn<Release>().mockResolvedValue({ kind: "failed" });
  const screen = await renderModal({ releaseQuarantinedEvent });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByText("No pudimos liberar el evento")).toBeVisible();
  await expect.element(dialog.getByText("Probá de nuevo.")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Liberar" })).toBeEnabled();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const releaseQuarantinedEvent = vi
    .fn<Release>()
    .mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 60 });
  const screen = await renderModal({ releaseQuarantinedEvent });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
});

test("navigates to Mi cuenta when the release comes back forbidden", async () => {
  window.history.pushState(null, "", "/quarantined-events");
  const releaseQuarantinedEvent = vi.fn<Release>().mockResolvedValue({ kind: "forbidden" });
  const screen = await renderModal({ releaseQuarantinedEvent });

  await confirm(screen);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("ends the session when the release finds no open session", async () => {
  const releaseQuarantinedEvent = vi.fn<Release>().mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ releaseQuarantinedEvent, onSessionEnded });

  await confirm(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
