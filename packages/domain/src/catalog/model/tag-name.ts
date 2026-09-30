import { codePointLength } from "../../shared/index.js";

export const TAG_NAME_MAX_LENGTH = 100;

export function tagNameLength(name: string): number {
  return codePointLength(name);
}

export function isTagNameTooLong(name: string): boolean {
  return tagNameLength(name) > TAG_NAME_MAX_LENGTH;
}
