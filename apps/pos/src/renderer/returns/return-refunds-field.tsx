import { fieldErrorMessage, formatCents, TextField, useFieldContext } from "@purosur/ui";
import { paidPaymentName } from "../platform/payment-method-names";
import type { PaymentRefundText, ReturnFormValues } from "./return-form";
import { isRefundTextInvalid } from "./return-form";
import { paymentIneligibleText } from "./return-text";

export type ReturnRefundsFieldProps = {
  texts: readonly PaymentRefundText[];
  disabled: boolean;
};

export function ReturnRefundsField({ texts, disabled }: ReturnRefundsFieldProps) {
  const field = useFieldContext<ReturnFormValues["refunds"]>();
  const message = fieldErrorMessage(field.state.meta.errors);

  return (
    <ul className="flex flex-col gap-4">
      {texts.map(({ payment, text }) => {
        const name = paidPaymentName(payment.method, payment.card_type);
        const label = `Reintegro por ${name}`;
        return (
          <li key={payment.payment_id} className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col">
              <span className="text-body font-bold text-text">{name}</span>
              <span className="text-detail text-text-subtle">
                {`Pagó ${formatCents(payment.amount)}`}
              </span>
            </div>
            <div className="w-44 shrink-0">
              {payment.ineligible_reason === null ? (
                <TextField
                  kind="amount"
                  prefix="$"
                  label={label}
                  labelVisuallyHidden
                  inputMode="decimal"
                  value={text}
                  disabled={disabled}
                  errorMessage={
                    message !== undefined && isRefundTextInvalid(text) ? message : undefined
                  }
                  onChange={(value) =>
                    field.handleChange({ ...field.state.value, [payment.payment_id]: value })
                  }
                />
              ) : (
                <TextField
                  kind="plain-text"
                  label={label}
                  labelVisuallyHidden
                  value={formatCents(0)}
                  onChange={() => {}}
                  readOnly
                  readOnlyReason={paymentIneligibleText(payment.ineligible_reason)}
                />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
