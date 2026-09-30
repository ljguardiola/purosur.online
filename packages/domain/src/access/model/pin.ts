export const PIN_MIN_DIGITS = 6;

const ACCEPTABLE_PIN = new RegExp(`^[0-9]{${PIN_MIN_DIGITS},}$`);

export function isAcceptablePin(pin: string): boolean {
  return ACCEPTABLE_PIN.test(pin);
}
