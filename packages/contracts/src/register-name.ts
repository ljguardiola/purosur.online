import { codePointLength } from "./code-point-length.js";

export const REGISTER_NAME_MAX_LENGTH = 100;

export function registerNameLength(name: string): number {
  return codePointLength(name);
}

export function isRegisterNameTooLong(name: string): boolean {
  return registerNameLength(name) > REGISTER_NAME_MAX_LENGTH;
}
