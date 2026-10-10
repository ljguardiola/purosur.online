import { z } from "zod";

export const saleCancelRefusalSchema = z.enum(["qr_charge_in_progress", "holds_qr_payment"]);
