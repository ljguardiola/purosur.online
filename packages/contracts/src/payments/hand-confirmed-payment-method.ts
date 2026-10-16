import { CONFIRMED_BY_HAND_METHODS } from "@purosur/domain";
import { z } from "zod";

export const handConfirmedPaymentMethodSchema = z.enum(CONFIRMED_BY_HAND_METHODS);
