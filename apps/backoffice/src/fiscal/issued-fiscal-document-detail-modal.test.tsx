import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { IssuedFiscalDocumentDetailModalServices } from "./issued-fiscal-document-detail-modal";
import { IssuedFiscalDocumentDetailModal } from "./issued-fiscal-document-detail-modal";
import {
  authorizedReceipt,
  authorizedReceiptDetail,
  contingencyReceipt,
  creditNote,
  creditNoteDetail,
  receiptDetailWithCreditNote,
  unauthorizedReceipt,
} from "./test-support/issued-fiscal-documents-fixtures";

type Voucher = { voucher_type: number; point_of_sale: number; number: number };

type Outcome = Awaited<
  ReturnType<IssuedFiscalDocumentDetailModalServices["fetchIssuedFiscalDocument"]>
>;

function servicesAnswering(outcome: Outcome | Promise<never>) {
  return {
    fetchIssuedFiscalDocument: vi
      .fn()
      .mockReturnValue(outcome instanceof Promise ? outcome : Promise.resolve(outcome)),
  } satisfies IssuedFiscalDocumentDetailModalServices;
}

function voucherOf({ voucher_type, point_of_sale, number }: Voucher) {
  return { voucher_type, point_of_sale, number };
}

function renderModal(
  services: IssuedFiscalDocumentDetailModalServices,
  voucher: Voucher | null = authorizedReceipt,
  handlers: { onClose?: () => void; onSessionEnded?: () => void } = {},
) {
  return render(
    <IssuedFiscalDocumentDetailModal
      voucher={voucher === null ? null : voucherOf(voucher)}
      onClose={handlers.onClose ?? (() => {})}
      onSessionEnded={handlers.onSessionEnded ?? (() => {})}
      services={services}
    />,
  );
}

test("shows nothing while no voucher is chosen", async () => {
  const services = servicesAnswering({ kind: "ok", value: authorizedReceiptDetail });

  const screen = await renderModal(services, null);

  expect(screen.getByRole("dialog").query()).toBeNull();
  expect(services.fetchIssuedFiscalDocument).not.toHaveBeenCalled();
});

test("asks the cloud for the voucher chosen", async () => {
  const services = servicesAnswering({ kind: "ok", value: authorizedReceiptDetail });

  await renderModal(services);

  await expect
    .poll(() => vi.mocked(services.fetchIssuedFiscalDocument).mock.lastCall)
    .toEqual([{ voucher_type: 11, point_of_sale: 3, number: 1247 }]);
});

test("is titled with the voucher while the detail loads", async () => {
  const screen = await renderModal(servicesAnswering(new Promise<never>(() => {})));

  await expect
    .element(screen.getByRole("dialog", { name: /Factura C 00003-00001247/ }))
    .toBeVisible();
});

test("shows the state, the authorization code, its due date, the buyer and when and where it was issued", async () => {
  const screen = await renderModal(
    servicesAnswering({ kind: "ok", value: authorizedReceiptDetail }),
  );

  const dialog = screen.getByRole("dialog", { name: /Factura C 00003-00001247/ });
  await expect.element(dialog.getByText("Autorizado")).toBeVisible();
  await expect.element(dialog.getByText("CAE 75123456789012")).toBeVisible();
  await expect.element(dialog.getByText("Vence el 26/09/2026")).toBeVisible();
  await expect.element(dialog.getByText("Consumidor final")).toBeVisible();
  await expect.element(dialog.getByText("12/09/2026 · 12:04")).toBeVisible();
  await expect.element(dialog.getByText("Caja principal")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("shows the fortnight of a document authorized by a CAEA", async () => {
  const detail = { ...authorizedReceiptDetail, ...contingencyReceipt };
  const screen = await renderModal(
    servicesAnswering({ kind: "ok", value: detail }),
    contingencyReceipt,
  );

  await expect.element(screen.getByText("CAEA 36251478963214")).toBeVisible();
  await expect.element(screen.getByText("Quincena 16 al 30/09")).toBeVisible();
});

test("shows a document still awaited from ARCA as being asked", async () => {
  const detail = { ...authorizedReceiptDetail, ...unauthorizedReceipt };
  const screen = await renderModal(
    servicesAnswering({ kind: "ok", value: detail }),
    unauthorizedReceipt,
  );

  await expect.element(screen.getByText("Consultando a ARCA")).toBeVisible();
  await expect.element(screen.getByText("Sin autorización todavía")).toBeVisible();
});

test("shows each line as sold, with its quantity, its promotion and its amount, and the total", async () => {
  const screen = await renderModal(
    servicesAnswering({ kind: "ok", value: authorizedReceiptDetail }),
  );

  const yerba = screen.getByRole("row", { name: /Yerba 1 kg/ });
  await expect.element(yerba.getByText("2 u")).toBeVisible();
  await expect.element(yerba.getByText("$ 8.500,00")).toBeVisible();
  const queso = screen.getByRole("row", { name: /Queso cremoso/ });
  await expect.element(queso.getByText("0,450 kg")).toBeVisible();
  await expect.element(queso.getByText("Lácteos 2x1")).toBeVisible();
  await expect.element(queso.getByText("$ 9.002,75")).toBeVisible();
  await expect.element(screen.getByText("Total de la venta", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Total del comprobante", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("$ 17.502,75").first()).toBeVisible();
  await expect.element(screen.getByText("$ 17.502,75").last()).toBeVisible();
});

test("a partial credit note's detail shows the sale's total under its lines and its own amount apart", async () => {
  const detail = {
    ...creditNoteDetail,
    total: 180000,
    sale_total: 480000,
    lines: [
      {
        product_name: "Yerba 1 kg",
        sale_unit: "UNIT" as const,
        quantity: 2,
        promotion: null,
        amount: 250000,
      },
      {
        product_name: "Queso cremoso",
        sale_unit: "KG" as const,
        quantity: 450,
        promotion: null,
        amount: 230000,
      },
    ],
  };
  const screen = await renderModal(servicesAnswering({ kind: "ok", value: detail }), creditNote);

  await expect.element(screen.getByText("$ 4.800,00")).toBeVisible();
  await expect.element(screen.getByText("$ 1.800,00")).toBeVisible();
  const saleTotal = screen.getByText("Total de la venta", { exact: true });
  const ownTotal = screen.getByText("Total del comprobante", { exact: true });
  await expect.element(saleTotal).toBeVisible();
  await expect.element(ownTotal).toBeVisible();
  expect(saleTotal.element().parentElement?.textContent).toBe("Total de la venta$ 4.800,00");
  expect(ownTotal.element().parentElement?.textContent).toBe("Total del comprobante$ 1.800,00");
  const products = screen.getByRole("heading", { name: "Productos" }).element();
  const payments = screen.getByRole("heading", { name: "Pagos" }).element();
  const saleTotalPosition = saleTotal.element().compareDocumentPosition(products);
  const ownTotalPosition = ownTotal.element().compareDocumentPosition(products);
  expect(saleTotalPosition & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  expect(ownTotalPosition & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(
    saleTotal.element().compareDocumentPosition(payments) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

test("hides the sale total when the sale is not known yet, and still shows the document's own amount", async () => {
  const detail = { ...authorizedReceiptDetail, ...unauthorizedReceipt, sale_total: null };
  const screen = await renderModal(
    servicesAnswering({ kind: "ok", value: detail }),
    unauthorizedReceipt,
  );

  await expect.element(screen.getByText("Total del comprobante", { exact: true })).toBeVisible();
  expect(screen.getByText("Total de la venta").query()).toBeNull();
});

test("shows each payment with its method and amount", async () => {
  const detail = {
    ...authorizedReceiptDetail,
    payments: [
      { method: "CASH" as const, card_type: null, amount: 1000000 },
      { method: "POINT" as const, card_type: "CREDIT" as const, amount: 750275 },
    ],
  };
  const screen = await renderModal(servicesAnswering({ kind: "ok", value: detail }));

  await expect.element(screen.getByText("Efectivo")).toBeVisible();
  await expect.element(screen.getByText("$ 10.000,00")).toBeVisible();
  await expect.element(screen.getByText("Point · Crédito")).toBeVisible();
  await expect.element(screen.getByText("$ 7.502,75")).toBeVisible();
});

test("shows an identified buyer with the document type and number", async () => {
  const detail = {
    ...authorizedReceiptDetail,
    buyer: {
      kind: "identified" as const,
      document_kind: "dni" as const,
      document_number: 12345678,
    },
  };
  const screen = await renderModal(servicesAnswering({ kind: "ok", value: detail }));

  await expect.element(screen.getByText("DNI 12345678")).toBeVisible();
});

test("lists the credit notes issued against a receipt", async () => {
  const screen = await renderModal(
    servicesAnswering({ kind: "ok", value: receiptDetailWithCreditNote }),
  );

  const list = screen.getByRole("list", { name: "Notas de crédito" });
  await expect.element(list.getByText("Nota de crédito C 00003-00000041")).toBeVisible();
  await expect.element(list.getByText("12/09/2026 · $ 3.200,00", { exact: true })).toBeVisible();
  await expect.element(list.getByText("Autorizado", { exact: true })).toBeVisible();
  expect(screen.getByText("Sin notas de crédito asociadas.").query()).toBeNull();
});

test("says a receipt has no credit notes associated when it has none", async () => {
  const screen = await renderModal(
    servicesAnswering({ kind: "ok", value: authorizedReceiptDetail }),
  );

  await expect.element(screen.getByText("Sin notas de crédito asociadas.")).toBeVisible();
});

test("says a document has no lines and no payments when its sale has none", async () => {
  const detail = { ...authorizedReceiptDetail, ...unauthorizedReceipt, lines: [], payments: [] };
  const screen = await renderModal(
    servicesAnswering({ kind: "ok", value: detail }),
    unauthorizedReceipt,
  );

  await expect.element(screen.getByText("Sin productos asociados.")).toBeVisible();
  await expect.element(screen.getByText("Sin pagos asociados.")).toBeVisible();
});

test("names the receipt a credit note corrects, and lists no credit notes of its own", async () => {
  const screen = await renderModal(
    servicesAnswering({ kind: "ok", value: creditNoteDetail }),
    creditNote,
  );

  await expect.element(screen.getByText("Corrige la Factura C 00003-00001246")).toBeVisible();
  expect(screen.getByText("Sin notas de crédito asociadas.").query()).toBeNull();
  expect(screen.getByRole("list", { name: "Notas de crédito" }).query()).toBeNull();
});

test("does not name a corrected receipt for a receipt", async () => {
  const screen = await renderModal(
    servicesAnswering({ kind: "ok", value: authorizedReceiptDetail }),
  );
  await expect.element(screen.getByText("Consumidor final")).toBeVisible();

  expect(screen.getByText(/Corrige la/).query()).toBeNull();
});

test("tells the document was not found", async () => {
  const screen = await renderModal(servicesAnswering({ kind: "not_found" }));

  await expect.element(screen.getByText("No encontramos ese comprobante")).toBeVisible();
});

test("offers to try again when the detail cannot be loaded", async () => {
  const services = servicesAnswering({ kind: "failed" });
  const screen = await renderModal(services);
  await expect.element(screen.getByText("No pudimos abrir el comprobante")).toBeVisible();

  vi.mocked(services.fetchIssuedFiscalDocument).mockResolvedValue({
    kind: "ok",
    value: authorizedReceiptDetail,
  });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("CAE 75123456789012")).toBeVisible();
});

test("reports an ended session", async () => {
  const onSessionEnded = vi.fn();

  await renderModal(servicesAnswering({ kind: "unauthenticated" }), authorizedReceipt, {
    onSessionEnded,
  });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("closes with Volver", async () => {
  const onClose = vi.fn();
  const screen = await renderModal(
    servicesAnswering({ kind: "ok", value: authorizedReceiptDetail }),
    authorizedReceipt,
    { onClose },
  );

  await userEvent.click(screen.getByRole("button", { name: "Volver" }));

  expect(onClose).toHaveBeenCalledTimes(1);
});
