import { codePointLength } from "../../shared/index.js";

export const CATEGORY_NAME_MAX_LENGTH = 100;

export function categoryNameLength(name: string): number {
  return codePointLength(name);
}

export function isCategoryNameTooLong(name: string): boolean {
  return categoryNameLength(name) > CATEGORY_NAME_MAX_LENGTH;
}
