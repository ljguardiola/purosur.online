import type {
  Authorization,
  CancelPaidSaleOutcome,
  OpenSale,
  SignInUser,
} from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  authorizationDialog,
  authorizeInModal,
} from "../shell/test-support/authorization-modal-steps";
import { render } from "../shell/test-support/render-with-router";
import { CancelPaidSaleModal } from "./cancel-paid-sale-modal";
import { deferred } from "./test-support/sale-screen";

const AUTHORIZERS: SignInUser[] = [
  { id: "u3", first_name: "Sofía" },
  { id: "u2", first_name: "Grace" },
];
const CASH_REFUND: OpenSale["refunds_on_cancel"][number] = {
  payment_id: "p1",
  method: "CASH",
  amount: 100_000,
  state: "APPROVED",
  sent_by_cloud: false,
};
const TRANSFER_REFUND: OpenSale["refunds_on_cancel"][number] = {
  payment_id: "p2",
  method: "TRANSFER",
  amount: 250_000,
  state: "PENDING",
  sent_by_cloud: false,
};
const CASH_LINE = "Devolver $ 1.000,00 en efectivo";
const TRANSFER_LINE = "Reembolso pendiente de la transferencia por $ 2.500,00";
const PENDING_NOTE =
  "Un reembolso pendiente no se hace desde la caja: se atiende en el backoffice.";
const CANCEL = "Cancelar la venta";

type Props = {
  refunds?: OpenSale["refunds_on_cancel"];
  authorizationRequired?: boolean;
  cancelPaidSale?: (
    saleId: string,
    authorization: Authorization | undefined,
  ) => Promise<CancelPaidSaleOutcome>;
};

async function renderModal({
  refunds = [CASH_REFUND],
  authorizationRequired = false,
  cancelPaidSale = async () => ({ kind: "cancelled", refunds, authorized_by: null }),
}: Props = {}) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const cancel = vi.fn(cancelPaidSale);
  const requested: string[] = [];
  const loadAuthorizers = async (permission: string) => {
    requested.push(permission);
    return AUTHORIZERS;
  };
  const handlers = {
    onCancelled: vi.fn(),
    onSaleGone: vi.fn(),
    onSessionInvalid: vi.fn(),
    onClose: vi.fn(),
  };
  const screen = await render(
    <CancelPaidSaleModal
      saleId="sale-1"
      total={476_000}
      paid={350_000}
      refunds={refunds}
      authorizationRequired={authorizationRequired}
      loadAuthorizers={loadAuthorizers}
      cancelPaidSale={cancel}
      {...handlers}
    />,
  );
  return { screen, cancel, requested, ...handlers };
}

describe("CancelPaidSaleModal", () => {
  it("shows what the sale totals and what was paid", async () => {
    const { screen } = await renderModal();

    const dialog = screen.getByRole("dialog", { name: "¿Cancelar la venta?" });

    await expect.element(dialog).toBeVisible();
    await expect.element(dialog.getByText("Total")).toBeVisible();
    await expect.element(dialog.getByText("$ 4.760,00")).toBeVisible();
    await expect.element(dialog.getByText("Pagado")).toBeVisible();
    await expect.element(dialog.getByText("$ 3.500,00")).toBeVisible();
    await expectNoAccessibilityViolations(document.body);
  });

  it("lists the cash to give back now and the transfer refund that stays pending", async () => {
    const { screen } = await renderModal({ refunds: [CASH_REFUND, TRANSFER_REFUND] });

    await expect.element(screen.getByText(CASH_LINE, { exact: true })).toBeVisible();
    await expect.element(screen.getByText(TRANSFER_LINE, { exact: true })).toBeVisible();
    await expect.element(screen.getByText(PENDING_NOTE, { exact: true })).toBeVisible();
  });

  it("notes a pending cash refund without naming a transfer", async () => {
    const { screen } = await renderModal({ refunds: [{ ...CASH_REFUND, state: "PENDING" }] });

    await expect
      .element(
        screen.getByText("Reembolso pendiente del pago en efectivo por $ 1.000,00", {
          exact: true,
        }),
      )
      .toBeVisible();
    await expect.element(screen.getByText(PENDING_NOTE, { exact: true })).toBeVisible();
    await expect.element(screen.getByText(/transferencia/)).not.toBeInTheDocument();
  });

  it("adds no note of its own under a pending QR refund, whose line already says how it is handled", async () => {
    const { screen } = await renderModal({
      refunds: [
        { payment_id: "p9", method: "QR", amount: 70_000, state: "PENDING", sent_by_cloud: true },
      ],
    });

    await expect
      .element(
        screen.getByText("Reembolso pendiente del pago con QR por $ 700,00", { exact: true }),
      )
      .toBeVisible();
    await expect.element(screen.getByText(/se atiende en el backoffice/)).not.toBeInTheDocument();
  });

  it("says nothing about a pending refund when every payment was in cash", async () => {
    const { screen } = await renderModal({ refunds: [CASH_REFUND] });

    await expect.element(screen.getByText(CASH_LINE, { exact: true })).toBeVisible();
    await expect.element(screen.getByText(PENDING_NOTE)).not.toBeInTheDocument();
  });

  it("says nothing about a pending refund when every refund is given back now", async () => {
    const { screen } = await renderModal({
      refunds: [{ ...TRANSFER_REFUND, state: "APPROVED" }],
    });

    await expect
      .element(screen.getByText("Devolver $ 2.500,00 por transferencia", { exact: true }))
      .toBeVisible();
    await expect.element(screen.getByText(PENDING_NOTE)).not.toBeInTheDocument();
  });

  it("asks for nobody's authorization when the person may cancel on their own", async () => {
    const { screen, cancel, requested } = await renderModal();

    await expect.element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: CANCEL }));

    expect(cancel).toHaveBeenCalledExactlyOnceWith("sale-1", undefined);
    expect(requested).toEqual([]);
  });

  it("closes without cancelling when the person keeps selling", async () => {
    const { screen, cancel, onClose } = await renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Seguir con la venta" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("sends the request once while it is being answered", async () => {
    const answer = deferred<CancelPaidSaleOutcome>();
    const { screen, cancel } = await renderModal({ cancelPaidSale: () => answer.promise });

    await userEvent.click(screen.getByRole("button", { name: CANCEL }));
    await expect.element(screen.getByRole("button", { name: CANCEL })).toBeDisabled();

    expect(cancel).toHaveBeenCalledOnce();
    answer.resolve({ kind: "cancelled", refunds: [], authorized_by: null });
  });

  describe("once the sale is cancelled", () => {
    it("tells the screen which refunds the core made, not the ones it announced", async () => {
      const made = [{ ...CASH_REFUND, amount: 90_000 }, TRANSFER_REFUND];
      const { screen, onCancelled } = await renderModal({
        refunds: [CASH_REFUND],
        cancelPaidSale: async () => ({ kind: "cancelled", refunds: made, authorized_by: null }),
      });

      await userEvent.click(screen.getByRole("button", { name: CANCEL }));

      await vi.waitFor(() => expect(onCancelled).toHaveBeenCalledExactlyOnceWith(made));
    });
  });

  describe("when another person must authorize", () => {
    it("asks in the authorization modal, with the action's subtitle, instead of acting", async () => {
      const { screen, requested, cancel } = await renderModal({ authorizationRequired: true });

      await userEvent.click(screen.getByRole("button", { name: CANCEL }));

      await expect.element(authorizationDialog()).toBeVisible();
      await expect
        .element(authorizationDialog().getByText("Cancelar venta con pagos", { exact: true }))
        .toBeVisible();
      await expect
        .element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO"))
        .not.toBeInTheDocument();
      expect(requested).toEqual(["void_sale"]);
      expect(cancel).not.toHaveBeenCalled();
    });

    it("sends who authorizes and their PIN on Enter", async () => {
      const { screen, cancel } = await renderModal({ authorizationRequired: true });
      await userEvent.click(screen.getByRole("button", { name: CANCEL }));

      await authorizeInModal({ as: "Sofía", pin: "1234" });

      await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
      expect(cancel.mock.lastCall).toContainEqual({ user_id: "u3", pin: "1234" });
      await expect.element(authorizationDialog()).not.toBeInTheDocument();
    });

    it("does not act when the authorization modal is closed with Esc", async () => {
      const { screen, cancel, onCancelled } = await renderModal({ authorizationRequired: true });
      await userEvent.click(screen.getByRole("button", { name: CANCEL }));
      await expect.element(authorizationDialog()).toBeVisible();

      await userEvent.keyboard("{Escape}");

      await expect.element(authorizationDialog()).not.toBeInTheDocument();
      expect(cancel).not.toHaveBeenCalled();
      expect(onCancelled).not.toHaveBeenCalled();
    });

    it("shows a refused PIN inside the authorization modal and stays open", async () => {
      const { screen, onCancelled } = await renderModal({
        authorizationRequired: true,
        cancelPaidSale: async () => ({
          kind: "wrong_pin",
          retry_after_seconds: 0,
          attempts_left: 6,
        }),
      });
      await userEvent.click(screen.getByRole("button", { name: CANCEL }));

      await authorizeInModal({ as: "Sofía", pin: "1234" });

      await expect.element(authorizationDialog().getByText("PIN incorrecto")).toBeVisible();
      expect(onCancelled).not.toHaveBeenCalled();
    });

    it("says inside the modal that the chosen person cannot authorize it", async () => {
      const { screen, onCancelled } = await renderModal({
        authorizationRequired: true,
        cancelPaidSale: async () => ({ kind: "lacks_permission" }),
      });
      await userEvent.click(screen.getByRole("button", { name: CANCEL }));

      await authorizeInModal({ as: "Sofía", pin: "1234" });

      await expect
        .element(authorizationDialog().getByText("Sofía no puede autorizar esto", { exact: true }))
        .toBeVisible();
      expect(onCancelled).not.toHaveBeenCalled();
    });

    it("says inside the modal who was locked out", async () => {
      const { screen } = await renderModal({
        authorizationRequired: true,
        cancelPaidSale: async () => ({ kind: "locked", consecutive_failures: 8 }),
      });
      await userEvent.click(screen.getByRole("button", { name: CANCEL }));

      await authorizeInModal({ as: "Sofía", pin: "1234" });

      await expect
        .element(authorizationDialog().getByText("Sofía está bloqueado", { exact: true }))
        .toBeVisible();
    });
  });

  describe("when the core refuses", () => {
    it("says the person no longer may cancel it, when nobody was asked to authorize", async () => {
      const { screen, onCancelled } = await renderModal({
        cancelPaidSale: async () => ({ kind: "lacks_permission" }),
      });

      await userEvent.click(screen.getByRole("button", { name: CANCEL }));

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("Ya no tenés permiso para cancelar una venta con pagos.");
      expect(onCancelled).not.toHaveBeenCalled();
    });

    it("tells the screen the sale is no longer in progress", async () => {
      const { screen, onSaleGone } = await renderModal({
        cancelPaidSale: async () => ({ kind: "no_open_sale" }),
      });

      await userEvent.click(screen.getByRole("button", { name: CANCEL }));

      await vi.waitFor(() => expect(onSaleGone).toHaveBeenCalledOnce());
    });

    it.each([["no_open_session"], ["not_signed_in"]] as const)(
      "tells the screen the session is not valid on %s",
      async (kind) => {
        const { screen, onSessionInvalid } = await renderModal({
          cancelPaidSale: async () => ({ kind }),
        });

        await userEvent.click(screen.getByRole("button", { name: CANCEL }));

        await vi.waitFor(() => expect(onSessionInvalid).toHaveBeenCalledOnce());
      },
    );

    it("says the person cannot sell from this session", async () => {
      const { screen } = await renderModal({
        cancelPaidSale: async () => ({ kind: "not_permitted" }),
      });

      await userEvent.click(screen.getByRole("button", { name: CANCEL }));

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("No tenés el permiso de vender y cobrar");
    });

    it("says the sale was not cancelled when the core is unavailable", async () => {
      const { screen, onCancelled } = await renderModal({
        cancelPaidSale: async () => ({ kind: "unavailable" }),
      });

      await userEvent.click(screen.getByRole("button", { name: CANCEL }));

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("No se pudo cancelar la venta. Probá de nuevo.");
      await expect.element(screen.getByRole("button", { name: CANCEL })).toBeEnabled();
      expect(onCancelled).not.toHaveBeenCalled();
    });

    it.each<[string, CancelPaidSaleOutcome, string]>([
      [
        "a QR charge is still waiting",
        { kind: "mercado_pago_charge_in_progress" },
        "Hay un cobro con Mercado Pago en curso. Esperá a que termine para cancelar la venta.",
      ],
    ])("keeps the modal open and says why when %s", async (_case, outcome, notice) => {
      const { screen, onCancelled } = await renderModal({
        cancelPaidSale: async () => outcome,
      });

      await userEvent.click(screen.getByRole("button", { name: CANCEL }));

      await expect.element(screen.getByRole("alert")).toHaveTextContent(notice);
      await expect.element(screen.getByRole("button", { name: CANCEL })).toBeEnabled();
      expect(onCancelled).not.toHaveBeenCalled();
    });

    it("says the sale was not cancelled when the request fails", async () => {
      const { screen } = await renderModal({
        cancelPaidSale: async () => {
          throw new Error("the core went away");
        },
      });

      await userEvent.click(screen.getByRole("button", { name: CANCEL }));

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("No se pudo cancelar la venta. Probá de nuevo.");
    });
  });
});
