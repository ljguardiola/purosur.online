import { handConfirmedPaymentMethodSchema } from "@purosur/contracts";
import { paymentMethodLabel } from "../platform/payment-method-label";

export const METHOD_OPTIONS = [
  { value: "ALL", label: "Todos" },
  ...handConfirmedPaymentMethodSchema.options.map((method) => ({
    value: method,
    label: paymentMethodLabel(method),
  })),
] as const;
