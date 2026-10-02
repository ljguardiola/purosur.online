const ADMINISTRATOR_ROLE_NAME = "Administrador";

// The Administrator role's own `name` is stored empty; it is shown by its fixed name instead.
export function roleDisplayName(role: { isAdministrator: boolean; name: string | null }): string {
  return role.isAdministrator ? ADMINISTRATOR_ROLE_NAME : (role.name ?? "");
}
