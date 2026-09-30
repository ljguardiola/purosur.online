export function SessionEyebrow({ registerName }: { registerName: string | null }) {
  return (
    <p className="text-caption font-bold text-text-eyebrow uppercase tracking-sm">
      {registerName === null ? "Sin sesión abierta" : `${registerName} · Sin sesión abierta`}
    </p>
  );
}
