import { codePointLength } from "../../shared/index.js";

export const BRAND_NAME_MAX_LENGTH = 100;

export function brandNameLength(name: string): number {
  return codePointLength(name);
}

export function isBrandNameTooLong(name: string): boolean {
  return brandNameLength(name) > BRAND_NAME_MAX_LENGTH;
}
