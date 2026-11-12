import type { Authorization, SignInUser, VoidSaleOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { RegisterFrame } from "../shell/register-frame";
import type { SaleDetail } from "../shell/sale-receipt-text";
import {
  authorizationDialog,
  authorizeInModal,
} from "../shell/test-support/authorization-modal-steps";
import { render } from "../shell/test-support/render-with-router";
import { deferred } from "./test-support/sale-screen";
import type { VoidCreditNoteCorrects, VoidRefund } from "./void-sale-panel";
import { VoidSalePanel } from "./void-sale-panel";

const AUTHORIZERS: SignInUser[] = [
  { id: "u3", first_name: "Sofía" },
  { id: "u2", first_name: "Grace" },
];
const SALE: SaleDetail = {
  sale_id: "sale-1",
  occurred_at: "2026-10-09T11:05:00.000-03:00",
  total: 5_070_000,
  comprobante: { kind: "deferred_non_fiscal" },
  operation_number: 482,
  served_by_first_name: "Tomás",
  line_count: 8,
  lines: [
    { product_name: "Almendras peladas", sale_unit: "KG", quantity: 325, line_total: 614_250 },
  ],
  cash_rounding: 0,
  payments: [{ method: "CASH", card_type: null, amount: 5_070_000 }],
  state: "deferred",
  voidability: { kind: "voidable", refunds: [], credit_note_corrects: null },
  void_authorization_required: false,
  reprint_authorization_required: false,
  reprint: { kind: "available" },
  next_copy: { kind: "original" },
  credit_notes: [],
  deferred_invoice_next_copy: null,
  short_code: null,
};
const INVOICED_SALE: SaleDetail = {
  ...SALE,
  comprobante: {
    kind: "fiscal",
    document_type: "factura_c",
    authorization: "real_time",
    point_of_sale: 4,
    number: 319,
  },
  state: "completed",
};
const CORRECTED_INVOICE = { point_of_sale: 31, number: 8 };
const AUTHORIZED_CREDIT_NOTE = {
  kind: "authorized",
  point_of_sale: 4,
  number: 12,
  issued_on: "2026-10-09",
  authorization_code: "75123456789012",
  authorization_code_due_on: "2026-10-19",
} as const;
const CASH_REFUND: VoidRefund = {
  method: "CASH",
  card_type: null,
  amount: 5_070_000,
  state: "APPROVED",
  sent_by_cloud: false,
};
const TRANSFER_REFUND: VoidRefund = {
  method: "TRANSFER",
  card_type: null,
  amount: 250_000,
  state: "PENDING",
  sent_by_cloud: false,
};
const VOID = "Anular venta";

type Props = {
  sale?: SaleDetail;
  refunds?: readonly VoidRefund[];
  creditNoteCorrects?: VoidCreditNoteCorrects | null;
  authorizationRequired?: boolean;
  voidSale?: (
    saleId: string,
    pendingRefundsConfirmed: boolean,
    authorization: Authorization | undefined,
  ) => Promise<VoidSaleOutcome>;
};

async function renderPanel({
  sale = SALE,
  refunds = [CASH_REFUND],
  creditNoteCorrects = null,
  authorizationRequired = false,
  voidSale = async () => ({ kind: "voided", refunds: [], authorized_by: null, credit_note: null }),
}: Props = {}) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const send = vi.fn(voidSale);
  const requested: string[] = [];
  const loadAuthorizers = async (permission: string) => {
    requested.push(permission);
    return AUTHORIZERS;
  };
  const handlers = {
    onVoided: vi.fn(),
    onRefused: vi.fn(),
    onSaleGone: vi.fn(),
    onSessionInvalid: vi.fn(),
    onClose: vi.fn(),
  };
  const screen = await render(
    <RegisterFrame background="surface" rail={null}>
      <VoidSalePanel
        sale={sale}
        refunds={refunds}
        creditNoteCorrects={creditNoteCorrects}
        authorizationRequired={authorizationRequired}
        loadAuthorizers={loadAuthorizers}
        voidSale={send}
        {...handlers}
      />
    </RegisterFrame>,
  );
  return {
    screen,
    panel: screen.getByRole("complementary", { name: "Anular venta" }),
    send,
    requested,
    ...handlers,
  };
}

describe("VoidSalePanel", () => {
  it("shows what is given back now, the total, how each payment goes back and the credit note", async () => {
    const { screen, panel } = await renderPanel({
      sale: INVOICED_SALE,
      creditNoteCorrects: CORRECTED_INVOICE,
    });

    await expect.element(panel.getByText("A DEVOLVER AHORA")).toBeVisible();
    await expect.element(panel.getByText("$ 50.700,00").first()).toBeVisible();
    await expect.element(panel.getByText("Total", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("Efectivo · en el acto")).toBeVisible();
    await expect.element(panel.getByText("Nota de crédito C", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("Se emite e imprime", { exact: true })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("gives back now only what is returned on the spot", async () => {
    const { panel } = await renderPanel({ refunds: [CASH_REFUND, TRANSFER_REFUND] });

    await expect.element(panel.getByText("$ 50.700,00").first()).toBeVisible();
    await expect.element(panel.getByText("Transferencia · reembolso pendiente")).toBeVisible();
    await expect.element(panel.getByText("$ 2.500,00")).toBeVisible();
  });

  it("says no credit note is issued when the core says the void does not credit an invoice", async () => {
    const { panel } = await renderPanel({ sale: INVOICED_SALE, creditNoteCorrects: null });

    await expect.element(panel.getByText("Nota de crédito C", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("No se emite", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("Se emite e imprime")).not.toBeInTheDocument();
  });

  it("has an error-toned title with the Esc key and a lock only when another person must authorize", async () => {
    const { panel } = await renderPanel({ authorizationRequired: true });

    await expect.element(panel.getByRole("button", { name: "Cerrar con Esc" })).toBeVisible();
    await expect.element(panel.getByText("Pide autorización")).toBeInTheDocument();
  });

  it("shows no lock when nobody else must authorize", async () => {
    const { panel } = await renderPanel();

    await expect.element(panel.getByText("Pide autorización")).not.toBeInTheDocument();
  });

  it("voids from the button, with its Enter key, sending nothing confirmed when every refund is given back now", async () => {
    const { panel, send, requested } = await renderPanel();

    await expect
      .element(panel.getByRole("button", { name: VOID }).getByText("Enter"))
      .toBeVisible();
    await userEvent.click(panel.getByRole("button", { name: VOID }));

    expect(send).toHaveBeenCalledExactlyOnceWith("sale-1", false, undefined);
    expect(requested).toEqual([]);
  });

  it("voids on Enter as soon as the panel opens", async () => {
    const { send } = await renderPanel();

    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() =>
      expect(send).toHaveBeenCalledExactlyOnceWith("sale-1", false, undefined),
    );
  });

  it("closes without voiding on Esc", async () => {
    const { send, onClose } = await renderPanel();

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
  });

  it("closes without voiding from the Esc button", async () => {
    const { panel, send, onClose } = await renderPanel();

    await userEvent.click(panel.getByRole("button", { name: "Cerrar con Esc" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
  });

  it("leaves a refund pending until the person confirms it", async () => {
    const { panel, send } = await renderPanel({ refunds: [CASH_REFUND, TRANSFER_REFUND] });

    await expect.element(panel.getByRole("button", { name: VOID })).toBeDisabled();
    await userEvent.keyboard("{Enter}");
    expect(send).not.toHaveBeenCalled();

    await userEvent.click(panel.getByText(/Confirmo/));
    await userEvent.click(panel.getByRole("button", { name: VOID }));

    expect(send).toHaveBeenCalledExactlyOnceWith("sale-1", true, undefined);
  });

  it("asks to confirm every pending refund, each on its own, even when two are equal", async () => {
    const reported = vi.spyOn(console, "error");
    onTestFinished(() => reported.mockRestore());
    const { panel, send } = await renderPanel({ refunds: [TRANSFER_REFUND, TRANSFER_REFUND] });
    const [first, second] = panel.getByText(/Confirmo/).elements();

    await userEvent.click(first as Element);
    await expect.element(panel.getByRole("button", { name: VOID })).toBeDisabled();
    await userEvent.click(second as Element);
    await userEvent.click(panel.getByRole("button", { name: VOID }));

    expect(send).toHaveBeenCalledExactlyOnceWith("sale-1", true, undefined);
    expect(reported).not.toHaveBeenCalled();
  });

  it("sends the request once while it is being answered", async () => {
    const answer = deferred<VoidSaleOutcome>();
    const { panel, send } = await renderPanel({ voidSale: () => answer.promise });

    await userEvent.click(panel.getByRole("button", { name: VOID }));
    await expect.element(panel.getByRole("button", { name: VOID })).toBeDisabled();

    expect(send).toHaveBeenCalledOnce();
    answer.resolve({ kind: "voided", refunds: [], authorized_by: null, credit_note: null });
  });

  it("tells the screen the credit note the void came with", async () => {
    const { panel, onVoided } = await renderPanel({
      sale: INVOICED_SALE,
      creditNoteCorrects: CORRECTED_INVOICE,
      voidSale: async () => ({
        kind: "voided",
        refunds: [],
        authorized_by: null,
        credit_note: AUTHORIZED_CREDIT_NOTE,
      }),
    });

    await userEvent.click(panel.getByRole("button", { name: VOID }));

    await vi.waitFor(() =>
      expect(onVoided).toHaveBeenCalledExactlyOnceWith(AUTHORIZED_CREDIT_NOTE),
    );
  });

  describe("when another person must authorize", () => {
    it("asks in the authorization modal, with the void's subtitle, instead of voiding", async () => {
      const { panel, requested, send } = await renderPanel({ authorizationRequired: true });

      await userEvent.click(panel.getByRole("button", { name: VOID }));

      await expect.element(authorizationDialog()).toBeVisible();
      await expect
        .element(authorizationDialog().getByText("Anular venta", { exact: true }))
        .toBeVisible();
      expect(requested).toEqual(["void_sale"]);
      expect(send).not.toHaveBeenCalled();
    });

    it("sends who authorizes and their PIN on Enter, and goes on", async () => {
      const { panel, send, onVoided } = await renderPanel({ authorizationRequired: true });
      await userEvent.click(panel.getByRole("button", { name: VOID }));

      await authorizeInModal({ as: "Sofía", pin: "1234" });

      await vi.waitFor(() => expect(onVoided).toHaveBeenCalledOnce());
      expect(send).toHaveBeenCalledExactlyOnceWith("sale-1", false, {
        user_id: "u3",
        pin: "1234",
      });
      await expect.element(authorizationDialog()).not.toBeInTheDocument();
    });

    it("does not void nor close the panel when the authorization modal is closed with Esc", async () => {
      const { panel, send, onVoided, onClose } = await renderPanel({
        authorizationRequired: true,
      });
      await userEvent.click(panel.getByRole("button", { name: VOID }));
      await expect.element(authorizationDialog()).toBeVisible();

      await userEvent.keyboard("{Escape}");

      await expect.element(authorizationDialog()).not.toBeInTheDocument();
      expect(send).not.toHaveBeenCalled();
      expect(onVoided).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it("shows a refused PIN inside the authorization modal and stays open", async () => {
      const { panel, onVoided } = await renderPanel({
        authorizationRequired: true,
        voidSale: async () => ({ kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 6 }),
      });
      await userEvent.click(panel.getByRole("button", { name: VOID }));

      await authorizeInModal({ as: "Sofía", pin: "1234" });

      await expect.element(authorizationDialog().getByText("PIN incorrecto")).toBeVisible();
      expect(onVoided).not.toHaveBeenCalled();
    });

    it("says inside the modal that the chosen person cannot authorize it", async () => {
      const { panel } = await renderPanel({
        authorizationRequired: true,
        voidSale: async () => ({ kind: "lacks_permission" }),
      });
      await userEvent.click(panel.getByRole("button", { name: VOID }));

      await authorizeInModal({ as: "Sofía", pin: "1234" });

      await expect
        .element(authorizationDialog().getByText("Sofía no puede autorizar esto", { exact: true }))
        .toBeVisible();
    });

    it("closes the authorization modal and locks voiding when the sale cannot be voided any more", async () => {
      const { panel } = await renderPanel({
        authorizationRequired: true,
        voidSale: async () => ({ kind: "session_closed" }),
      });
      const voidButton = panel.getByRole("button", { name: VOID });
      await userEvent.click(voidButton);

      await authorizeInModal({ pin: "1234" });

      await expect.element(authorizationDialog()).not.toBeInTheDocument();
      await expect.element(voidButton).toHaveAttribute("aria-disabled", "true");
    });
  });

  describe("when the core refuses", () => {
    it("says the person no longer may void it, when nobody was asked to authorize", async () => {
      const { panel, onVoided } = await renderPanel({
        voidSale: async () => ({ kind: "lacks_permission" }),
      });

      await userEvent.click(panel.getByRole("button", { name: VOID }));

      await expect
        .element(panel.getByRole("alert"))
        .toHaveTextContent("Ya no tenés permiso para anular ventas.");
      expect(onVoided).not.toHaveBeenCalled();
    });

    it("tells the screen the sale is no longer there", async () => {
      const { panel, onSaleGone } = await renderPanel({
        voidSale: async () => ({ kind: "not_found" }),
      });

      await userEvent.click(panel.getByRole("button", { name: VOID }));

      await vi.waitFor(() => expect(onSaleGone).toHaveBeenCalledOnce());
    });

    it("tells the screen the session is not valid", async () => {
      const { panel, onSessionInvalid } = await renderPanel({
        voidSale: async () => ({ kind: "not_signed_in" }),
      });

      await userEvent.click(panel.getByRole("button", { name: VOID }));

      await vi.waitFor(() => expect(onSessionInvalid).toHaveBeenCalledOnce());
    });

    it.each([
      ["session_closed", "La sesión de la venta ya cerró. Se tramita como devolución."],
      [
        "invoice_in_flight",
        "La factura se está pidiendo a ARCA. Vas a poder anular cuando termine el trámite.",
      ],
      ["not_completed", "La venta ya no se puede anular."],
    ] as const)(
      "locks voiding on %s, says why only in its tooltip, and tells the screen to read the sale again",
      async (kind, reason) => {
        const { panel, screen, send, onRefused, onVoided } = await renderPanel({
          voidSale: async () => ({ kind }),
        });
        const voidButton = panel.getByRole("button", { name: VOID });

        await userEvent.click(voidButton);

        await vi.waitFor(() => expect(onRefused).toHaveBeenCalledOnce());
        await expect.element(voidButton).toHaveAttribute("aria-disabled", "true");
        await expect.element(panel.getByRole("alert")).not.toBeInTheDocument();
        await userEvent.hover(voidButton);
        await expect.element(screen.getByRole("tooltip")).toHaveTextContent(reason);
        expect(send).toHaveBeenCalledOnce();
        expect(onVoided).not.toHaveBeenCalled();
      },
    );

    it("asks to confirm the pending refunds when the core says they were not", async () => {
      const { panel } = await renderPanel({
        voidSale: async () => ({ kind: "pending_refunds_unconfirmed" }),
      });

      await userEvent.click(panel.getByRole("button", { name: VOID }));

      await expect
        .element(panel.getByRole("alert"))
        .toHaveTextContent("Confirmá los reembolsos pendientes antes de anular la venta.");
    });

    it("says the sale was not voided when the core is unavailable, and lets the person try again", async () => {
      const { panel, onVoided } = await renderPanel({
        voidSale: async () => ({ kind: "unavailable" }),
      });

      await userEvent.click(panel.getByRole("button", { name: VOID }));

      await expect
        .element(panel.getByRole("alert"))
        .toHaveTextContent("No se pudo anular la venta. Probá de nuevo.");
      await expect.element(panel.getByRole("button", { name: VOID })).toBeEnabled();
      expect(onVoided).not.toHaveBeenCalled();
    });

    it("says the sale was not voided when the request fails", async () => {
      const { panel } = await renderPanel({
        voidSale: async () => {
          throw new Error("core down");
        },
      });

      await userEvent.click(panel.getByRole("button", { name: VOID }));

      await expect
        .element(panel.getByRole("alert"))
        .toHaveTextContent("No se pudo anular la venta. Probá de nuevo.");
    });
  });
});
