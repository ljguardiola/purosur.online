import { codePointLength } from "../../shared/index.js";

export const DISCOUNT_NAME_MAX_LENGTH = 100;

export function discountNameLength(name: string): number {
  return codePointLength(name);
}

export function isDiscountNameTooLong(name: string): boolean {
  return discountNameLength(name) > DISCOUNT_NAME_MAX_LENGTH;
}
