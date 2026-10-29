import { purchaseRegistrationBodySchema } from "@purosur/contracts";
import { FieldSizeProvider, useRequestForm } from "@purosur/ui";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { ADMINISTRATOR_ACCESS } from "../shell/test-support/backoffice-access";
import { render } from "../shell/test-support/render-with-router";
import {
  emptyPurchaseForm,
  PURCHASE_FIELDS,
  PURCHASE_RECEIPT_TYPE_REQUIRED,
  PURCHASE_SUPPLIER_REQUIRED,
  purchaseDateMessage,
  purchaseLinesMessage,
  purchaseNoteMessage,
  purchaseReceiptNumberMessage,
  purchaseRegistrationRequestFrom,
} from "./purchase-form";
import { PurchaseLinesField } from "./purchase-lines-field";
import { aceiteDeAlmendras } from "./test-support/packagings";
import { purchaseChoicesFrom } from "./test-support/purchases";

const { products: offeredProducts, packagings } = purchaseChoicesFrom([]);

function Harness({ products = offeredProducts }: { products?: typeof offeredProducts }) {
  const { form } = useRequestForm({
    defaultValues: emptyPurchaseForm(null),
    request: {
      schema: purchaseRegistrationBodySchema,
      from: (current) => purchaseRegistrationRequestFrom(current, products),
    },
    fields: PURCHASE_FIELDS,
    messages: {
      supplierId: PURCHASE_SUPPLIER_REQUIRED,
      purchasedOn: purchaseDateMessage,
      receiptType: PURCHASE_RECEIPT_TYPE_REQUIRED,
      receiptNumber: purchaseReceiptNumberMessage,
      note: purchaseNoteMessage,
      lines: (current) => purchaseLinesMessage(current, products),
    },
    onSubmit: async () => {},
  });
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <form.AppField name="lines">
          {() => (
            <PurchaseLinesField
              access={ADMINISTRATOR_ACCESS}
              products={products}
              packagings={packagings}
              refusals={{}}
              onLinesChange={() => {}}
              services={{ createPackaging: vi.fn() }}
              onSessionEnded={() => {}}
            />
          )}
        </form.AppField>
      </main>
    </FieldSizeProvider>
  );
}

test("asks for a keyboard with the decimal comma for a line's cost", async () => {
  const screen = await render(<Harness />);

  await expect
    .element(screen.getByRole("textbox", { name: /^Costo por/ }))
    .toHaveAttribute("inputmode", "decimal");
});

test("lists each product with its brand name and net content", async () => {
  const screen = await render(<Harness products={[...offeredProducts, aceiteDeAlmendras]} />);

  await userEvent.click(screen.getByRole("combobox", { name: /^Producto/ }));

  await expect
    .element(screen.getByRole("option", { name: "Aceite de Almendras Vitora 30 ml" }))
    .toBeVisible();
  await expect.element(screen.getByRole("option", { name: "Avena arrollada" })).toBeVisible();
});
