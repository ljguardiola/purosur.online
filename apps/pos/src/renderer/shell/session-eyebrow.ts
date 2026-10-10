export function sessionEyebrow(registerName: string | null, sessionOpen: boolean): string {
  const session = sessionOpen ? "Sesión abierta" : "Sin sesión abierta";
  return registerName === null ? session : `${registerName} · ${session}`;
}
