export interface AdministratorRoleHolder {
  holdsAdministratorRole: boolean;
}

export function isLastActiveAdministrator(
  holder: AdministratorRoleHolder,
  activeAdministratorCount: number,
): boolean {
  return holder.holdsAdministratorRole && activeAdministratorCount === 1;
}
