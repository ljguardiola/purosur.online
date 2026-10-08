import { codePointLength } from "../../shared/index.js";

export const ROLE_NAME_MAX_LENGTH = 100;

export function roleNameLength(name: string): number {
  return codePointLength(name);
}

export function isRoleNameTooLong(name: string): boolean {
  return roleNameLength(name) > ROLE_NAME_MAX_LENGTH;
}

const ADMINISTRATOR_ROLE_NAME = "administrador";

export function isAdministratorRoleName(name: string): boolean {
  return name.toLowerCase() === ADMINISTRATOR_ROLE_NAME;
}
