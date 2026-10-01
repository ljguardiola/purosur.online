import { newPinSchema, PIN_MIN_DIGITS, pinCodeRedemptionBodySchema } from "@purosur/contracts";

export const pinRedemptionRequestSchema = pinCodeRedemptionBodySchema
  .extend({ new_pin: newPinSchema, repeat: pinCodeRedemptionBodySchema.shape.new_pin })
  .refine(({ new_pin, repeat }) => repeat === new_pin, { path: ["repeat"] });

export const CODE_MESSAGE = "Revisá el código: son 16 letras y números.";
export const PIN_MESSAGE = `El PIN tiene que tener al menos ${PIN_MIN_DIGITS} dígitos, solo números.`;
export const REPEAT_MESSAGE = "Los dos PIN no coinciden.";

export type PinRedemptionFormValues = { code: string; newPin: string; repeat: string };

export const EMPTY_PIN_REDEMPTION_FORM: PinRedemptionFormValues = {
  code: "",
  newPin: "",
  repeat: "",
};

export function pinRedemptionRequestFrom({ code, newPin, repeat }: PinRedemptionFormValues): {
  reset_code: string;
  new_pin: string;
  repeat: string;
} {
  return { reset_code: code, new_pin: newPin, repeat };
}
