export function sessionEyebrow(registerName: string | null): string {
  return registerName === null ? "Sin sesión abierta" : `${registerName} · Sin sesión abierta`;
}
