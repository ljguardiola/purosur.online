export function NavigationRail({ firstName }: { firstName: string }) {
  return (
    <aside
      aria-label="Persona en la caja"
      className="flex h-full w-22 shrink-0 flex-col justify-end overflow-hidden bg-surface-soft p-2"
    >
      <p className="truncate text-center text-detail font-bold text-text">{firstName}</p>
    </aside>
  );
}
