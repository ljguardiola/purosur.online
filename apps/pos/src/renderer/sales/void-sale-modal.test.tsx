import type { Authorization, SignInUser, VoidSaleOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { SaleDetail } from "../shell/sale-receipt-text";
import type { SignedInPerson } from "../shell/signed-in-person";
import { render } from "../shell/test-support/render-with-router";
import { deferred } from "./test-support/sale-screen";
import type { VoidCreditNoteCorrects, VoidRefund } from "./void-sale-modal";
import { VoidSaleModal } from "./void-sale-modal";

const ADA: SignedInPerson = { user_id: "u1", first_name: "Ada", abilities: [] };
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
  payments: [{ method: "CASH", amount: 5_070_000 }],
  state: "deferred",
  voidability: { kind: "voidable", refunds: [], credit_note_corrects: null },
  void_authorization_required: false,
  reprint: { kind: "available" },
  next_copy: { kind: "original" },
  credit_note: null,
  credit_note_next_copy: null,
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
  amount: 5_070_000,
  state: "APPROVED",
  sent_by_cloud: false,
};
const TRANSFER_REFUND: VoidRefund = {
  method: "TRANSFER",
  amount: 250_000,
  state: "PENDING",
  sent_by_cloud: false,
};
const VOID = "Anular la venta";

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

async function renderModal({
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
    <VoidSaleModal
      sale={sale}
      refunds={refunds}
      creditNoteCorrects={creditNoteCorrects}
      authorizationRequired={authorizationRequired}
      person={ADA}
      loadAuthorizers={loadAuthorizers}
      voidSale={send}
      {...handlers}
    />,
  );
  return { screen, send, requested, ...handlers };
}

type Screen = Awaited<ReturnType<typeof renderModal>>["screen"];

async function authorizeAs(screen: Screen, firstName: string, pin: string) {
  await userEvent.click(screen.getByRole("button", { name: /Persona que autoriza/ }));
  await userEvent.click(screen.getByRole("option", { name: firstName }));
  await userEvent.type(screen.getByLabelText("PIN"), pin);
}

describe("VoidSaleModal", () => {
  it("reviews what happens when the sale is voided", async () => {
    const { screen } = await renderModal();

    const dialog = screen.getByRole("dialog", { name: "Revisá qué pasa al anular" });

    await expect.element(dialog).toBeVisible();
    await expect.element(dialog.getByText("ANULAR VENTA DE LAS 11:05")).toBeVisible();
    await expect.element(dialog.getByText("Total", { exact: true })).toBeVisible();
    await expect.element(dialog.getByText("$ 50.700,00").first()).toBeVisible();
    await expect.element(dialog.getByText("Comprobante", { exact: true })).toBeVisible();
    await expect.element(dialog.getByText("Documento no fiscal")).toBeVisible();
    await expect.element(dialog.getByText("Operación", { exact: true })).toBeVisible();
    await expect.element(dialog.getByText("000482")).toBeVisible();
    await expect
      .element(dialog.getByText("REEMBOLSOS · CADA PAGO VUELVE POR SU MEDIO"))
      .toBeVisible();
    await expect
      .element(dialog.getByText("No se emite nota de crédito: la venta todavía no tenía factura."))
      .toBeVisible();
    await expect.element(dialog.getByText("La mercadería vuelve al stock.")).toBeVisible();
    await expectNoAccessibilityViolations(document.body);
  });

  it("says the credit note that will be issued and printed, and the invoice the core says it corrects", async () => {
    const { screen } = await renderModal({
      sale: INVOICED_SALE,
      creditNoteCorrects: CORRECTED_INVOICE,
    });

    const dialog = screen.getByRole("dialog", { name: "Revisá qué pasa al anular" });

    await expect.element(dialog.getByText("Factura C", { exact: true })).toBeVisible();
    await expect.element(dialog.getByText("Número", { exact: true })).toBeVisible();
    await expect.element(dialog.getByText("PV 00031 · Nº 00000008")).toBeVisible();
    await expect.element(dialog.getByText("PV 00004 · Nº 00000319")).not.toBeInTheDocument();
    await expect
      .element(dialog.getByText("Se emite e imprime la nota de crédito C por $ 50.700,00."))
      .toBeVisible();
    await expect
      .element(dialog.getByText("No se emite nota de crédito: la venta todavía no tenía factura."))
      .not.toBeInTheDocument();
    await expect.element(dialog.getByText("La mercadería vuelve al stock.")).toBeVisible();
    await expect
      .element(dialog.getByRole("button", { name: "Anular y emitir nota de crédito" }))
      .toBeVisible();
    await expect.element(dialog.getByRole("button", { name: VOID })).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(document.body);
  });

  it("names the contingency invoice the credit note corrects as authorized under the pre-obtained code", async () => {
    const { screen } = await renderModal({
      sale: {
        ...INVOICED_SALE,
        comprobante: {
          kind: "fiscal",
          document_type: "factura_c",
          authorization: "offline_code",
          ...CORRECTED_INVOICE,
        },
      },
      creditNoteCorrects: CORRECTED_INVOICE,
    });

    const dialog = screen.getByRole("dialog", { name: "Revisá qué pasa al anular" });

    await expect.element(dialog.getByText("Factura C · CAEA", { exact: true })).toBeVisible();
    await expect.element(dialog.getByText("PV 00031 · Nº 00000008")).toBeVisible();
  });

  it("keeps showing the sale's own comprobante when it is not fiscal even though the core names an invoice the credit note corrects", async () => {
    const { screen } = await renderModal({ sale: SALE, creditNoteCorrects: CORRECTED_INVOICE });

    const dialog = screen.getByRole("dialog", { name: "Revisá qué pasa al anular" });

    await expect.element(dialog.getByText("Documento no fiscal")).toBeVisible();
    await expect.element(dialog.getByText("Factura C", { exact: true })).not.toBeInTheDocument();
    await expect.element(dialog.getByText("PV 00031 · Nº 00000008")).not.toBeInTheDocument();
  });

  it("voids without a credit note a sale whose comprobante names an invoice the core says the void does not credit", async () => {
    const { screen } = await renderModal({ sale: INVOICED_SALE, creditNoteCorrects: null });

    const dialog = screen.getByRole("dialog", { name: "Revisá qué pasa al anular" });

    await expect
      .element(dialog.getByText("No se emite nota de crédito: la venta todavía no tenía factura."))
      .toBeVisible();
    await expect.element(dialog.getByRole("button", { name: VOID })).toBeVisible();
    await expect
      .element(dialog.getByRole("button", { name: "Anular y emitir nota de crédito" }))
      .not.toBeInTheDocument();
  });

  it("sends the void of a sale with an invoice from the button that says it issues the credit note", async () => {
    const { screen, send } = await renderModal({
      sale: INVOICED_SALE,
      creditNoteCorrects: CORRECTED_INVOICE,
    });

    await userEvent.click(screen.getByRole("button", { name: "Anular y emitir nota de crédito" }));

    expect(send).toHaveBeenCalledExactlyOnceWith("sale-1", false, undefined);
  });

  it("tells the screen the credit note the void came with", async () => {
    const { screen, onVoided } = await renderModal({
      sale: INVOICED_SALE,
      creditNoteCorrects: CORRECTED_INVOICE,
      voidSale: async () => ({
        kind: "voided",
        refunds: [],
        authorized_by: null,
        credit_note: AUTHORIZED_CREDIT_NOTE,
      }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Anular y emitir nota de crédito" }));

    await vi.waitFor(() =>
      expect(onVoided).toHaveBeenCalledExactlyOnceWith(AUTHORIZED_CREDIT_NOTE),
    );
  });

  it("leaves the comprobante out when the sale has none", async () => {
    const { screen } = await renderModal({ sale: { ...SALE, comprobante: { kind: "none" } } });

    await expect.element(screen.getByText("Total", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Comprobante", { exact: true })).not.toBeInTheDocument();
  });

  it("gives cash back on the spot", async () => {
    const { screen } = await renderModal();

    await expect.element(screen.getByText("Efectivo · $ 50.700,00")).toBeVisible();
    await expect.element(screen.getByText("Lo devolvés en efectivo en el momento.")).toBeVisible();
    await expect.element(screen.getByText("En el acto")).toBeVisible();
    await expect.element(screen.getByRole("checkbox")).not.toBeInTheDocument();
  });

  it("leaves a transfer refund pending until the person confirms it", async () => {
    const { screen, send } = await renderModal({ refunds: [CASH_REFUND, TRANSFER_REFUND] });

    await expect.element(screen.getByText("Transferencia · $ 2.500,00")).toBeVisible();
    await expect
      .element(
        screen.getByText("Queda un reembolso pendiente: una persona lo hace por fuera de la caja."),
      )
      .toBeVisible();
    await expect.element(screen.getByRole("button", { name: VOID })).toBeDisabled();

    await userEvent.click(screen.getByText("Confirmo"));
    await userEvent.click(screen.getByRole("button", { name: VOID }));

    expect(send).toHaveBeenCalledExactlyOnceWith("sale-1", true, undefined);
  });

  it("leaves a Mercado Pago refund pending for the cloud to send once the person confirms it", async () => {
    const { screen, send } = await renderModal({
      refunds: [
        CASH_REFUND,
        { method: "QR", amount: 90_000, state: "PENDING", sent_by_cloud: true },
      ],
    });

    await expect.element(screen.getByText("QR de Mercado Pago · $ 900,00")).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Queda un reembolso pendiente que la nube envía a Mercado Pago al confirmarlo.",
        ),
      )
      .toBeVisible();
    await expect.element(screen.getByRole("button", { name: VOID })).toBeDisabled();

    await userEvent.click(screen.getByText("Confirmo"));
    await userEvent.click(screen.getByRole("button", { name: VOID }));

    expect(send).toHaveBeenCalledExactlyOnceWith("sale-1", true, undefined);
  });

  it("asks to confirm every pending refund before voiding", async () => {
    const { screen, send } = await renderModal({
      refunds: [
        TRANSFER_REFUND,
        { method: "STANDALONE_TERMINAL", amount: 90_000, state: "PENDING", sent_by_cloud: false },
      ],
    });
    const [first, second] = screen.getByText("Confirmo").elements();

    await userEvent.click(first as Element);
    await expect.element(screen.getByRole("button", { name: VOID })).toBeDisabled();
    await userEvent.click(second as Element);
    await userEvent.click(screen.getByRole("button", { name: VOID }));

    expect(send).toHaveBeenCalledExactlyOnceWith("sale-1", true, undefined);
  });

  it("confirms each of two equal pending refunds on its own", async () => {
    const reported = vi.spyOn(console, "error");
    onTestFinished(() => reported.mockRestore());
    const { screen, send } = await renderModal({ refunds: [TRANSFER_REFUND, TRANSFER_REFUND] });
    const [first, second] = screen.getByText("Confirmo").elements();

    await userEvent.click(first as Element);
    await expect.element(screen.getByRole("button", { name: VOID })).toBeDisabled();
    await userEvent.click(second as Element);
    await userEvent.click(screen.getByRole("button", { name: VOID }));

    expect(send).toHaveBeenCalledExactlyOnceWith("sale-1", true, undefined);
    expect(reported).not.toHaveBeenCalled();
  });

  it("sends the void with nothing confirmed when every refund is given back now", async () => {
    const { screen, send, requested } = await renderModal();

    await expect.element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: VOID }));

    expect(send).toHaveBeenCalledExactlyOnceWith("sale-1", false, undefined);
    expect(requested).toEqual([]);
  });

  it("closes without voiding when the person goes back", async () => {
    const { screen, send, onClose } = await renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Volver" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
  });

  it("sends the request once while it is being answered", async () => {
    const answer = deferred<VoidSaleOutcome>();
    const { screen, send } = await renderModal({ voidSale: () => answer.promise });

    await userEvent.click(screen.getByRole("button", { name: VOID }));
    await expect.element(screen.getByRole("button", { name: VOID })).toBeDisabled();

    expect(send).toHaveBeenCalledOnce();
    answer.resolve({ kind: "voided", refunds: [], authorized_by: null, credit_note: null });
  });

  it("tells the screen the sale was voided", async () => {
    const { screen, onVoided } = await renderModal();

    await userEvent.click(screen.getByRole("button", { name: VOID }));

    await vi.waitFor(() => expect(onVoided).toHaveBeenCalledOnce());
  });

  describe("when another person must authorize", () => {
    it("asks for the people who hold the void sale permission and keeps the button disabled until one is chosen with a PIN", async () => {
      const { screen, requested } = await renderModal({ authorizationRequired: true });

      await expect.element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO")).toBeVisible();
      await expect
        .element(screen.getByText("Ada no tiene permiso para anular ventas."))
        .toBeVisible();
      await expect.element(screen.getByRole("button", { name: VOID })).toBeDisabled();
      expect(requested).toEqual(["void_sale"]);
    });

    it("names who authorizes only in the authorization's own field once someone is chosen", async () => {
      const { screen } = await renderModal({ authorizationRequired: true });

      await authorizeAs(screen, "Sofía", "1234");

      await expect
        .element(screen.getByRole("button", { name: /Persona que autoriza/ }))
        .toHaveTextContent("Sofía");
      await expect.element(screen.getByText(/Autoriza: /)).not.toBeInTheDocument();
    });

    it("sends who authorizes and their PIN", async () => {
      const { screen, send } = await renderModal({ authorizationRequired: true });
      await authorizeAs(screen, "Sofía", "1234");

      await userEvent.click(screen.getByRole("button", { name: VOID }));

      expect(send).toHaveBeenCalledExactlyOnceWith("sale-1", false, {
        user_id: "u3",
        pin: "1234",
      });
    });

    it("shows a refused PIN and stays open", async () => {
      const { screen, onVoided } = await renderModal({
        authorizationRequired: true,
        voidSale: async () => ({ kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 6 }),
      });
      await authorizeAs(screen, "Sofía", "1234");

      await userEvent.click(screen.getByRole("button", { name: VOID }));

      await expect.element(screen.getByText("PIN incorrecto")).toBeVisible();
      expect(onVoided).not.toHaveBeenCalled();
    });

    it("says the chosen person cannot authorize it when the core refuses their permission", async () => {
      const { screen } = await renderModal({
        authorizationRequired: true,
        voidSale: async () => ({ kind: "lacks_permission" }),
      });
      await authorizeAs(screen, "Sofía", "1234");

      await userEvent.click(screen.getByRole("button", { name: VOID }));

      await expect
        .element(screen.getByText("Sofía no puede autorizar esto", { exact: true }))
        .toBeVisible();
    });

    it("says who was locked out when the core locks the chosen person", async () => {
      const { screen } = await renderModal({
        authorizationRequired: true,
        voidSale: async () => ({ kind: "locked", consecutive_failures: 8 }),
      });
      await authorizeAs(screen, "Sofía", "1234");

      await userEvent.click(screen.getByRole("button", { name: VOID }));

      await expect.element(screen.getByText("Sofía está bloqueado", { exact: true })).toBeVisible();
    });
  });

  describe("when the core refuses", () => {
    it("says the person no longer may void it, when nobody was asked to authorize", async () => {
      const { screen, onVoided } = await renderModal({
        voidSale: async () => ({ kind: "lacks_permission" }),
      });

      await userEvent.click(screen.getByRole("button", { name: VOID }));

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("Ya no tenés permiso para anular ventas.");
      expect(onVoided).not.toHaveBeenCalled();
    });

    it("tells the screen the sale is no longer there", async () => {
      const { screen, onSaleGone } = await renderModal({
        voidSale: async () => ({ kind: "not_found" }),
      });

      await userEvent.click(screen.getByRole("button", { name: VOID }));

      await vi.waitFor(() => expect(onSaleGone).toHaveBeenCalledOnce());
    });

    it("tells the screen the session is not valid", async () => {
      const { screen, onSessionInvalid } = await renderModal({
        voidSale: async () => ({ kind: "not_signed_in" }),
      });

      await userEvent.click(screen.getByRole("button", { name: VOID }));

      await vi.waitFor(() => expect(onSessionInvalid).toHaveBeenCalledOnce());
    });

    it.each([
      ["session_closed", "La sesión de la venta ya cerró. Se tramita como devolución."],
      [
        "invoice_in_flight",
        "La factura se está pidiendo a ARCA. Vas a poder anular cuando termine el trámite.",
      ],
      [
        "invoice_needs_connection",
        "Sin conexión con ARCA, la venta con factura se anula cuando vuelva la conexión.",
      ],
      ["not_completed", "La venta ya no se puede anular."],
    ] as const)(
      "locks voiding on %s, says why only in its tooltip, and tells the screen to read the sale again",
      async (kind, reason) => {
        const { screen, send, onRefused, onVoided } = await renderModal({
          voidSale: async () => ({ kind }),
        });
        const voidButton = screen.getByRole("button", { name: VOID });

        await userEvent.click(voidButton);

        await vi.waitFor(() => expect(onRefused).toHaveBeenCalledOnce());
        await expect.element(voidButton).toHaveAttribute("aria-disabled", "true");
        await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
        await userEvent.hover(voidButton);
        await expect.element(screen.getByRole("tooltip")).toHaveTextContent(reason);
        voidButton.element().dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(send).toHaveBeenCalledOnce();
        expect(onVoided).not.toHaveBeenCalled();
      },
    );

    it("asks to confirm the pending refunds when the core says they were not", async () => {
      const { screen } = await renderModal({
        voidSale: async () => ({ kind: "pending_refunds_unconfirmed" }),
      });

      await userEvent.click(screen.getByRole("button", { name: VOID }));

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("Confirmá los reembolsos pendientes antes de anular la venta.");
    });

    it("says the sale was not voided when the core is unavailable, and lets the person try again", async () => {
      const { screen, onVoided } = await renderModal({
        voidSale: async () => ({ kind: "unavailable" }),
      });

      await userEvent.click(screen.getByRole("button", { name: VOID }));

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("No se pudo anular la venta. Probá de nuevo.");
      await expect.element(screen.getByRole("button", { name: VOID })).toBeEnabled();
      expect(onVoided).not.toHaveBeenCalled();
    });

    it("says the sale was not voided when the request fails", async () => {
      const { screen } = await renderModal({
        voidSale: async () => {
          throw new Error("core down");
        },
      });

      await userEvent.click(screen.getByRole("button", { name: VOID }));

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("No se pudo anular la venta. Probá de nuevo.");
    });
  });
});
