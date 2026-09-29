export function roleFieldMessage({ roleId }: { roleId: string }): string {
  return roleId === "" ? "Elegí un rol." : "Ese rol ya no está disponible. Elegí otro.";
}
