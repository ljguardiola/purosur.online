import { z } from "zod";

export const saleCancelRefusalSchema = z.enum([
  "mercado_pago_charge_in_progress",
  "holds_mercado_pago_payment",
]);
