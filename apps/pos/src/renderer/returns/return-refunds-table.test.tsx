import { useRequestForm } from "@purosur/ui";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import {
  EMPTY_RETURN_FORM,
  INVALID_REFUND_MESSAGE,
  RETURN_FIELDS,
  returnRequestFrom,
  returnRequestSchema,
} from "./return-form";
import type { ReturnRefundsTableProps } from "./return-refunds-table";
import { ReturnRefundsTable } from "./return-refunds-table";
import { CASH, SALE, TRANSFER } from "./test-support/sale-for-return";

type Harness = Partial<ReturnRefundsTableProps> & {
  refunds?: Readonly<Record<string, string>>;
  onRefundsChange?: (refunds: Readonly<Record<string, string>>) => void;
};

function RefundsForm({ refunds = {}, onRefundsChange = () => {}, ...props }: Harness) {
  const { form, submit } = useRequestForm({
    defaultValues: { ...EMPTY_RETURN_FORM, refunds },
    request: {
      schema: returnRequestSchema,
      from: (formValues) => returnRequestFrom(SALE, 1_393_500, formValues),
    },
    fields: RETURN_FIELDS,
    messages: { refunds: INVALID_REFUND_MESSAGE },
    onSubmit: async () => {},
  });
  return (
    <div style={{ height: 500, width: 900 }}>
      <form.AppField name="refunds" listeners={{ onChange: ({ value }) => onRefundsChange(value) }}>
        {() => (
          <ReturnRefundsTable
            sale={SALE}
            refundableTotal={1_393_500}
            selectedIndex={0}
            legend={[]}
            notice={undefined}
            onSelect={() => {}}
            {...props}
          />
        )}
      </form.AppField>
      <button type="button" onClick={() => void submit()}>
        Completar
      </button>
    </div>
  );
}

function renderTable(props: Harness = {}) {
  return render(<RefundsForm {...props} />);
}

function table(screen: Awaited<ReturnType<typeof renderTable>>) {
  return screen.getByRole("table", { name: "Reintegro por medio de pago" });
}

describe("ReturnRefundsTable", () => {
  it("lists each method that can be refunded with when it is refunded, the first holding the whole refund", async () => {
    const screen = await renderTable();

    await expect.element(table(screen).getByText("En el acto")).toBeVisible();
    await expect.element(table(screen).getByText("Reembolso pendiente")).toBeVisible();
    await expect
      .element(table(screen).getByRole("textbox", { name: "Efectivo" }))
      .toHaveValue("13.935,00");
    await expect
      .element(table(screen).getByRole("textbox", { name: "Transferencia" }))
      .toHaveValue("");
  });

  it("leaves out a payment that cannot be refunded", async () => {
    const screen = await renderTable({
      sale: {
        ...SALE,
        payments: [CASH, { ...TRANSFER, eligible: false, ineligible_reason: "nothing_left" }],
      },
    });

    await expect.element(table(screen).getByRole("textbox", { name: "Efectivo" })).toBeVisible();
    await expect
      .element(table(screen).getByRole("textbox", { name: "Transferencia" }))
      .not.toBeInTheDocument();
  });

  it("shows what was typed for each payment", async () => {
    const screen = await renderTable({
      refunds: { [CASH.payment_id]: "3.000,00", [TRANSFER.payment_id]: "10.935,00" },
    });

    await expect
      .element(table(screen).getByRole("textbox", { name: "Efectivo" }))
      .toHaveValue("3.000,00");
    await expect
      .element(table(screen).getByRole("textbox", { name: "Transferencia" }))
      .toHaveValue("10.935,00");
  });

  it("keeps the amount typed for each payment by the payment's id", async () => {
    const onRefundsChange = vi.fn();
    const screen = await renderTable({ onRefundsChange });

    await userEvent.type(table(screen).getByRole("textbox", { name: "Transferencia" }), "5");

    expect(onRefundsChange).toHaveBeenLastCalledWith({ [TRANSFER.payment_id]: "5" });
    await expect
      .element(table(screen).getByRole("textbox", { name: "Transferencia" }))
      .toHaveValue("5");
  });

  it("shows the notice it is given in red", async () => {
    const screen = await renderTable({ notice: "Lo que se reintegra no suma." });

    await expect
      .element(screen.getByRole("alert").filter({ hasText: "Lo que se reintegra no suma." }))
      .toBeVisible();
  });

  it("marks invalid the amount that cannot be read once the form is sent, with the field's message", async () => {
    const screen = await renderTable({
      refunds: { [CASH.payment_id]: "99.999.999.999.999.999.999,00" },
    });
    await expect
      .element(table(screen).getByRole("textbox", { name: "Efectivo" }))
      .not.toHaveAttribute("aria-invalid");

    await userEvent.click(screen.getByRole("button", { name: "Completar" }));

    await expect
      .element(table(screen).getByRole("textbox", { name: "Efectivo" }))
      .toHaveAttribute("aria-invalid", "true");
    await expect
      .element(table(screen).getByRole("textbox", { name: "Transferencia" }))
      .not.toHaveAttribute("aria-invalid");
    await expect
      .element(
        screen
          .getByRole("alert")
          .filter({ hasText: "Ingresá un importe válido, por ejemplo 1.500,00." }),
      )
      .toBeVisible();
  });
});
