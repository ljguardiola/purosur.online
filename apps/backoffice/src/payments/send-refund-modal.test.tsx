import type { ConfirmedRefundBody } from "@purosur/contracts";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { SendRefundModal, type SendRefundModalServices } from "./send-refund-modal";
import { CLOUD_SENT_REFUND_ID, unconfirmedCloudRefund } from "./test-support/refund-fixtures";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function renderModal({
  confirmRefund = vi.fn<SendRefundModalServices["confirmRefund"]>(),
  onConfirmed = () => {},
  onOutdated = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: {
  confirmRefund?: SendRefundModalServices["confirmRefund"];
  onConfirmed?: (body: ConfirmedRefundBody) => void;
  onOutdated?: () => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
} = {}) {
  return render(
    <main>
      <SendRefundModal
        target={unconfirmedCloudRefund}
        onClose={onClose}
        onConfirmed={onConfirmed}
        onOutdated={onOutdated}
        onSessionEnded={onSessionEnded}
        services={{ confirmRefund }}
      />
    </main>,
  );
}

async function confirm(screen: Awaited<ReturnType<typeof renderModal>>) {
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Enviar a Mercado Pago" }));
  return dialog;
}

test("asks whether to send the refund, with its amount, method and reason", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await expect
    .element(dialog.getByRole("heading", { name: "¿Enviar el reembolso a Mercado Pago?" }))
    .toBeVisible();
  await expect.element(dialog.getByText(/\$ 3\.400,00/)).toBeVisible();
  await expect.element(dialog.getByText(/QR de Mercado Pago/)).toBeVisible();
  await expect.element(dialog.getByText(/La venta del 07\/10 12:30 se canceló/)).toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "Mercado Pago devuelve el pago al cliente. Si la cuenta no tiene saldo suficiente, queda pendiente y se reintenta.",
      ),
    )
    .toBeVisible();
});

test("confirming sends the refund and reports Mercado Pago's answer", async () => {
  const body: ConfirmedRefundBody = { refund_id: CLOUD_SENT_REFUND_ID, outcome: "sent" };
  const confirmRefund = vi
    .fn<SendRefundModalServices["confirmRefund"]>()
    .mockResolvedValue({ kind: "ok", value: body });
  const onConfirmed = vi.fn();
  const screen = await renderModal({ confirmRefund, onConfirmed });

  await confirm(screen);

  expect(confirmRefund).toHaveBeenCalledWith(CLOUD_SENT_REFUND_ID);
  await expect.poll(() => onConfirmed.mock.calls).toEqual([[body]]);
});

test("going back closes the question without calling the cloud", async () => {
  const confirmRefund = vi.fn<SendRefundModalServices["confirmRefund"]>();
  const onClose = vi.fn();
  const screen = await renderModal({ confirmRefund, onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Volver" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(confirmRefund).not.toHaveBeenCalled();
});

test.each([
  ["not_found", "Este reembolso ya no existe"],
  ["not_confirmable", "Este reembolso no se puede enviar a Mercado Pago"],
  ["already_done", "Este reembolso ya estaba hecho"],
  ["already_confirmed", "Este reembolso ya estaba confirmado"],
  ["not_backed", "No consta lo que justifica este reembolso"],
  ["exceeds_refundable", "El reembolso es mayor a lo que queda por devolver del pago"],
] as const)(
  "tells when the cloud answers %s, and updating the list reports it",
  async (kind, title) => {
    const confirmRefund = vi
      .fn<SendRefundModalServices["confirmRefund"]>()
      .mockResolvedValue({ kind });
    const onOutdated = vi.fn();
    const screen = await renderModal({ confirmRefund, onOutdated });
    const dialog = await confirm(screen);

    await expect.element(dialog.getByRole("alert")).toHaveTextContent(title);
    expect(dialog.getByRole("button", { name: "Enviar a Mercado Pago" }).query()).toBeNull();
    await userEvent.click(dialog.getByRole("button", { name: "Actualizar la lista" }));

    expect(onOutdated).toHaveBeenCalledTimes(1);
  },
);

test("tells when Mercado Pago is not configured, and the confirmation stays available", async () => {
  const confirmRefund = vi
    .fn<SendRefundModalServices["confirmRefund"]>()
    .mockResolvedValue({ kind: "not_configured" });
  const screen = await renderModal({ confirmRefund });
  const dialog = await confirm(screen);

  await expect
    .element(dialog.getByRole("alert"))
    .toHaveTextContent("Mercado Pago no está configurado");
  await expect.element(dialog.getByRole("button", { name: "Enviar a Mercado Pago" })).toBeEnabled();
});

test("shows the failure notice, and the confirmation stays available", async () => {
  const confirmRefund = vi
    .fn<SendRefundModalServices["confirmRefund"]>()
    .mockResolvedValue({ kind: "failed" });
  const screen = await renderModal({ confirmRefund });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByText("No se envió el reembolso")).toBeVisible();
  await expect.element(dialog.getByText("Volvé a intentarlo.")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Enviar a Mercado Pago" })).toBeEnabled();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const confirmRefund = vi.fn<SendRefundModalServices["confirmRefund"]>().mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 60,
  });
  const screen = await renderModal({ confirmRefund });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
});

test("navigates to Mi cuenta when the change comes back forbidden", async () => {
  window.history.pushState(null, "", "/pending-refunds");
  const confirmRefund = vi
    .fn<SendRefundModalServices["confirmRefund"]>()
    .mockResolvedValue({ kind: "forbidden" });
  const screen = await renderModal({ confirmRefund });

  await confirm(screen);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("ends the session when the change finds no open session", async () => {
  const confirmRefund = vi
    .fn<SendRefundModalServices["confirmRefund"]>()
    .mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ confirmRefund, onSessionEnded });

  await confirm(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
