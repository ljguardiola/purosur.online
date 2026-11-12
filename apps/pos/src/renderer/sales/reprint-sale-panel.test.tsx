import type {
  Authorization,
  ReprintSaleReceiptOutcome,
  SaleCreditNote,
  SignInUser,
} from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { deferred } from "../platform/test-support/deferred";
import { RegisterFrame } from "../shell/register-frame";
import {
  authorizationDialog,
  authorizeInModal,
} from "../shell/test-support/authorization-modal-steps";
import { render } from "../shell/test-support/render-with-router";
import type { ReprintSalePanelProps } from "./reprint-sale-panel";
import { ReprintSalePanel } from "./reprint-sale-panel";

const SALE: ReprintSalePanelProps["sale"] = {
  sale_id: "sale-1",
  occurred_at: "2026-10-09T15:32:00.000-03:00",
  total: 2_519_250,
  comprobante: {
    kind: "fiscal",
    document_type: "factura_c",
    authorization: "real_time",
    point_of_sale: 3,
    number: 1234,
  },
  operation_number: 482,
  next_copy: { kind: "duplicate", order_number: 1 },
};
const CREDIT_NOTE: SaleCreditNote = {
  kind: "authorized",
  point_of_sale: 3,
  number: 21,
  issued_on: "2026-10-09",
  authorization_code: "75123456789012",
  authorization_code_due_on: "2026-10-19",
};
const AUTHORIZERS: SignInUser[] = [{ id: "u3", first_name: "Sofía" }];
const REASON = "Motivo de la reimpresión";
const REPRINT = "Reimprimir duplicado";

type Props = Partial<Pick<ReprintSalePanelProps, "document" | "sale" | "withDate">> & {
  authorizationRequired?: boolean;
  reprint?: (
    saleId: string,
    reason: string,
    authorization: Authorization | undefined,
  ) => Promise<ReprintSaleReceiptOutcome>;
};

async function renderPanel({
  document = "sale_receipt",
  sale = SALE,
  withDate = false,
  authorizationRequired = false,
  reprint = async () => ({ kind: "started", copy: { kind: "duplicate", order_number: 1 } }),
}: Props = {}) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const send = vi.fn(reprint);
  const handlers = {
    onReprinted: vi.fn(),
    onSaleGone: vi.fn(),
    onSessionInvalid: vi.fn(),
    onClose: vi.fn(),
  };
  const screen = await render(
    <RegisterFrame background="surface" rail={null}>
      <ReprintSalePanel
        document={document}
        sale={sale}
        withDate={withDate}
        authorizationRequired={authorizationRequired}
        loadAuthorizers={async () => AUTHORIZERS}
        reprint={send}
        {...handlers}
      />
    </RegisterFrame>,
  );
  return {
    screen,
    panel: screen.getByRole("complementary", { name: "Reimprimir" }),
    send,
    ...handlers,
  };
}

describe("ReprintSalePanel", () => {
  it("says the receipt comes out as a duplicate, with its amount, time and comprobante", async () => {
    const { screen, panel } = await renderPanel();

    await expect.element(panel.getByText("SALE COMO DUPLICADO")).toBeVisible();
    await expect.element(panel.getByText("$ 25.192,50")).toBeVisible();
    await expect.element(panel.getByText("Venta", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("15:32")).toBeVisible();
    await expect.element(panel.getByText("Comprobante", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("Factura C · 00003-00001234")).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows the date with the time when asked to", async () => {
    const { panel } = await renderPanel({ withDate: true });

    await expect.element(panel.getByText("09/10 · 15:32")).toBeVisible();
  });

  it("names the credit note, not the sale's invoice, when it reprints one", async () => {
    const { panel } = await renderPanel({
      document: "credit_note",
      sale: { ...SALE, credit_note: CREDIT_NOTE },
    });

    await expect.element(panel.getByText("Nota de crédito C · 00003-00000021")).toBeVisible();
    await expect.element(panel.getByText("Factura C")).not.toBeInTheDocument();
  });

  it("has the reason field focused, as its only field, and no field key", async () => {
    const { panel } = await renderPanel();

    await expect.element(panel.getByRole("textbox", { name: REASON })).toHaveFocus();
    await expect.element(panel.getByRole("textbox")).toBeVisible();
    await expect.element(panel.getByText("Campo")).not.toBeInTheDocument();
  });

  it("has its button with the Enter key and the Esc key to close", async () => {
    const { panel } = await renderPanel();

    await expect
      .element(panel.getByRole("button", { name: REPRINT }).getByText("Enter"))
      .toBeVisible();
    await expect.element(panel.getByRole("button", { name: "Cerrar con Esc" })).toBeVisible();
  });

  it("shows a lock only when another person must authorize", async () => {
    const locked = await renderPanel({ authorizationRequired: true });
    await expect.element(locked.panel.getByText("Pide autorización")).toBeInTheDocument();
  });

  it("shows no lock when nobody else must authorize", async () => {
    const { panel } = await renderPanel();

    await expect.element(panel.getByText("Pide autorización")).not.toBeInTheDocument();
  });

  it("sends the reason as typed on Enter and tells the screen it started", async () => {
    const { panel, send, onReprinted } = await renderPanel();

    await userEvent.fill(panel.getByRole("textbox", { name: REASON }), "Ticket ilegible");
    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() =>
      expect(onReprinted).toHaveBeenCalledExactlyOnceWith({ kind: "duplicate", order_number: 1 }),
    );
    expect(send).toHaveBeenCalledExactlyOnceWith("sale-1", "Ticket ilegible", undefined);
  });

  it("sends the reason from the button", async () => {
    const { panel, send } = await renderPanel();

    await userEvent.fill(panel.getByRole("textbox", { name: REASON }), "Otra copia");
    await userEvent.click(panel.getByRole("button", { name: REPRINT }));

    await vi.waitFor(() =>
      expect(send).toHaveBeenCalledExactlyOnceWith("sale-1", "Otra copia", undefined),
    );
  });

  it("asks the reason again when it is blank", async () => {
    const { panel, send } = await renderPanel();

    await userEvent.click(panel.getByRole("button", { name: REPRINT }));

    await expect.element(panel.getByText("Escribí el motivo de la reimpresión.")).toBeVisible();
    expect(send).not.toHaveBeenCalled();
  });

  it("closes without asking the core on Esc", async () => {
    const { send, onClose } = await renderPanel();

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
  });

  it("ignores Esc and sends once while the reprint is being asked", async () => {
    const answer = deferred<ReprintSaleReceiptOutcome>();
    const { panel, send, onClose } = await renderPanel({ reprint: () => answer.promise });
    await userEvent.fill(panel.getByRole("textbox", { name: REASON }), "Otra copia");

    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Escape}");

    expect(send).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    answer.resolve({ kind: "started", copy: { kind: "duplicate", order_number: 1 } });
  });

  it("asks in the authorization modal when another person must authorize, then sends who authorized", async () => {
    const { panel, send } = await renderPanel({ authorizationRequired: true });
    await userEvent.fill(panel.getByRole("textbox", { name: REASON }), "Otra copia");

    await userEvent.click(panel.getByRole("button", { name: REPRINT }));
    await expect.element(authorizationDialog()).toBeVisible();
    expect(send).not.toHaveBeenCalled();
    await authorizeInModal({ as: "Sofía", pin: "1234" });

    await vi.waitFor(() =>
      expect(send).toHaveBeenCalledExactlyOnceWith("sale-1", "Otra copia", {
        user_id: "u3",
        pin: "1234",
      }),
    );
  });

  it.each([
    [
      "busy",
      "Todavía puede salir una impresión de esta venta. Esperá a que termine antes de reimprimir.",
    ],
    ["printer_not_configured", "La impresora no está configurada."],
    ["unavailable", "No se pudo reimprimir. Probá de nuevo."],
  ] as const)("keeps the panel open and says why on %s", async (kind, message) => {
    const { panel, onReprinted } = await renderPanel({ reprint: async () => ({ kind }) });
    await userEvent.fill(panel.getByRole("textbox", { name: REASON }), "Otra copia");

    await userEvent.click(panel.getByRole("button", { name: REPRINT }));

    await expect.element(panel.getByText(message)).toBeVisible();
    expect(onReprinted).not.toHaveBeenCalled();
  });

  it("tells the screen when the sale is gone or nobody is signed in", async () => {
    const gone = await renderPanel({ reprint: async () => ({ kind: "not_found" }) });
    await userEvent.fill(gone.panel.getByRole("textbox", { name: REASON }), "Otra copia");
    await userEvent.keyboard("{Enter}");
    await vi.waitFor(() => expect(gone.onSaleGone).toHaveBeenCalledOnce());
  });
});
