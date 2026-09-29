import { isAdministratorRoleName, isRoleNameTooLong, ROLE_NAME_MAX_LENGTH } from "@purosur/domain";

export function roleNameMessage({ name }: { name: string }): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    return "Ingresá el nombre del rol.";
  }
  if (isRoleNameTooLong(trimmed)) {
    return `El nombre puede tener hasta ${ROLE_NAME_MAX_LENGTH} caracteres.`;
  }
  if (isAdministratorRoleName(trimmed)) {
    return "Ese nombre es del Administrador; elegí otro.";
  }
  return "Revisá el nombre del rol.";
}
