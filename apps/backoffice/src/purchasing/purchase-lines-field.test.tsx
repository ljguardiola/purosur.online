import { purchaseRegistrationBodySchema } from "@purosur/contracts";
import { FieldSizeProvider, useRequestForm } from "@purosur/ui";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { ADMINISTRATOR_ACCESS } from "../shell/test-support/backoffice-access";
import {
  emptyPurchaseForm,
  PURCHASE_FIELDS,
  purchaseLinesMessage,
  purchaseRegistrationRequestFrom,
} from "./purchase-form";
import { PurchaseLinesField } from "./purchase-lines-field";
import { purchaseChoicesFrom } from "./test-support/purchases";

const { products, packagings } = purchaseChoicesFrom([]);

function Harness() {
  const { form } = useRequestForm({
    defaultValues: emptyPurchaseForm(null),
    request: {
      schema: purchaseRegistrationBodySchema,
      from: (current) => purchaseRegistrationRequestFrom(current, products),
    },
    fields: PURCHASE_FIELDS,
    messages: { lines: (current) => purchaseLinesMessage(current, products) },
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
