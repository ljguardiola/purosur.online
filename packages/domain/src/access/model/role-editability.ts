export function isRoleEditable(role: { isAdministrator: boolean }): boolean {
  return !role.isAdministrator;
}
