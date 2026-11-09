export type RegisterModalContextSource = {
  name: string;
  installation: { hostname: string } | null;
};

export function registerModalContext(register: RegisterModalContextSource | null): string {
  if (register === null) {
    return "";
  }
  return register.installation === null
    ? register.name
    : `${register.name} · ${register.installation.hostname}`;
}
