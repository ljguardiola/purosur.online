export function ReadyScreen({ registerName }: { registerName: string | null }) {
  return (
    <main>
      {registerName === null ? null : (
        <h1 className="text-display text-text-accent">{registerName}</h1>
      )}
      <p>Puro Sur está listo</p>
    </main>
  );
}
