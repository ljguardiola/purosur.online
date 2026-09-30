import { Eyebrow } from "./eyebrow";

export function SessionEyebrow({ registerName }: { registerName: string | null }) {
  return (
    <Eyebrow
      text={registerName === null ? "Sin sesión abierta" : `${registerName} · Sin sesión abierta`}
    />
  );
}
