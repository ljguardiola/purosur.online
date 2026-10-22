import type {
  Authorization,
  ReprintSaleReceiptOutcome,
  SaleHistoryDetailOutcome,
  SignInUser,
} from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, expectTypeOf, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { deferred } from "../platform/test-support/deferred";
import type { ReprintReceiptModalProps } from "./reprint-receipt-modal";
import { ReprintReceiptModal } from "./reprint-receipt-modal";
import type { SignedInPerson } from "./signed-in-person";
import { render } from "./test-support/render-with-router";

type Sale = Extract<SaleHistoryDetailOutcome, { kind: "found" }>["detail"] &
  Pick<ReprintReceiptModalProps["sale"], "next_copy">;

const SALE: Sale = {
  sale_id: "sale-1",
  occurred_at: "2026-10-09T11:05:00.000-03:00",
  total: 5_070_000,
  comprobante: {
    kind: "fiscal",
    document_type: "factura_c",
    authorization: "real_time",
    point_of_sale: 4,
    number: 319,
  },
  operation_number: 482,
  served_by_first_name: "Tomás",
  line_count: 8,
  payments: [{ method: "CASH", amount: 5_070_000 }],
  state: "completed",
  voidability: { kind: "not_voidable", refusal: "session_closed" },
  void_authorization_required: false,
  reprint: { kind: "available" },
  next_copy: { kind: "duplicate", order_number: 1 },
  credit_note: null,
  credit_note_next_copy: null,
};

const WITH_PERMISSION: SignedInPerson = {
  user_id: "u1",
  first_name: "Ada",
  abilities: ["reprint_receipt"],
};
const WITHOUT_PERMISSION: SignedInPerson = { user_id: "u1", first_name: "Ada", abilities: [] };
const AUTHORIZERS: SignInUser[] = [
  { id: "u3", first_name: "Sofía" },
  { id: "u2", first_name: "Grace" },
];
const REPRINT = "Reimprimir duplicado";
const REASON = "Motivo de la reimpresión";

type Props = {
  document?: ReprintReceiptModalProps["document"];
  sale?: ReprintReceiptModalProps["sale"];
  person?: SignedInPerson;
  reprintSaleReceipt?: (
    saleId: string,
    reason: string,
    authorization: Authorization | undefined,
  ) => Promise<ReprintSaleReceiptOutcome>;
};

async function renderModal({
  document = "sale_receipt",
  sale = SALE,
  person = WITH_PERMISSION,
  reprintSaleReceipt = async () => ({
    kind: "started",
    copy: { kind: "duplicate", order_number: 1 },
  }),
}: Props = {}) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const reprint = vi.fn(reprintSaleReceipt);
  const requested: string[] = [];
  const loadAuthorizers = async (permission: string) => {
    requested.push(permission);
    return AUTHORIZERS;
  };
  const handlers = {
    onReprinted: vi.fn(),
    onSaleGone: vi.fn(),
    onSessionInvalid: vi.fn(),
    onClose: vi.fn(),
  };
  const screen = await render(
    <ReprintReceiptModal
      sale={sale}
      person={person}
      loadAuthorizers={loadAuthorizers}
      document={document}
      reprint={reprint}
      {...handlers}
    />,
  );
  return { screen, reprint, requested, ...handlers };
}

type Screen = Awaited<ReturnType<typeof renderModal>>["screen"];

async function typeReason(screen: Screen, reason: string) {
  await userEvent.fill(screen.getByRole("textbox", { name: REASON }), reason);
}

async function authorizeAs(screen: Screen, firstName: string, pin: string) {
  await userEvent.click(screen.getByRole("button", { name: /Persona que autoriza/ }));
  await userEvent.click(screen.getByRole("option", { name: firstName }));
  await userEvent.type(screen.getByLabelText("PIN"), pin);
}

describe("ReprintReceiptModal", () => {
  it("says the sale's receipt comes out as a duplicate, with its legend and its comprobante", async () => {
    const { screen } = await renderModal();

    await expect.element(screen.getByText("REIMPRIMIR VENTA DE LAS 11:05")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Sale como duplicado" }))
      .toBeVisible();
    await expect.element(screen.getByText("COPIA DUPLICADA Nº 1")).toBeVisible();
    await expect.element(screen.getByText("Factura C · PV 00004 · Nº 00000319")).toBeVisible();
    await expectNoAccessibilityViolations(document.body);
  });

  it("is never opened for an original, which is printed without a reason", () => {
    expectTypeOf<{ kind: "original" }>().not.toExtend<
      ReprintReceiptModalProps["sale"]["next_copy"]
    >();
  });

  it("names the operation when the sale has no comprobante", async () => {
    const { screen } = await renderModal({
      sale: { ...SALE, comprobante: { kind: "none" } },
    });

    await expect.element(screen.getByText("000482", { exact: true })).toBeVisible();
  });

  it("names neither a comprobante nor an operation for a sale known only by its time", async () => {
    const { screen } = await renderModal({
      sale: {
        sale_id: "sale-1",
        occurred_at: SALE.occurred_at,
        next_copy: { kind: "duplicate" },
      },
    });

    await expect
      .element(screen.getByRole("heading", { name: "Sale como duplicado" }))
      .toBeVisible();
    await expect.element(screen.getByText("Operación")).not.toBeInTheDocument();
    await expect.element(screen.getByText("Comprobante")).not.toBeInTheDocument();
  });

  it("names the operation of a sale whose comprobante it is not given", async () => {
    const { screen } = await renderModal({
      sale: {
        sale_id: "sale-1",
        occurred_at: SALE.occurred_at,
        operation_number: 482,
        next_copy: { kind: "duplicate" },
      },
    });

    await expect.element(screen.getByText("000482", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Comprobante")).not.toBeInTheDocument();
  });

  it("names the comprobante of a sale whose operation it is not given", async () => {
    const { screen } = await renderModal({
      sale: {
        sale_id: "sale-1",
        occurred_at: SALE.occurred_at,
        comprobante: SALE.comprobante,
        next_copy: { kind: "duplicate" },
      },
    });

    await expect.element(screen.getByText("Factura C · PV 00004 · Nº 00000319")).toBeVisible();
    await expect.element(screen.getByText("Operación")).not.toBeInTheDocument();
  });

  it("asks for no authorization when the person may reprint", async () => {
    const { screen, requested } = await renderModal();

    await expect.element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO")).not.toBeInTheDocument();
    expect(requested).toEqual([]);
  });

  it("sends the reason as typed, with no authorization, and tells the screen it started", async () => {
    const { screen, reprint, onReprinted } = await renderModal();
    await typeReason(screen, "El cliente pidió otra copia");

    await userEvent.click(screen.getByRole("button", { name: REPRINT }));

    expect(reprint).toHaveBeenCalledExactlyOnceWith(
      "sale-1",
      "El cliente pidió otra copia",
      undefined,
    );
    await expect.poll(() => onReprinted.mock.calls.length).toBe(1);
  });

  it("keeps the button disabled while the reprint is being asked, so it is asked once", async () => {
    const answer = deferred<ReprintSaleReceiptOutcome>();
    const { screen, reprint } = await renderModal({ reprintSaleReceipt: () => answer.promise });
    await typeReason(screen, "Otra copia");

    await userEvent.click(screen.getByRole("button", { name: REPRINT }));

    await expect.element(screen.getByRole("button", { name: REPRINT })).toBeDisabled();
    expect(reprint).toHaveBeenCalledOnce();
  });

  it("closes from Cancelar without asking the core", async () => {
    const { screen, reprint, onClose } = await renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(reprint).not.toHaveBeenCalled();
  });

  describe("when the person may not reprint", () => {
    it("asks someone with permission to authorize it", async () => {
      const { screen, requested } = await renderModal({ person: WITHOUT_PERMISSION });

      await expect.element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO")).toBeVisible();
      await expect
        .element(screen.getByText("Ada no tiene permiso para reimprimir comprobantes."))
        .toBeVisible();
      await expect.element(screen.getByRole("button", { name: REPRINT })).toBeDisabled();
      expect(requested).toEqual(["reprint_receipt"]);
    });

    it("sends who authorizes and their PIN with the reason", async () => {
      const { screen, reprint } = await renderModal({ person: WITHOUT_PERMISSION });
      await typeReason(screen, "Otra copia");
      await authorizeAs(screen, "Sofía", "1234");

      await userEvent.click(screen.getByRole("button", { name: REPRINT }));

      expect(reprint).toHaveBeenCalledExactlyOnceWith("sale-1", "Otra copia", {
        user_id: "u3",
        pin: "1234",
      });
    });

    it("shows a refused PIN and stays open", async () => {
      const { screen, onReprinted } = await renderModal({
        person: WITHOUT_PERMISSION,
        reprintSaleReceipt: async () => ({
          kind: "wrong_pin",
          retry_after_seconds: 0,
          attempts_left: 6,
        }),
      });
      await typeReason(screen, "Otra copia");
      await authorizeAs(screen, "Sofía", "1234");

      await userEvent.click(screen.getByRole("button", { name: REPRINT }));

      await expect.element(screen.getByText("PIN incorrecto")).toBeVisible();
      expect(onReprinted).not.toHaveBeenCalled();
    });

    it("says the chosen person cannot authorize it when the core refuses their permission", async () => {
      const { screen } = await renderModal({
        person: WITHOUT_PERMISSION,
        reprintSaleReceipt: async () => ({ kind: "lacks_permission" }),
      });
      await typeReason(screen, "Otra copia");
      await authorizeAs(screen, "Sofía", "1234");

      await userEvent.click(screen.getByRole("button", { name: REPRINT }));

      await expect
        .element(screen.getByText("Sofía no puede autorizar esto", { exact: true }))
        .toBeVisible();
    });

    it("says who was locked out when the core locks the chosen person", async () => {
      const { screen } = await renderModal({
        person: WITHOUT_PERMISSION,
        reprintSaleReceipt: async () => ({ kind: "locked", consecutive_failures: 8 }),
      });
      await typeReason(screen, "Otra copia");
      await authorizeAs(screen, "Sofía", "1234");

      await userEvent.click(screen.getByRole("button", { name: REPRINT }));

      await expect.element(screen.getByText("Sofía está bloqueado", { exact: true })).toBeVisible();
    });
  });

  describe("when the core refuses", () => {
    it("shows the reason's limit the core states on the reason field and stays open", async () => {
      const { screen, onReprinted } = await renderModal({
        reprintSaleReceipt: async () => ({ kind: "invalid_reason", max_length: 200 }),
      });

      await userEvent.click(screen.getByRole("button", { name: REPRINT }));

      await expect
        .element(screen.getByText("Escribí el motivo (hasta 200 caracteres)."))
        .toBeVisible();
      expect(onReprinted).not.toHaveBeenCalled();
    });

    it("says a print of the sale may still come out when the core is already printing it", async () => {
      const { screen, onReprinted } = await renderModal({
        reprintSaleReceipt: async () => ({ kind: "busy" }),
      });
      await typeReason(screen, "Otra copia");

      await userEvent.click(screen.getByRole("button", { name: REPRINT }));

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent(
          "Todavía puede salir una impresión de esta venta. Esperá a que termine antes de reimprimir.",
        );
      expect(onReprinted).not.toHaveBeenCalled();
    });

    it("says the printer is not configured when the core has no printer to print on", async () => {
      const { screen, onReprinted } = await renderModal({
        reprintSaleReceipt: async () => ({ kind: "printer_not_configured" }),
      });
      await typeReason(screen, "Otra copia");

      await userEvent.click(screen.getByRole("button", { name: REPRINT }));

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("La impresora no está configurada.");
      expect(onReprinted).not.toHaveBeenCalled();
    });

    it("says a voided sale's receipt is not printed", async () => {
      const { screen, onReprinted } = await renderModal({
        reprintSaleReceipt: async () => ({ kind: "sale_voided" }),
      });
      await typeReason(screen, "Otra copia");

      await userEvent.click(screen.getByRole("button", { name: REPRINT }));

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("La venta está anulada: no se reimprime su ticket.");
      expect(onReprinted).not.toHaveBeenCalled();
    });

    it("tells the screen when the sale is gone", async () => {
      const { screen, onSaleGone } = await renderModal({
        reprintSaleReceipt: async () => ({ kind: "not_found" }),
      });
      await typeReason(screen, "Otra copia");

      await userEvent.click(screen.getByRole("button", { name: REPRINT }));

      await expect.poll(() => onSaleGone.mock.calls.length).toBe(1);
    });

    it("tells the screen when nobody is signed in any more", async () => {
      const { screen, onSessionInvalid } = await renderModal({
        reprintSaleReceipt: async () => ({ kind: "not_signed_in" }),
      });
      await typeReason(screen, "Otra copia");

      await userEvent.click(screen.getByRole("button", { name: REPRINT }));

      await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
    });

    it("says the person no longer may reprint it, when nobody was asked to authorize", async () => {
      const { screen } = await renderModal({
        reprintSaleReceipt: async () => ({ kind: "lacks_permission" }),
      });
      await typeReason(screen, "Otra copia");

      await userEvent.click(screen.getByRole("button", { name: REPRINT }));

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("Ya no tenés permiso para reimprimir comprobantes.");
    });

    it.each([{ kind: "unavailable" } as const])(
      "says the reprint failed and keeps the button enabled: $kind",
      async (outcome) => {
        const { screen } = await renderModal({ reprintSaleReceipt: async () => outcome });
        await typeReason(screen, "Otra copia");

        await userEvent.click(screen.getByRole("button", { name: REPRINT }));

        await expect
          .element(screen.getByRole("alert"))
          .toHaveTextContent("No se pudo reimprimir. Probá de nuevo.");
        await expect.element(screen.getByRole("button", { name: REPRINT })).toBeEnabled();
      },
    );

    it("says the reprint failed when the core cannot be reached", async () => {
      const { screen } = await renderModal({
        reprintSaleReceipt: () => Promise.reject(new Error("the connection was replaced")),
      });
      await typeReason(screen, "Otra copia");

      await userEvent.click(screen.getByRole("button", { name: REPRINT }));

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("No se pudo reimprimir. Probá de nuevo.");
    });
  });

  describe("for the credit note of a voided sale", () => {
    const CREDIT_NOTE_SALE: Sale = {
      ...SALE,
      state: "voided",
      reprint: { kind: "sale_voided" },
      credit_note: {
        kind: "authorized",
        point_of_sale: 3,
        number: 41,
        issued_on: "2026-10-09",
        authorization_code: "75123456789012",
        authorization_code_due_on: "2026-10-19",
      },
      credit_note_next_copy: { kind: "duplicate", order_number: 2 },
      next_copy: { kind: "duplicate", order_number: 2 },
    };

    it("says the credit note comes out as a duplicate, with its legend and its own comprobante", async () => {
      const { screen } = await renderModal({
        document: "credit_note",
        sale: CREDIT_NOTE_SALE,
      });

      await expect
        .element(screen.getByText("REIMPRIMIR NOTA DE CRÉDITO DE LA VENTA DE LAS 11:05"))
        .toBeVisible();
      await expect
        .element(screen.getByRole("heading", { name: "Sale como duplicado" }))
        .toBeVisible();
      await expect.element(screen.getByText("COPIA DUPLICADA Nº 2")).toBeVisible();
      await expect
        .element(screen.getByText("Nota de crédito C · PV 00003 · Nº 00000041"))
        .toBeVisible();
      await expectNoAccessibilityViolations(document.body);
    });

    it("names only the credit note, not the sale's invoice nor its operation", async () => {
      const { screen } = await renderModal({
        document: "credit_note",
        sale: CREDIT_NOTE_SALE,
      });

      await expect
        .element(screen.getByText("Nota de crédito C · PV 00003 · Nº 00000041"))
        .toBeVisible();
      expect(screen.getByText("Comprobante", { exact: true }).elements()).toHaveLength(1);
      await expect.element(screen.getByText(/Factura C/)).not.toBeInTheDocument();
      await expect.element(screen.getByText("Operación")).not.toBeInTheDocument();
    });

    it("sends the reason for the sale's credit note and tells the screen it started", async () => {
      const { screen, reprint, onReprinted } = await renderModal({
        document: "credit_note",
        sale: CREDIT_NOTE_SALE,
      });
      await typeReason(screen, "El cliente la perdió");

      await userEvent.click(screen.getByRole("button", { name: REPRINT }));

      expect(reprint).toHaveBeenCalledExactlyOnceWith("sale-1", "El cliente la perdió", undefined);
      await expect.poll(() => onReprinted.mock.calls.length).toBe(1);
    });

    it("asks another person's authorization from a person who may not reprint", async () => {
      const { screen, reprint } = await renderModal({
        document: "credit_note",
        sale: CREDIT_NOTE_SALE,
        person: WITHOUT_PERMISSION,
      });
      await typeReason(screen, "Otra copia");
      await authorizeAs(screen, "Grace", "1234");

      await userEvent.click(screen.getByRole("button", { name: REPRINT }));

      expect(reprint).toHaveBeenCalledExactlyOnceWith("sale-1", "Otra copia", {
        user_id: "u2",
        pin: "1234",
      });
    });

    it("says a print of the credit note may still come out while one waits for the printer", async () => {
      const { screen } = await renderModal({
        document: "credit_note",
        sale: CREDIT_NOTE_SALE,
        reprintSaleReceipt: async () => ({ kind: "busy" }),
      });
      await typeReason(screen, "Otra copia");

      await userEvent.click(screen.getByRole("button", { name: REPRINT }));

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent(
          "Todavía puede salir una impresión de la nota de crédito. Esperá a que termine antes de reimprimir.",
        );
    });

    it("asks the reason again when the core finds it blank", async () => {
      const { screen } = await renderModal({
        document: "credit_note",
        sale: CREDIT_NOTE_SALE,
        reprintSaleReceipt: async () => ({ kind: "invalid_reason", max_length: 200 }),
      });
      await typeReason(screen, "Otra copia");

      await userEvent.click(screen.getByRole("button", { name: REPRINT }));

      await expect
        .element(screen.getByText("Escribí el motivo (hasta 200 caracteres)."))
        .toBeVisible();
    });
  });
});
