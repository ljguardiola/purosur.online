import { useRequestForm } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  EMPTY_RETURN_FORM,
  INVALID_REFUND_MESSAGE,
  RETURN_FIELDS,
  refundTextsFor,
  returnRequestFrom,
  returnRequestSchema,
} from "./return-form";
import { ReturnRefundsField } from "./return-refunds-field";
import { CASH, SALE, TRANSFER } from "./test-support/sale-for-return";

function RefundsForm({
  disabled = false,
  payments = SALE.payments,
}: {
  disabled?: boolean;
  payments?: typeof SALE.payments;
}) {
  const { form, submit, values } = useRequestForm({
    defaultValues: EMPTY_RETURN_FORM,
    request: {
      schema: returnRequestSchema,
      from: (formValues) => returnRequestFrom(SALE, 970_000, formValues),
    },
    fields: RETURN_FIELDS,
    messages: { refunds: INVALID_REFUND_MESSAGE },
    onSubmit: async () => {},
  });
  return (
    <>
      <form.AppField name="refunds">
        {() => (
          <ReturnRefundsField
            texts={refundTextsFor(payments, 970_000, values.refunds)}
            disabled={disabled}
          />
        )}
      </form.AppField>
      <button type="button" onClick={() => void submit()}>
        Completar
      </button>
    </>
  );
}

async function renderField(disabled?: boolean, payments?: typeof SALE.payments) {
  await page.viewport(1280, 900);
  onTestFinished(() => page.viewport(414, 896));
  return render(
    <RefundsForm
      {...(disabled === undefined ? {} : { disabled })}
      {...(payments === undefined ? {} : { payments })}
    />,
  );
}

describe("ReturnRefundsField", () => {
  it("names each payment with what it paid, filling in the refund of the one that can be refunded", async () => {
    const screen = await renderField();

    await expect.element(screen.getByText("Efectivo")).toBeVisible();
    await expect.element(screen.getByText("Pagó $ 15.000,00")).toBeVisible();
    await expect
      .element(screen.getByRole("textbox", { name: "Reintegro por Efectivo" }))
      .toHaveValue("9.700,00");
  });

  it("names the card type of a Point payment, in its name and its refund label", async () => {
    const screen = await renderField(false, [
      { ...TRANSFER, payment_id: "pay-point", method: "POINT", card_type: "DEBIT" },
    ]);

    await expect.element(screen.getByText("Point · Débito", { exact: true })).toBeVisible();
    await expect
      .element(screen.getByRole("textbox", { name: "Reintegro por Point · Débito" }))
      .toBeInTheDocument();
  });

  it("lets an amount be typed in a payment that is not cash", async () => {
    const screen = await renderField();
    const transfer = screen.getByRole("textbox", { name: "Reintegro por Transferencia" });

    await expect.element(transfer).not.toHaveAttribute("readonly");
    await userEvent.fill(transfer, "1.000,00");
    await expect.element(transfer).toHaveValue("1.000,00");
  });

  it("locks a payment with nothing left to give back, saying why", async () => {
    const screen = await renderField(false, [
      CASH,
      { ...TRANSFER, eligible: false, ineligible_reason: "nothing_left" },
    ]);
    const transfer = screen.getByRole("textbox", { name: "Reintegro por Transferencia" });

    await expect.element(transfer).toHaveAttribute("readonly");
    await expect
      .element(transfer)
      .toHaveAccessibleDescription("Este pago ya se reintegró completo");
  });

  it("says on the payment that an amount typed badly is not one", async () => {
    const screen = await renderField();
    const cash = screen.getByRole("textbox", { name: "Reintegro por Efectivo" });

    await userEvent.fill(cash, "diez");
    await userEvent.click(screen.getByRole("button", { name: "Completar" }));

    await expect.element(screen.getByText(INVALID_REFUND_MESSAGE)).toBeVisible();
    await expect.element(cash).toHaveAttribute("aria-invalid", "true");
  });

  it("does not let the amount change while it is disabled", async () => {
    const screen = await renderField(true);

    await expect
      .element(screen.getByRole("textbox", { name: "Reintegro por Efectivo" }))
      .toBeDisabled();
  });

  it("has no accessibility violations", async () => {
    const screen = await renderField();

    await expectNoAccessibilityViolations(screen.container);
  });
});
