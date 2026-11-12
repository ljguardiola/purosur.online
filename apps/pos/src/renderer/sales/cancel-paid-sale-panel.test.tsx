import type {
  Authorization,
  CancelPaidSaleOutcome,
  OpenSale,
  SignInUser,
} from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  authorizationDialog,
  authorizeInModal,
} from "../shell/test-support/authorization-modal-steps";
import { render } from "../shell/test-support/render-with-router";
import { CancelPaidSalePanel } from "./cancel-paid-sale-panel";
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
const CANCEL = "Cancelar venta";

type Props = {
  refunds?: OpenSale["refunds_on_cancel"];
  authorizationRequired?: boolean;
  cancelPaidSale?: (
    saleId: string,
    authorization: Authorization | undefined,
  ) => Promise<CancelPaidSaleOutcome>;
};

async function renderPanel({
  refunds = [CASH_REFUND],
  authorizationRequired = false,
  cancelPaidSale = async () => ({ kind: "cancelled", refunds, authorized_by: null }),
}: Props = {}) {
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
    <CancelPaidSalePanel
      saleId="sale-1"
      total={2_519_250}
      refundNow={500_000}
      refunds={refunds}
      authorizationRequired={authorizationRequired}
      loadAuthorizers={loadAuthorizers}
      cancelPaidSale={cancel}
      {...handlers}
    />,
  );
  return { screen, cancel, requested, ...handlers };
}

describe("CancelPaidSalePanel", () => {
  it("shows what is given back now, the total and one row per refund", async () => {
    const { screen } = await renderPanel({
      refunds: [
        { ...CASH_REFUND, amount: 500_000 },
        {
          payment_id: "p9",
          method: "QR",
          amount: 1_000_000,
          state: "PENDING",
          sent_by_cloud: true,
        },
      ],
    });

    await expect.element(screen.getByRole("heading", { name: "Cancelar venta" })).toBeVisible();
    await expect.element(screen.getByText("A DEVOLVER AHORA", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 5.000,00").first()).toBeVisible();
    await expect.element(screen.getByText("Total", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 25.192,50")).toBeVisible();
    await expect.element(screen.getByText("Efectivo · en el acto", { exact: true })).toBeVisible();
    await expect
      .element(screen.getByText("QR · reembolso pendiente", { exact: true }))
      .toBeVisible();
    await expect.element(screen.getByText("$ 10.000,00")).toBeVisible();
    await expectNoAccessibilityViolations(document.body);
  });

  it("names each refund by its method", async () => {
    const { screen } = await renderPanel({
      refunds: [
        TRANSFER_REFUND,
        { ...TRANSFER_REFUND, payment_id: "p3", method: "POINT", state: "APPROVED" },
        { ...TRANSFER_REFUND, payment_id: "p4", method: "STANDALONE_TERMINAL" },
      ],
    });

    await expect
      .element(screen.getByText("Transferencia · reembolso pendiente", { exact: true }))
      .toBeVisible();
    await expect.element(screen.getByText("Point · en el acto", { exact: true })).toBeVisible();
    await expect
      .element(screen.getByText("Terminal independiente · reembolso pendiente", { exact: true }))
      .toBeVisible();
  });

  it("shows Esc at the top right and Enter on the destructive action, and no function key", async () => {
    const { screen } = await renderPanel();

    const keys = [...screen.container.querySelectorAll("kbd")].map((key) => key.textContent);
    expect(keys).toEqual(["Esc", "Enter"]);
  });

  it("closes from Esc without cancelling", async () => {
    const { cancel, onClose } = await renderPanel();

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("cancels on Enter", async () => {
    const { cancel } = await renderPanel();

    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() => expect(cancel).toHaveBeenCalledExactlyOnceWith("sale-1", undefined));
  });

  it("asks for nobody's authorization when the person may cancel on their own", async () => {
    const { screen, cancel, requested } = await renderPanel();

    await expect.element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: CANCEL }));

    expect(cancel).toHaveBeenCalledExactlyOnceWith("sale-1", undefined);
    expect(requested).toEqual([]);
  });

  it("sends the request once while it is being answered", async () => {
    const answer = deferred<CancelPaidSaleOutcome>();
    const { screen, cancel } = await renderPanel({ cancelPaidSale: () => answer.promise });

    await userEvent.click(screen.getByRole("button", { name: CANCEL }));
    await expect.element(screen.getByRole("button", { name: CANCEL })).toBeDisabled();

    expect(cancel).toHaveBeenCalledOnce();
    answer.resolve({ kind: "cancelled", refunds: [], authorized_by: null });
  });

  describe("once the sale is cancelled", () => {
    it("tells the screen which refunds the core made, not the ones it announced", async () => {
      const made = [{ ...CASH_REFUND, amount: 90_000 }, TRANSFER_REFUND];
      const { screen, onCancelled } = await renderPanel({
        refunds: [CASH_REFUND],
        cancelPaidSale: async () => ({ kind: "cancelled", refunds: made, authorized_by: null }),
      });

      await userEvent.click(screen.getByRole("button", { name: CANCEL }));

      await vi.waitFor(() => expect(onCancelled).toHaveBeenCalledExactlyOnceWith(made));
    });
  });

  describe("when another person must authorize", () => {
    it("asks in the authorization modal, with the action's subtitle, instead of acting", async () => {
      const { screen, requested, cancel } = await renderPanel({ authorizationRequired: true });

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
      const { screen, cancel } = await renderPanel({ authorizationRequired: true });
      await userEvent.click(screen.getByRole("button", { name: CANCEL }));

      await authorizeInModal({ as: "Sofía", pin: "1234" });

      await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
      expect(cancel.mock.lastCall).toContainEqual({ user_id: "u3", pin: "1234" });
      await expect.element(authorizationDialog()).not.toBeInTheDocument();
    });

    it("does not act when the authorization modal is closed with Esc", async () => {
      const { screen, cancel, onCancelled } = await renderPanel({ authorizationRequired: true });
      await userEvent.click(screen.getByRole("button", { name: CANCEL }));
      await expect.element(authorizationDialog()).toBeVisible();

      await userEvent.keyboard("{Escape}");

      await expect.element(authorizationDialog()).not.toBeInTheDocument();
      expect(cancel).not.toHaveBeenCalled();
      expect(onCancelled).not.toHaveBeenCalled();
    });

    it("asks on Enter, at confirm time", async () => {
      const { cancel } = await renderPanel({ authorizationRequired: true });

      await userEvent.keyboard("{Enter}");

      await expect.element(authorizationDialog()).toBeVisible();
      expect(cancel).not.toHaveBeenCalled();
    });

    it("shows a refused PIN inside the authorization modal and stays open", async () => {
      const { screen, onCancelled } = await renderPanel({
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
      const { screen, onCancelled } = await renderPanel({
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
      const { screen } = await renderPanel({
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
      const { screen, onCancelled } = await renderPanel({
        cancelPaidSale: async () => ({ kind: "lacks_permission" }),
      });

      await userEvent.click(screen.getByRole("button", { name: CANCEL }));

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("Ya no tenés permiso para cancelar una venta con pagos.");
      expect(onCancelled).not.toHaveBeenCalled();
    });

    it("tells the screen the sale is no longer in progress", async () => {
      const { screen, onSaleGone } = await renderPanel({
        cancelPaidSale: async () => ({ kind: "no_open_sale" }),
      });

      await userEvent.click(screen.getByRole("button", { name: CANCEL }));

      await vi.waitFor(() => expect(onSaleGone).toHaveBeenCalledOnce());
    });

    it.each([["no_open_session"], ["not_signed_in"]] as const)(
      "tells the screen the session is not valid on %s",
      async (kind) => {
        const { screen, onSessionInvalid } = await renderPanel({
          cancelPaidSale: async () => ({ kind }),
        });

        await userEvent.click(screen.getByRole("button", { name: CANCEL }));

        await vi.waitFor(() => expect(onSessionInvalid).toHaveBeenCalledOnce());
      },
    );

    it("says the person cannot sell from this session", async () => {
      const { screen } = await renderPanel({
        cancelPaidSale: async () => ({ kind: "not_permitted" }),
      });

      await userEvent.click(screen.getByRole("button", { name: CANCEL }));

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("No tenés el permiso de vender y cobrar");
    });

    it("says the sale was not cancelled when the core is unavailable", async () => {
      const { screen, onCancelled } = await renderPanel({
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
    ])("keeps the panel open and says why when %s", async (_case, outcome, notice) => {
      const { screen, onCancelled } = await renderPanel({
        cancelPaidSale: async () => outcome,
      });

      await userEvent.click(screen.getByRole("button", { name: CANCEL }));

      await expect.element(screen.getByRole("alert")).toHaveTextContent(notice);
      await expect.element(screen.getByRole("button", { name: CANCEL })).toBeEnabled();
      expect(onCancelled).not.toHaveBeenCalled();
    });

    it("says the sale was not cancelled when the request fails", async () => {
      const { screen } = await renderPanel({
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
