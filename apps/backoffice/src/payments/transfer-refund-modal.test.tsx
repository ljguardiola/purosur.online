import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { OUTDATED_TAB_ADVICE, openAsOutdatedTab } from "../platform/test-support/release-monitor";
import { render } from "../shell/test-support/render-with-router";
import { CLOUD_SENT_REFUND_ID, refusedCloudRefund } from "./test-support/refund-fixtures";
import { TransferRefundModal, type TransferRefundModalServices } from "./transfer-refund-modal";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function renderModal({
  recordRefundTransfer = vi.fn<TransferRefundModalServices["recordRefundTransfer"]>(),
  onDone = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: {
  recordRefundTransfer?: TransferRefundModalServices["recordRefundTransfer"];
  onDone?: () => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
} = {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <TransferRefundModal
          target={refusedCloudRefund}
          onClose={onClose}
          onDone={onDone}
          onSessionEnded={onSessionEnded}
          services={{ recordRefundTransfer }}
        />
      </main>
    </FieldSizeProvider>,
  );
}

type ModalScreen = Awaited<ReturnType<typeof renderModal>>;

async function fillAndRecord(screen: ModalScreen) {
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: /Tipo de transferencia/ }));
  await userEvent.click(screen.getByRole("option", { name: "Transferencia de Mercado Pago" }));
  await userEvent.fill(dialog.getByRole("textbox", { name: /Número de operación/ }), "00123456");
  await userEvent.click(dialog.getByRole("button", { name: "Registrar transferencia" }));
  return dialog;
}

test("asks about the refund by its amount", async () => {
  const screen = await renderModal();

  await expect
    .element(
      screen.getByRole("heading", {
        name: "¿Registrar la devolución por transferencia del reembolso de $ 3.400,00?",
      }),
    )
    .toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("tells what is missing and sends nothing when neither the kind nor the operation number was given", async () => {
  const recordRefundTransfer = vi.fn<TransferRefundModalServices["recordRefundTransfer"]>();
  const screen = await renderModal({ recordRefundTransfer });
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Registrar transferencia" }));

  await expect.element(dialog.getByText("Elegí el tipo de transferencia.")).toBeVisible();
  await expect.element(dialog.getByText("Ingresá el número de operación.")).toBeVisible();
  expect(recordRefundTransfer).not.toHaveBeenCalled();
});

test("records the transfer with its kind and operation number and reports it", async () => {
  const recordRefundTransfer = vi
    .fn<TransferRefundModalServices["recordRefundTransfer"]>()
    .mockResolvedValue({ kind: "ok" });
  const onDone = vi.fn();
  const screen = await renderModal({ recordRefundTransfer, onDone });

  await fillAndRecord(screen);

  expect(recordRefundTransfer).toHaveBeenCalledWith(CLOUD_SENT_REFUND_ID, {
    kind: "mercado_pago",
    operation_number: "00123456",
  });
  await expect.poll(() => onDone.mock.calls.length).toBe(1);
});

test("cancel closes the question without calling the cloud", async () => {
  const recordRefundTransfer = vi.fn<TransferRefundModalServices["recordRefundTransfer"]>();
  const onClose = vi.fn();
  const screen = await renderModal({ recordRefundTransfer, onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(recordRefundTransfer).not.toHaveBeenCalled();
});

test.each([
  ["already_done", "Ya estaba marcado como hecho"],
  ["discarded", "Ya estaba descartado"],
  ["not_refused_for_good", "Este reembolso no se puede registrar por transferencia"],
  ["not_found", "Este reembolso ya no existe"],
] as const)("tells %s, and updating the list reports it", async (kind, message) => {
  const recordRefundTransfer = vi
    .fn<TransferRefundModalServices["recordRefundTransfer"]>()
    .mockResolvedValue({ kind });
  const onDone = vi.fn();
  const screen = await renderModal({ recordRefundTransfer, onDone });
  const dialog = await fillAndRecord(screen);

  await expect.element(dialog.getByRole("alert")).toHaveTextContent(message);
  expect(dialog.getByRole("button", { name: "Registrar transferencia" }).query()).toBeNull();
  await userEvent.click(dialog.getByRole("button", { name: "Actualizar la lista" }));

  expect(onDone).toHaveBeenCalledTimes(1);
});

test("shows the failure notice, and recording stays available", async () => {
  const recordRefundTransfer = vi
    .fn<TransferRefundModalServices["recordRefundTransfer"]>()
    .mockResolvedValue({ kind: "failed" });
  const screen = await renderModal({ recordRefundTransfer });
  const dialog = await fillAndRecord(screen);

  await expect.element(dialog.getByText("No se registró la transferencia")).toBeVisible();
  await expect.element(dialog.getByText("Volvé a intentarlo.")).toBeVisible();
  await expect
    .element(dialog.getByRole("button", { name: "Registrar transferencia" }))
    .toBeEnabled();
});

test("shows the number the cloud refused on its field", async () => {
  const recordRefundTransfer = vi
    .fn<TransferRefundModalServices["recordRefundTransfer"]>()
    .mockResolvedValue({ kind: "validation_failed", field: "operation_number" });
  const screen = await renderModal({ recordRefundTransfer });
  const dialog = await fillAndRecord(screen);

  await expect.element(dialog.getByText("Revisá el número de operación.")).toBeVisible();
  expect(dialog.getByText("Ingresá el número de operación.").query()).toBeNull();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const recordRefundTransfer = vi
    .fn<TransferRefundModalServices["recordRefundTransfer"]>()
    .mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 60 });
  const screen = await renderModal({ recordRefundTransfer });
  const dialog = await fillAndRecord(screen);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
});

test("navigates to Mi cuenta when recording comes back forbidden", async () => {
  window.history.pushState(null, "", "/refunds/mercado-pago");
  const recordRefundTransfer = vi
    .fn<TransferRefundModalServices["recordRefundTransfer"]>()
    .mockResolvedValue({ kind: "forbidden" });
  const screen = await renderModal({ recordRefundTransfer });

  await fillAndRecord(screen);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("ends the session when recording finds no open session", async () => {
  const recordRefundTransfer = vi
    .fn<TransferRefundModalServices["recordRefundTransfer"]>()
    .mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ recordRefundTransfer, onSessionEnded });

  await fillAndRecord(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("tells an outdated tab to reload because the backoffice was updated when recording is refused", async () => {
  openAsOutdatedTab();
  const recordRefundTransfer = vi
    .fn<TransferRefundModalServices["recordRefundTransfer"]>()
    .mockResolvedValue({ kind: "failed" });
  const screen = await renderModal({ recordRefundTransfer });
  const dialog = await fillAndRecord(screen);

  await expect.element(dialog.getByText("No se registró la transferencia")).toBeVisible();
  await expect.element(dialog.getByText(OUTDATED_TAB_ADVICE)).toBeVisible();
});
